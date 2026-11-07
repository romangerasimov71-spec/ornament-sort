// Final screenshots + overlap checks. Language RU via locale (mock platform falls back to browser language).
const { chromium } = require('playwright');
const R = require(require('path').join(__dirname, '..', 'js', 'rules.js'));
const OUT = __dirname + '/out';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = (process.env.GAME_URL || 'http://127.0.0.1:8765/index.html');
(async () => {
  const browser = await chromium.launch();
  const res = [];
  for (const [w, h, name] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [800, 800, 'square'], [1366, 768, 'desktop'], [360, 640, 'small']]) {
    for (const locale of ['ru-RU', 'en-US']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      const tag = `${name}-${locale.slice(0, 2)}`;
      await page.goto(URL);
      await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
      await page.evaluate(() => bridge.storage.set(['os_unlocked', 'os_level', 'os_stars'], ['14', '13', 's332333232333']));
      await page.reload();
      await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
      await page.screenshot({ path: `${OUT}/${tag}-title.png` });
      await page.click('#btn-play', { force: true });
      await page.waitForTimeout(500);
      // select one box so a lifted ornament shows
      let d = await page.evaluate(() => OSGame.debug());
      const r0 = d.rects[1];
      await page.mouse.click(r0.x + r0.w / 2, r0.y + r0.h / 2);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${tag}-gameplay.png` });
      // overlap check of HUD pieces and boxes
      const ov = await page.evaluate(() => {
        const ids = ['btn-settings', 'level-label', 'btn-levels', 'btn-undo', 'btn-restart', 'hint-chip', 'btn-extra'];
        const rects = ids.map(id => { const e = document.getElementById(id); if (!e || e.offsetParent === null || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom }; }).filter(Boolean);
        OSGame.debug().rects.forEach((b, i) => rects.push({ id: 'box' + i, l: b.x, t: b.y - b.w * 0.9, r: b.x + b.w, b: b.y + b.h }));
        const bad = [];
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], c = rects[j];
          if (a.id.startsWith('box') && c.id.startsWith('box')) continue;
          if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) bad.push(a.id + '/' + c.id);
        }
        rects.forEach(a => { if (a.l < -1 || a.t < -1 || a.r > innerWidth + 1 || a.b > innerHeight + 1) bad.push(a.id + ' off-screen'); });
        return bad;
      });
      res.push((ov.length ? 'FAIL ' : 'PASS ') + `${tag} gameplay: no overlap/clipping ${ov.join(', ')}`);
      await page.mouse.click(r0.x + r0.w / 2, r0.y + r0.h / 2);
      await page.click('#btn-levels');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${tag}-levels.png` });
      const fit = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }, sel);
      res.push(((await fit('.levels-card')) && (await fit('#btn-close-levels')) ? 'PASS ' : 'FAIL ') + `${tag} level window fits`);
      await page.click('#btn-close-levels');
      await page.click('#btn-settings');
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${tag}-settings.png` });
      res.push(((await fit('.settings-card')) && (await fit('#btn-close-settings')) ? 'PASS ' : 'FAIL ') + `${tag} settings window fits`);
      await page.click('#btn-close-settings');
      // solve level to get the win card
      d = await page.evaluate(() => OSGame.debug());
      const sol = R.solve(d.boxes, d.cap);
      for (const [a, b] of sol) for (const idx of [a, b]) { const r = d.rects[idx]; await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(25); }
      await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 8000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${tag}-win.png` });
      res.push(((await fit('#win-modal .card')) ? 'PASS ' : 'FAIL ') + `${tag} win card fits`);
      const sc = await page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth, document.documentElement.scrollHeight <= innerHeight]);
      res.push((sc[0] && sc[1] && !errs.length ? 'PASS ' : 'FAIL ') + `${tag} no page scroll, no errors ${errs.join('|')}`);
      await ctx.close();
    }
  }
  console.log(res.join('\n'));
  await browser.close();
})();
