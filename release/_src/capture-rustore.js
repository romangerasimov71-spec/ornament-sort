// RuStore screenshots: phone portrait 1080x1920 PNG, Russian, Android app mode (no ad buttons).
//   node tools/build-release.js && (cd dist/ornament-sort && python3 -m http.server 8766 &)
//   GAME_URL=http://127.0.0.1:8766/index.html NODE_PATH=/opt/node-tools/node_modules node release/_src/capture-rustore.js
const { chromium } = require('playwright');
const path = require('path');
const R = require(path.join(__dirname, '..', '..', 'js', 'rules.js'));
const OUT = path.join(__dirname, '..', 'rustore', 'screenshots');
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.GAME_URL || 'http://127.0.0.1:8766/index.html';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 OrnamentSortAndroid/1.0.1';

(async () => {
  const browser = await chromium.launch();
  const open = async (state) => {
    const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, locale: 'ru-RU', userAgent: UA, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
    if (state) {
      await page.evaluate((s) => bridge.storage.set(['os_unlocked', 'os_level', 'os_stars'], [s[1], s[0], s[2]]), state);
      await page.reload();
      await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
    }
    await page.click('#btn-play', { force: true });
    return [ctx, page];
  };
  const shot = async (page, name) => {
    if (await page.isVisible('#btn-extra')) throw new Error('ad button visible on ' + name);
    await page.screenshot({ path: `${OUT}/${name}-1080x1920.png` });
  };
  const tap = async (page, idx) => {
    const r = (await page.evaluate(() => OSGame.debug())).rects[idx];
    await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  };

  let [ctx, page] = await open(null);
  await page.waitForTimeout(1800);
  await shot(page, '1-tutorial');
  await ctx.close();

  for (const [name, st, win] of [['2-mid', ['19', '20', 's' + '3'.repeat(19)], true], ['3-late', ['69', '70', 's' + '3'.repeat(69)], false]]) {
    [ctx, page] = await open(st);
    await page.waitForTimeout(900);
    await tap(page, 1);
    await page.waitForTimeout(400);
    await shot(page, name);
    await tap(page, 1);
    await page.waitForTimeout(200);
    if (win) {
      const d = await page.evaluate(() => OSGame.debug());
      const sol = R.solve(d.boxes, d.cap);
      for (const [a, b] of sol) for (const idx of [a, b]) { const r = d.rects[idx]; await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(25); }
      await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 10000 });
      await page.waitForTimeout(1300);
      await shot(page, '4-win');
    }
    await ctx.close();
  }
  await browser.close();
  console.log('ok');
})();
