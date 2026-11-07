const { chromium } = require('playwright');
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
const R = require(require('path').join(__dirname, '..', 'js', 'rules.js'));
const URL = (process.env.GAME_URL || 'http://127.0.0.1:8765/index.html');
const results = [];
function check(name, ok, extra) { results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); }

// Wrap bridge.initialize right after playgama-bridge.js has run (its load event fires
// before the parser reaches the boot script), then record every sendMessage call.
const hook = () => {
  window.__msgs = [];
  document.addEventListener('load', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'SCRIPT' || !/playgama-bridge\.js/.test(el.src || '')) return;
    // platform exists only after init, and the SDK may replace platform.sendMessage
    // with its own wrapper; record calls through a getter and keep what it sets
    const v = window.bridge;
    const init = v.initialize.bind(v);
    v.initialize = (...a) => init(...a).then((r) => {
      // bridge.platform is wrapped by the SDK (a fresh wrapper per access), so patch
      // the method on the module's prototype, which that wrapper ends up calling
      let proto = Object.getPrototypeOf(v.platform);
      while (proto && !Object.prototype.hasOwnProperty.call(proto, 'sendMessage')) proto = Object.getPrototypeOf(proto);
      const orig = proto.sendMessage;
      proto.sendMessage = function (m, o) { window.__msgs.push(m); return orig.call(this, m, o); };
      return r;
    });
  }, true);
};

