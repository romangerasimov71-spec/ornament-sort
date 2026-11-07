// Plays all 85 levels in the browser via clicks (solver moves), checks the last-level flow.
const { chromium } = require('playwright');
const R = require(require('path').join(__dirname, '..', 'js', 'rules.js'));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto((process.env.GAME_URL || 'http://127.0.0.1:8765/index.html'));
  await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  await page.click('#btn-play', { force: true });
  await page.waitForTimeout(300);
  let total = 0;
  for (let lv = 1; lv <= 85; lv++) {
    const d = await page.evaluate(() => OSGame.debug());
    if (d.level !== lv) { console.log('expected level', lv, 'got', d.level); break; }
    const sol = R.solve(d.boxes, d.cap);
    for (const [a, b] of sol) for (const idx of [a, b]) { const r = d.rects[idx]; await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); }
    total += sol.length;
    await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 10000 });
    await page.click('#btn-next');
    await page.waitForTimeout(80);
  }
  const d = await page.evaluate(() => OSGame.debug());
  console.log('played 85 levels,', total, 'moves; after last Next: level window open =', await page.isVisible('#levels-modal'), 'unlocked', d.save.unlocked, 'errors', errs.length, errs.slice(0, 3).join('|'));
  await browser.close();
})();
