#!/usr/bin/env python3
"""Builds store icons, covers and screenshots from raw game captures (raw/*.png).
Run: python3 release/_src/compose.py   (after capture.js and capture-art.js)"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
REL = os.path.dirname(HERE)
FONT = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'
FONT2 = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
TITLES = {'ru': ('Новогодняя сортировка', 'Разложи ёлочные шары по цветам'),
          'en': ('Ornament Sort', 'Sort the glass ornaments by color')}
LAND = Image.open(os.path.join(RAW, 'artland.png')).convert('RGB')  # 2000x1280


def out(*parts):
    p = os.path.join(REL, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def crop_scale(img, box, size):
    return img.crop(box).resize(size, Image.LANCZOS)


def fit_font(path, text, max_w, start):
    s = start
    while s > 10:
        f = ImageFont.truetype(path, s)
        if f.getlength(text) <= max_w:
            return f
        s -= 2
    return ImageFont.truetype(path, 10)


def draw_text(im, text, center, font, fill=(255, 255, 255), stroke=(11, 23, 64), sw=None):
    W, H = im.size
    sw = sw or max(2, font.size // 11)
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((center[0], center[1] + sw), text, font=font, anchor='mm', fill=(0, 0, 0, 170), stroke_width=sw, stroke_fill=(0, 0, 0, 170))
    layer = layer.filter(ImageFilter.GaussianBlur(max(2, font.size // 22)))
    im.paste(layer, (0, 0), layer)
    d = ImageDraw.Draw(im)
    d.text(center, text, font=font, anchor='mm', fill=fill, stroke_width=sw, stroke_fill=stroke)


def cover(size, box, lang, text_y, scale_title=0.82, sub=True, narrow=False):
    """size=(w,h); box = crop of LAND; text centred at fraction text_y of height."""
    im = crop_scale(LAND, box, size)
    W, H = size
    t, s = TITLES[lang]
    # title may wrap to two words per line on narrow canvases
    if narrow and lang == 'ru':
        lines = ['Новогодняя', 'сортировка']
    elif narrow:
        lines = ['Ornament', 'Sort']
    else:
        lines = [t]
    mw = W * scale_title
    f = min((fit_font(FONT, l, mw, int(H * 0.2)) for l in lines), key=lambda x: x.size)
    y = H * text_y
    lh = f.size * 1.08
    y0 = y - lh * (len(lines) - 1) / 2
    for i, l in enumerate(lines):
        draw_text(im, l, (W / 2, y0 + i * lh), f)
    if sub:
        f2 = fit_font(FONT2, s, W * 0.8, int(f.size * 0.32))
        draw_text(im, s, (W / 2, y0 + (len(lines) - 1) * lh + f.size * 0.85), f2, fill=(255, 244, 214), sw=max(2, f2.size // 10))
    return im


# crop windows on LAND (2000x1280)
BOX_LAND = lambda w, h, y=100: (0, y, 2000, y + int(2000 * h / w))
ICON_BOX = (175, 390, 875, 1090)
PORT_BOX = (400, 0, 1120, 1280)

for lang in ('ru', 'en'):
    # --- covers / snippets
    cover((1920, 1080), BOX_LAND(16, 9), lang, 0.135, 0.6).save(out('playgama', 'assets', f'cover-landscape-1920x1080-{lang}.png'))
    cover((1080, 1920), PORT_BOX, lang, 0.2, 0.86, narrow=True).save(out('playgama', 'assets', f'cover-portrait-1080x1920-{lang}.png'))
    cover((1120, 630), BOX_LAND(16, 9), lang, 0.135, 0.6).save(out('vk', 'assets', f'snippet-1120x630-{lang}.png'))
    cover((800, 470), BOX_LAND(800, 470, 60), lang, 0.17, 0.62, sub=False).save(out('yandex', 'assets', f'cover-800x470-{lang}.png'))

# --- icons (no text)
icon = crop_scale(LAND, ICON_BOX, (800, 800))
icon.save(out('playgama', 'assets', 'icon-800x800.png'))
icon.resize((576, 576), Image.LANCZOS).save(out('vk', 'assets', 'icon-576x576.png'))
icon.resize((512, 512), Image.LANCZOS).save(out('yandex', 'assets', 'icon-512x512.png'))
# favicon: simplified (one ornament) so it reads at 32px
fav = Image.new('RGB', (32, 32), (14, 28, 70))
big = crop_scale(LAND, (170, 475, 310, 615), (256, 256))  # one ornament + box top, from the plate
fav = big.resize((32, 32), Image.LANCZOS)
fav.save(out('vk', 'assets', 'favicon-32x32.png'), optimize=True)
icon.resize((128, 128), Image.LANCZOS).save(out('ok', 'assets', 'icon-128x128.png'))
icon.resize((256, 256), Image.LANCZOS).save(out('ok', 'assets', 'icon-256x256.png'))

# --- screenshots
def shot(profile, lang, name):
    return Image.open(os.path.join(RAW, f'{profile}-{lang}-{name}.png')).convert('RGB')

SCENES = ['tutorial', 'mid', 'late', 'win', 'levels']
for lang in ('ru', 'en'):
    for i, sc in enumerate(SCENES, 1):
        shot('vkp', lang, sc).save(out('vk', 'assets', 'screenshots', f'{i}-{sc}-600x1200-{lang}.png'), optimize=True)
        for orient, prof, size in (('landscape', 'land', (1920, 1080)), ('portrait', 'port', (1080, 1920))):
            im = shot(prof, lang, sc)
            assert im.size == size, (im.size, size)
            im.save(out('playgama', 'assets', 'screenshots', f'{i}-{sc}-{orient}-{size[0]}x{size[1]}-{lang}.jpg'), quality=90)
            if sc != 'levels':
                small = (1280, 720) if orient == 'landscape' else (720, 1280)
                im.resize(small, Image.LANCZOS).save(out('yandex', 'assets', 'screenshots', f'{i}-{sc}-{orient}-{small[0]}x{small[1]}-{lang}.jpg'), quality=90)
print('done')