async function solveAndPlay(page, how) {
  const d = await page.evaluate(() => OSGame.debug());
  const sol = R.solveShortest(d.boxes, d.cap, 300000) || R.solve(d.boxes, d.cap);
  for (const [a, b] of sol) {
    for (const idx of [a, b]) {
      if (how === 'keys') {
        if (idx < 9) await page.keyboard.press(String(idx + 1));
        else { // arrows + Enter
          const cur = await page.evaluate(() => OSGame.debug());
          await page.keyboard.press('ArrowRight');
          for (let i = 0; i < 20; i++) { await page.keyboard.press('ArrowRight'); }
          await page.keyboard.press('Enter');
        }
      } else {
        const r = (await page.evaluate(() => OSGame.debug())).rects[idx];
        await page.mouse.click(r.x + r.w / 2, r.y + r.h * 0.6);
      }
      await page.waitForTimeout(60);
    }
  }
  return sol.length;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(hook);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('request', r => { if (!r.url().startsWith(new (require('url').URL)(URL).origin) && !r.url().startsWith('data:')) errors.push('EXTERNAL REQUEST ' + r.url()); });

  await page.goto(URL);
  await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  check('title screen shown, game_ready sent', (await page.evaluate(() => __msgs)).includes('game_ready'), JSON.stringify(await page.evaluate(() => __msgs)));
  const order = await page.evaluate(() => [...document.head.querySelectorAll('script')].map(s => s.getAttribute('src') + (s.async ? ' async' : '')));
  check('bridge is first script in head, not async', order[0] === 'playgama-bridge.js', JSON.stringify(order));

  await page.click('#btn-play', { force: true });
  await page.waitForTimeout(500);
  let d = await page.evaluate(() => OSGame.debug());
  check('level 1 starts after Play', d.mode === 'play' && d.level === 1);
  check('tutorial hand visible on level 1', await page.isVisible('#hand'));
  // fingertip on every tutorial step: take = top ornament, put = landing slot
  {
    const d0 = await page.evaluate(() => OSGame.debug());
    const sol = R.solveShortest(d0.boxes, d0.cap);
    let bad = [];
    for (const [a, b] of sol) for (const [idx, kind] of [[a, 'take'], [b, 'put']]) {
      const info = await page.evaluate(() => {
        const hand = document.getElementById('hand');
        hand.style.animation = 'none'; hand.style.transition = 'none';
        const r = hand.querySelector('svg').getBoundingClientRect();
        const out = { tipX: r.left + 30 * r.width / 64, tipY: r.top, p: OSGame.debug().hand, boxes: OSGame.debug().boxes, rects: OSGame.debug().rects };
        hand.style.animation = ''; hand.style.transition = '';
        return out;
      });
      const rr = info.rects[idx];
      const slot = kind === 'take' ? info.boxes[idx].length - 1 : info.boxes[idx].length;
      const inBox = info.p && info.p.x > rr.x && info.p.x < rr.x + rr.w && info.p.y > rr.y && info.p.y < rr.y + rr.h;
      if (!inBox || Math.abs(info.tipX - info.p.x) > 1.5 || Math.abs(info.tipY - info.p.y) > 1.5) bad.push(kind + idx);
      if (kind === 'take') await page.screenshot({ path: __dirname + '/out/full-hand-' + idx + '.png' });
      await page.mouse.click(rr.x + rr.w / 2, rr.y + rr.h * 0.6);
      await page.waitForTimeout(450);
    }
    check('tutorial fingertip on the ornament to take / the landing slot (all 6 steps)', bad.length === 0, bad.join(','));
    await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 5000 });
    await page.click('#btn-replay');
    await page.waitForTimeout(400);
  }

  // ---- level 1 by mouse
  let n = await solveAndPlay(page, 'mouse');
  await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 5000 });
  d = await page.evaluate(() => OSGame.debug());
  check('level 1 solved by clicks -> win card', d.won, `moves ${d.moves}/${n}`);
  check('3 stars for a perfect level 1', (await page.$$('#win-modal .star.on')).length === 3);
  await page.screenshot({ path: __dirname + '/out/flow-win.png' });
  await page.click('#btn-next');
  await page.waitForTimeout(500);
  d = await page.evaluate(() => OSGame.debug());
  check('Next -> level 2', d.level === 2 && !d.won);
  const msgs = await page.evaluate(() => __msgs); check('level_started/level_completed messages sent', msgs.filter(m => m === 'level_completed').length >= 1 && msgs.includes('level_started'), JSON.stringify(msgs));

  // ---- level 2 by keyboard
  n = await solveAndPlay(page, 'keys');
  await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 5000 });
  d = await page.evaluate(() => OSGame.debug());
  check('level 2 solved by keyboard', d.won, `moves ${d.moves}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  d = await page.evaluate(() => OSGame.debug());
  check('Enter on win card -> level 3', d.level === 3);

  // ---- undo / restart on level 3
  const before = JSON.stringify(d.boxes);
  const m = R.solve(d.boxes, d.cap)[0];
  let r = d.rects;
  await page.mouse.click(r[m[0]].x + r[m[0]].w / 2, r[m[0]].y + r[m[0]].h / 2);
  await page.waitForTimeout(80);
  await page.mouse.click(r[m[1]].x + r[m[1]].w / 2, r[m[1]].y + r[m[1]].h / 2);
  await page.waitForTimeout(400);
  d = await page.evaluate(() => OSGame.debug());
  check('a move changes the board', JSON.stringify(d.boxes) !== before && d.moves === 1);
  await page.click('#btn-undo');
  await page.waitForTimeout(400);
  d = await page.evaluate(() => OSGame.debug());
  check('Undo restores the board and spends one undo', JSON.stringify(d.boxes) === before && d.undoLeft === 4);
  await page.mouse.click(r[m[0]].x + r[m[0]].w / 2, r[m[0]].y + r[m[0]].h / 2);
  await page.waitForTimeout(80);
  await page.mouse.click(r[m[1]].x + r[m[1]].w / 2, r[m[1]].y + r[m[1]].h / 2);
  await page.waitForTimeout(300);
  await page.keyboard.press('u');
  await page.waitForTimeout(300);
  d = await page.evaluate(() => OSGame.debug());
  check('U key undoes', JSON.stringify(d.boxes) === before && d.undoLeft === 3);
  await page.mouse.click(r[m[0]].x + r[m[0]].w / 2, r[m[0]].y + r[m[0]].h / 2);
  await page.waitForTimeout(80);
  await page.mouse.click(r[m[1]].x + r[m[1]].w / 2, r[m[1]].y + r[m[1]].h / 2);
  await page.waitForTimeout(300);
  await page.click('#btn-restart');
  await page.waitForTimeout(300);
  d = await page.evaluate(() => OSGame.debug());
  check('Restart resets board, moves and undos', JSON.stringify(d.boxes) === before && d.moves === 0 && d.undoLeft === 5);
  await page.keyboard.press('1');
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  d = await page.evaluate(() => OSGame.debug());
  check('R key restarts (selection cleared)', d.selected === -1 && d.moves === 0);

  // invalid move: tap a full box onto a box with a different top color
  // ---- solve level 3 by clicks
  await solveAndPlay(page, 'mouse');
  await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 5000 });
  check('level 3 solved', (await page.evaluate(() => OSGame.debug())).won);

  // ---- persistence
  await page.reload();
  await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  d = await page.evaluate(() => OSGame.debug());
  check('reload keeps progress (level 4 unlocked, stars kept)', d.save.level === 4 && d.save.unlocked === 4 && d.save.stars.length === 3, JSON.stringify(d.save));
  await page.click('#btn-play', { force: true });
  await page.waitForTimeout(300);
  check('continues at level 4', (await page.evaluate(() => OSGame.debug())).level === 4);

  // ---- settings window
  await page.click('#btn-settings');
  await page.waitForTimeout(300);
  check('settings window opens', await page.isVisible('#settings-modal'));
  await page.click('#sw-music');
  await page.locator('#vol-sfx').fill('30');
  await page.locator('#vol-sfx').dispatchEvent('change');
  d = await page.evaluate(() => OSGame.debug());
  check('music switch + effects slider work', !d.save.settings.musicOn && d.audio.musicGain === 0 && Math.abs(d.audio.sfxGain - 0.3) < 0.01, JSON.stringify(d.audio));
  await page.click('#btn-close-settings');
  check('X closes settings', await page.isHidden('#settings-modal'));
  await page.reload();
  await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  d = await page.evaluate(() => OSGame.debug());
  check('settings survive reload (Bridge storage)', !d.save.settings.musicOn && Math.abs(d.save.settings.sfxVol - 0.3) < 0.01, JSON.stringify(d.save.settings));
  await page.click('#btn-play', { force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press('m');
  d = await page.evaluate(() => OSGame.debug());
  check('M key: everything off', !d.save.settings.musicOn && !d.save.settings.sfxOn);
  await page.keyboard.press('m');
  d = await page.evaluate(() => OSGame.debug());
  check('M key: everything on, audible', d.save.settings.musicOn && d.save.settings.sfxOn && d.audible && d.audio.state === 'running');

  // ---- level select
  await page.click('#level-info');
  await page.waitForTimeout(300);
  let tiles = await page.evaluate(() => [...document.querySelectorAll('#levels-grid .lv')].map(b => b.className + (b.querySelector('.check') ? ' +check' : '') + (b.querySelector('.lock') ? ' +lock' : '')));
  check('level select via the label: 1-3 passed with check, 4 current, 5+ locked', tiles.length === 85 && /done \+check/.test(tiles[0]) && /done \+check/.test(tiles[2]) && /current/.test(tiles[3]) && /locked \+lock/.test(tiles[4]) && /locked/.test(tiles[84]), tiles.slice(0, 6).join(', '));
  await page.click('#levels-grid .lv:nth-child(6)');
  await page.waitForTimeout(150);
  check('locked tile does nothing', await page.isVisible('#levels-modal') && (await page.evaluate(() => OSGame.debug())).level === 4);
  await page.click('#levels-grid .lv:nth-child(2)');
  await page.waitForTimeout(300);
  check('open tile starts that level', (await page.evaluate(() => OSGame.debug())).level === 2 && await page.isHidden('#levels-modal'));
  await page.reload();
  await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  await page.click('#btn-play', { force: true });
  await page.waitForTimeout(300);
  d = await page.evaluate(() => OSGame.debug());
  check('reload resumes on the last level played (2), progress kept', d.level === 2 && d.save.unlocked === 4, JSON.stringify(d.save));
  await page.click('#btn-levels');
  await page.mouse.click(3, 3);
  check('tap outside closes the level window', await page.isHidden('#levels-modal'));

  // ---- tab hidden -> paused and silent
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  d = await page.evaluate(() => OSGame.debug());
  check('hidden tab -> paused + silent', d.paused && !d.audible);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  d = await page.evaluate(() => OSGame.debug());
  check('visible again -> resumes', !d.paused && d.audible);

  // ---- platform pause / audio events
  const pb = await page.evaluate(() => {
    const p = bridge.platform; const names = new Set(); let o = p; while (o && o !== Object.prototype) { Object.getOwnPropertyNames(o).forEach(n => names.add(n)); o = Object.getPrototypeOf(o); }
    const q = bridge.platform._platformBridge || bridge.advertisement._platformBridge; const n2 = new Set(); o = q; while (o && o !== Object.prototype) { Object.getOwnPropertyNames(o).forEach(n => n2.add(n)); o = Object.getPrototypeOf(o); }
    return [...n2].filter(n => /pause|audio|State/i.test(n)).join(',');
  });
  console.log('platform bridge state methods:', pb);
  const okPause = await page.evaluate(() => {
    const q = bridge.advertisement._platformBridge;
    if (!q || !q._setPauseState) return 'n/a';
    q._setPauseState(true); const a = OSGame.debug();
    q._setPauseState(false); const b = OSGame.debug();
    return a.paused && !a.audible && !b.paused && b.audible;
  });
  check('platform pause event pauses + mutes', okPause === true, String(okPause));
  const okAudio = await page.evaluate(() => {
    const q = bridge.advertisement._platformBridge;
    if (!q || !q._setAudioState) return 'n/a';
    q._setAudioState(false); const a = OSGame.debug();
    q._setAudioState(true); const b = OSGame.debug();
    return !a.audible && b.audible;
  });
  check('platform audio event mutes', okAudio === true, String(okAudio));

  // ---- rewarded ad (stubbed; the mock platform does not support it)
  await page.evaluate(() => {
    Object.defineProperty(bridge.advertisement, 'isRewardedSupported', { configurable: true, get: () => true });
    window.__rewardMode = 'cancel';
    bridge.advertisement.showRewarded = () => {
      const q = bridge.advertisement._platformBridge;
      q._setRewardedState('loading'); q._setRewardedState('opened');
      setTimeout(() => { if (window.__rewardMode === 'ok') q._setRewardedState('rewarded'); q._setRewardedState('closed'); }, 300);
      return Promise.resolve();
    };
  });
  await page.click('#btn-restart');
  await page.waitForTimeout(200);
  check('ad button visible when rewarded is supported', await page.isVisible('#btn-extra'), await page.textContent('#btn-extra'));
  let nb = (await page.evaluate(() => OSGame.debug())).boxes.length;
  await page.click('#btn-extra');
  await page.waitForTimeout(100);
  check('game paused while the ad is open', (await page.evaluate(() => OSGame.debug())).paused);
  await page.waitForTimeout(500);
  d = await page.evaluate(() => OSGame.debug());
  check('closed ad without reward -> no extra box', d.boxes.length === nb && !d.paused);
  await page.evaluate(() => { window.__rewardMode = 'ok'; });
  await page.click('#btn-extra');
  await page.waitForTimeout(700);
  d = await page.evaluate(() => OSGame.debug());
  check('rewarded -> +1 empty box, button hidden', d.boxes.length === nb + 1 && d.boxes[nb].length === 0 && !(await page.isVisible('#btn-extra')));
  await page.screenshot({ path: __dirname + '/out/flow-extra.png' });

  check('no console errors / warnings / external requests', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})();
