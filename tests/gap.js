// Tech-N1: the hint / dead-end line keeps a 6 px gap above the buttons (and the undo badge) at every size.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 640], [640, 360], [390, 844], [844, 390], [800, 800], [1366, 768]]) {
    for (const lang of ['ru-RU', 'en-US']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: lang });
      const p = await ctx.newPage();
      await p.goto((process.env.GAME_URL || 'http://127.0.0.1:8765/index.html'));
      await p.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
      await p.evaluate(() => bridge.storage.set(['os_unlocked', 'os_level'], ['85', '80']));
      await p.reload(); await p.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
      await p.click('#btn-play', { force: true }); await p.waitForTimeout(400);
      await p.evaluate((ru) => {
        const t = document.getElementById('toast');
        t.textContent = ru ? 'Тупик — отмени ход или начни заново' : 'Dead end — undo or restart';
        t.classList.remove('hidden');
        return null;
      }, lang === 'ru-RU');
      await p.waitForTimeout(500);
      const r2 = await p.evaluate(() => {
        const t = document.getElementById('toast');
        const tr = t.getBoundingClientRect();
        const btns = ['btn-undo', 'btn-restart', 'btn-extra', 'undo-count'].map(id => document.getElementById(id)).filter(e => e && !e.classList.contains('hidden')).map(e => e.getBoundingClientRect());
        let minGap = 1e9;
        for (const br of btns) {
          const hOverlap = tr.left < br.right && br.left < tr.right;
          if (hOverlap) minGap = Math.min(minGap, br.top - tr.bottom);
        }
        const boxes = OSGame.debug().rects;
        const lowest = Math.max(...boxes.map(x => x.y + x.h));
        return { gap: minGap, boardGap: tr.top - lowest, toastW: tr.width, box: boxes[0].w, clipped: t.scrollWidth > t.clientWidth };
      });
      const r = r2;
      if (r.gap !== 1e9 && r.gap < 5.5) process.exitCode = 1;
      console.log((r.gap !== 1e9 && r.gap < 5.5 ? 'FAIL ' : 'PASS ') + `${w}x${h} ${lang.slice(0, 2)}: gap to buttons ${r.gap === 1e9 ? 'no buttons under it' : r.gap.toFixed(1)}, gap to boxes ${r.boardGap.toFixed(1)}, text cut ${r.clipped}, box ${r.box}`);
      if (w === 360) await p.screenshot({ path: __dirname + '/out/gap-360-' + lang.slice(0, 2) + '.png' });
      await ctx.close();
    }
  }
  await b.close();
})();
