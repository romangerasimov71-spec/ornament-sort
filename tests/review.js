// Regression tests for review round 1 (T1, G1-G8). Uses tests/fakeads.js, which behaves like a
// real ad-supporting platform (showRewarded() returns undefined, states arrive later).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', 'js', 'rules.js'));
const LEVELS = require(path.join(__dirname, '..', 'js', 'levels-data.js'));
const URL = process.env.GAME_URL || 'http://127.0.0.1:8765/index.html';
const FAKE = fs.readFileSync(path.join(__dirname, 'fakeads.js'), 'utf8');
const results = [];
const check = (name, ok, extra) => results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const dbg = (p) => p.evaluate(() => OSGame.debug());
async function tap(page, idx, wait = 60) {
  const r = (await dbg(page)).rects[idx];
  await page.mouse.click(r.x + r.w / 2, r.y + r.h * 0.6);
  await page.waitForTimeout(wait);
}
async function solve(page, gap = 40) {
  const d = await dbg(page);
  const sol = R.solveShortest(d.boxes, d.cap, 300000) || R.solve(d.boxes, d.cap);
  for (const [a, b] of sol) { await tap(page, a, gap); await tap(page, b, gap); }
}
// a short move sequence on a level that leads to an unsolvable board (found with the solver)
function findDeadEnd(lv) {
  const q = [{ s: R.clone(lv.b), p: [] }], seen = new Set([R.key(lv.b)]);
  for (let h = 0; h < q.length && q.length < 50000; h++) {
    const cur = q[h];
    if (cur.p.length && !R.isSolved(cur.s, lv.c) && R.solve(cur.s, lv.c, 50000) === null) return cur.p;
    if (cur.p.length >= 6) continue;
    for (const m of R.usefulMoves(cur.s, lv.c)) {
      const s2 = R.clone(cur.s); R.applyMove(s2, lv.c, m.from, m.to);
      const k = R.key(s2); if (seen.has(k)) continue; seen.add(k);
      q.push({ s: s2, p: cur.p.concat([[m.from, m.to]]) });
    }
  }
  return null;
}

