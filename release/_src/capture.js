// Captures game scenes for store screenshots. Run:
//   NODE_PATH=/opt/node-tools/node_modules node release/_src/capture.js
// Needs a static server on :8765 serving the repo root (python3 -m http.server 8765).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const R = require(path.join(__dirname, '..', '..', 'js', 'rules.js'));
const OUT = path.join(__dirname, 'raw');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.GAME_URL || 'http://127.0.0.1:8765/index.html';
const PROFILES = {
  vkp: [400, 800, 1.5],   // 600x1200
  land: [960, 540, 2],    // 1920x1080
  port: [540, 960, 2],    // 1080x1920
  phone: [390, 844, 3]    // art source
};
const SCENES = {
  tutorial: null,                       // fresh game, level 1
  mid: ['19', '20', 's' + '3'.repeat(19)],
  late: ['69', '70', 's' + '3'.repeat(69)]
};
(async () => {
  const browser = await chromium.launch();
  for (const [pname, [w, h, dsf]] of Object.entries(PROFILES)) {
    for (const [lang, locale] of [['ru', 'ru-RU'], ['en', 'en-US']]) {
      const open = async (state) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale });
        const page = await ctx.newPage();
        await page.goto(URL);
        await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
        if (state) {
          await page.evaluate((s) => bridge.storage.set(['os_unlocked', 'os_level', 'os_stars'], [s[1], s[0], s[2]]), state);
          await page.reload();
          await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
        }
        return [ctx, page];
      };
      const shot = (page, name) => page.screenshot({ path: `${OUT}/${pname}-${lang}-${name}.png` });
      // title + tutorial
      let [ctx, page] = await open(null);
      await shot(page, 'title');
      await page.click('#btn-play', { force: true });
      await page.waitForTimeout(1800);
      await shot(page, 'tutorial');
      await ctx.close();
      // mid / late (+ win from mid)
      for (const [name, st] of Object.entries(SCENES)) {
        if (!st) continue;
        [ctx, page] = await open(st);
        await page.click('#btn-play', { force: true });
        await page.waitForTimeout(900);
        const d0 = await page.evaluate(() => OSGame.debug());
        const r0 = d0.rects[1];
        await page.mouse.click(r0.x + r0.w / 2, r0.y + r0.h / 2);
        await page.waitForTimeout(400);
        await shot(page, name);
        await page.mouse.click(r0.x + r0.w / 2, r0.y + r0.h / 2);
        await page.waitForTimeout(200);
        if (name === 'mid') {
          await page.click('#btn-levels');
          await page.waitForTimeout(500);
          await shot(page, 'levels');
          await page.click('#btn-close-levels');
          await page.waitForTimeout(300);
          const d = await page.evaluate(() => OSGame.debug());
          const sol = R.solve(d.boxes, d.cap);
          for (const [a, b] of sol) for (const idx of [a, b]) { const r = d.rects[idx]; await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(25); }
          await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 10000 });
          await page.waitForTimeout(1300);
          await shot(page, 'win');
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log('ok');
})();
