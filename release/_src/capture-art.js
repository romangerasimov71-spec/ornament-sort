// Clean art plates (no HUD, nothing selected) for icons and covers.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'raw');
const URL = process.env.GAME_URL || 'http://127.0.0.1:8765/index.html';
const PLATES = { artland: [1000, 640, 2], artport: [540, 960, 2] };
(async () => {
  const browser = await chromium.launch();
  for (const [n, [w, h, dsf]] of Object.entries(PLATES)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale: 'en-US' });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
    await page.evaluate(() => bridge.storage.set(['os_unlocked', 'os_level', 'os_stars'], ['20', '19', 's' + '3'.repeat(19)]));
    await page.reload();
    await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
    await page.click('#btn-play', { force: true });
    await page.waitForTimeout(1200);
    await page.addStyleTag({ content: '#btn-settings,#level-label,#btn-levels,#btn-undo,#btn-restart,#hint-chip,#btn-extra,#moves-label,.hud{display:none!important}' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${n}.png` });
    await ctx.close();
  }
  await browser.close();
})();