async function openPage(browser, fake, unlocked, level) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  if (fake) await page.addInitScript(FAKE);
  await page.goto(URL);
  await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  if (unlocked) {
    await page.evaluate(([u, l]) => bridge.storage.set(['os_unlocked', 'os_level'], [String(u), String(l)]), [unlocked, level]);
    await page.reload();
    await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  }
  await page.click('#btn-play', { force: true });
  await page.waitForTimeout(400);
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch();

  // ---------- T1 / G4 / G5: rewarded ad with a realistic platform
  {
    const { ctx, page, errs } = await openPage(browser, true);
    check('G5: no "+1 box" on the tutorial level', !(await page.isVisible('#btn-extra')));
    await solve(page); await page.waitForSelector('#win-modal:not(.hidden)'); await page.click('#btn-next');
    await page.waitForTimeout(2400);                       // interstitial (fake) opens and closes
    check('interstitial asked on Next, game resumes after it', (await page.evaluate(() => __adlog)).includes('showInterstitial:level_completed') && !(await dbg(page)).paused);
    check('T1: "+1 box" visible on level 2', await page.isVisible('#btn-extra'));
    const n0 = (await dbg(page)).boxes.length;
    await page.click('#btn-extra');
    await page.waitForTimeout(300);
    check('T1: button disabled while the ad runs', await page.evaluate(() => document.getElementById('btn-extra').disabled));
    const before = JSON.stringify((await dbg(page)).boxes);
    await tap(page, 0); await tap(page, 3);
    check('G4: board ignores taps while the ad is pending', JSON.stringify((await dbg(page)).boxes) === before && (await dbg(page)).selected === -1);
    await page.waitForTimeout(1700);
    let d = await dbg(page);
    check('T1: reward granted on "rewarded" -> +1 empty box', d.boxes.length === n0 + 1 && d.boxes[n0].length === 0 && !d.paused, `${n0} -> ${d.boxes.length}`);
    check('T1: button hidden after use', !(await page.isVisible('#btn-extra')));

    // cancelled ad: no reward; failed ad: toast
    await solve(page); await page.waitForSelector('#win-modal:not(.hidden)'); await page.click('#btn-next');
    await page.waitForTimeout(2400);
    const n1 = (await dbg(page)).boxes.length;
    await page.evaluate(() => { window.__adMode = 'cancel'; });
    await page.click('#btn-extra'); await page.waitForTimeout(2000);
    d = await dbg(page);
    check('T1: closed without reward -> no box, button usable again', d.boxes.length === n1 && await page.isVisible('#btn-extra') && !(await page.evaluate(() => document.getElementById('btn-extra').disabled)));
    await page.evaluate(() => { window.__adMode = 'fail'; });
    await page.click('#btn-extra'); await page.waitForTimeout(1800);
    check('T1: failed ad -> toast, no box', (await dbg(page)).boxes.length === n1 && await page.isVisible('#toast'), await page.textContent('#toast'));

    // N2: the level cannot be changed while the ad runs, so the reward is not lost
    await page.evaluate(() => { window.__adMode = 'ok'; window.__rewardAt = 2500; });
    const n2 = (await dbg(page)).boxes.length;
    await page.click('#btn-extra'); await page.waitForTimeout(200);
    await page.keyboard.press('l'); await page.waitForTimeout(100);
    check('N2: L does nothing while the ad runs', await page.isHidden('#levels-modal'));
    await page.waitForTimeout(3000);
    d = await dbg(page);
    check('N2: reward kept on the same level', d.level === 3 && d.boxes.length === n2 + 1, `level ${d.level}, boxes ${n2} -> ${d.boxes.length}`);
    check('rewarded test: no console errors', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  // ---------- N1-N3: the platform never answers showRewarded()
  {
    const { ctx, page, errs } = await openPage(browser, true);
    await solve(page); await page.waitForSelector('#win-modal:not(.hidden)'); await page.click('#btn-next');
    await page.waitForTimeout(2400);
    await page.evaluate(() => { bridge.advertisement.showRewarded = function () {}; });
    const before = JSON.stringify((await dbg(page)).boxes);
    await page.click('#btn-extra');
    await page.waitForTimeout(400);
    const chip = await page.textContent('#hint-chip');
    check('N3: waiting state is visible (message + dimmed board)', /Loading the ad|Загружаем/.test(chip) && await page.evaluate(() => document.body.classList.contains('ad-wait')), chip);
    await page.keyboard.press('l'); await page.keyboard.press('s');
    await page.waitForTimeout(200);
    check('N2: level window / settings do not open while waiting for the ad',
      await page.isHidden('#levels-modal') && await page.isHidden('#settings-modal') &&
      await page.evaluate(() => document.getElementById('btn-levels').disabled && document.getElementById('btn-settings').disabled));
    await page.waitForTimeout(12200);
    const toast = (await page.isVisible('#toast')) ? await page.textContent('#toast') : '';
    let d = await dbg(page);
    check('N1: no answer in 12 s -> "ad not available", board unlocked', /not available|недоступна/.test(toast) && !d.paused &&
      await page.evaluate(() => !document.body.classList.contains('ad-wait')), toast);
    await tap(page, 0); await tap(page, d.boxes.findIndex(b => !b.length), 400);
    d = await dbg(page);
    check('N1: taps work again after the timeout', JSON.stringify(d.boxes) !== before && d.moves === 1);
    await page.keyboard.press('u'); await page.waitForTimeout(300);
    check('N1: U works again', (await dbg(page)).moves === 0);
    await page.keyboard.press('l'); await page.waitForTimeout(200);
    check('N1: level window opens again', await page.isVisible('#levels-modal'));
    check('silent-ad test: no console errors', errs.length === 0, errs.join('|'));
    await ctx.close();
  }

  // ---------- G1: win timer must not leak into the next attempt / level
  {
    const { ctx, page } = await openPage(browser, false);
    await solve(page); await page.waitForTimeout(1050);   // win card is due in ~0.9 s after the celebration
    await page.keyboard.press('r'); await page.waitForTimeout(1500);
    let d = await dbg(page);
    // after a win the card is already shown, so R on the card = replay; check no card over the fresh level
    check('G1: no win card over a restarted level', !d.won && await page.isHidden('#win-modal'));
    await solve(page); await page.waitForTimeout(950);
    await page.click('#btn-levels', { force: true }); await page.waitForTimeout(60);
    await page.click('#levels-grid .lv:nth-child(1)', { force: true }); await page.waitForTimeout(1500);
    d = await dbg(page);
    check('G1: no win card after picking a level during the celebration', !d.won && await page.isHidden('#win-modal'), `level ${d.level}`);
    await ctx.close();
  }

  // ---------- G2: dead end message; G7: undo lowers moves; G6: switching selection; G8: keys
  {
    let lvIndex = -1, seq = null;
    for (let i = 1; i < 30 && !seq; i++) { seq = findDeadEnd(LEVELS[i]); if (seq) lvIndex = i; }
    const { ctx, page } = await openPage(browser, false, lvIndex + 1, lvIndex + 1);
    check('G2: found a dead-end sequence with the solver', !!seq, `level ${lvIndex + 1}: ${JSON.stringify(seq)}`);
    for (const [a, b] of seq) { await tap(page, a); await tap(page, b, 250); }
    await page.waitForTimeout(600);
    const toast = (await page.isVisible('#toast')) ? await page.textContent('#toast') : '';
    const attn = await page.evaluate(() => [document.getElementById('btn-restart').classList.contains('attention'), document.getElementById('btn-undo').classList.contains('attention')]);
    check('G2: dead end -> message + Restart highlighted', /Dead end|Тупик/.test(toast) && attn[0], `${toast} restart=${attn[0]} undo=${attn[1]}`);
    let d = await dbg(page);
    const m0 = d.moves;
    await page.click('#btn-undo', { force: true }); await page.waitForTimeout(300);
    d = await dbg(page);
    check('G7: undo lowers the move counter', d.moves === m0 - 1, `${m0} -> ${d.moves}`);
    check('G2: message clears after undo', await page.isHidden('#toast') || !/Dead end|Тупик/.test(await page.textContent('#toast')));
    await page.click('#btn-restart', { force: true }); await page.waitForTimeout(300);

    // G6: select A, then tap B (non-empty, unfinished, top differs) -> selection switches silently
    d = await dbg(page);
    let a = -1, b = -1;
    for (let i = 0; i < d.boxes.length && a < 0; i++) for (let j = 0; j < d.boxes.length; j++) {
      if (i !== j && d.boxes[i].length && d.boxes[j].length && !R.canMove(d.boxes, d.cap, i, j)) { a = i; b = j; break; }
    }
    await tap(page, a); await tap(page, b, 150);
    d = await dbg(page);
    check('G6: tapping another box with ornaments switches the selection', d.selected === b && d.moves === 0, `selected ${d.selected}, expected ${b}`);
    await tap(page, b, 100);

    // G8: focused HUD button keeps Enter for itself; S / L hotkeys
    await page.focus('#btn-settings');
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    check('G8: Enter on the focused gear opens settings (not the board)', await page.isVisible('#settings-modal') && (await dbg(page)).selected === -1);
    await page.click('#btn-close-settings'); await page.waitForTimeout(100);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('l'); await page.waitForTimeout(200);
    check('T3: L opens the level window', await page.isVisible('#levels-modal'));
    await page.click('#btn-close-levels'); await page.waitForTimeout(100);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('s'); await page.waitForTimeout(200);
    check('T3: S opens settings', await page.isVisible('#settings-modal'));
    await page.click('#btn-close-settings'); await page.waitForTimeout(100);
    await page.focus('#level-info');
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    check('G8: level label is focusable, Enter opens the level window', await page.isVisible('#levels-modal'));
    await ctx.close();
  }

  // ---------- small boxes: touch zones reach the middle of the gaps and the whole row height
  {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
    await page.evaluate(() => bridge.storage.set(['os_unlocked', 'os_level'], ['85', '80']));
    await page.reload(); await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
    await page.click('#btn-play', { force: true }); await page.waitForTimeout(400);
    let d = await dbg(page);
    const b1 = d.rects[1], b0 = d.rects[0];
    const gap = b1.x - (b0.x + b0.w);
    // just right of the middle of the gap between box 0 and box 1, high above the box
    await page.touchscreen.tap(b1.x - gap / 2 + 1, b1.y - b1.w * 0.8);
    await page.waitForTimeout(150);
    d = await dbg(page);
    check('touch zone: middle of the gap, above the box -> box 1', d.selected === 1, `box ${b1.w}px, gap ${gap.toFixed(1)}px, selected ${d.selected}`);
    await page.touchscreen.tap(b1.x + b1.w / 2, b1.y + b1.h / 2); await page.waitForTimeout(100);
    // just left of the gap middle, below the box bottom -> box 0
    await page.touchscreen.tap(b0.x + b0.w + gap / 2 - 1, b0.y + b0.h + 3);
    await page.waitForTimeout(150);
    d = await dbg(page);
    check('touch zone: gap middle, just below the box -> box 0', d.selected === 0, `selected ${d.selected}`);
    await ctx.close();
  }

  // ---------- G3: tutorial hand follows a different selection
  {
    const { ctx, page } = await openPage(browser, false);
    let d = await dbg(page);
    const sol = R.solveShortest(d.boxes, d.cap);
    const other = [0, 1, 2].find(i => i !== sol[0][0] && d.boxes[i].length);
    await tap(page, other, 200);
    d = await dbg(page);
    const legal = d.hand && d.rects.some((r, i) => R.canMove(d.boxes, d.cap, other, i) && d.hand.x > r.x && d.hand.x < r.x + r.w);
    check('G3: hand points at a valid drop for the box the player picked', legal, JSON.stringify(d.hand));
    await ctx.close();
  }

  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})();
