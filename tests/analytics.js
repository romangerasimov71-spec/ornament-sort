// Analytics events (docs/analytics.md): they really go through bridge.analytics.send with the right data,
// without duplicates and not more often than needed; platform messages go one to one with progression_*;
// without the analytics module the game works and nothing breaks. About a minute (waits 30 s for a perf sample).
//   node tests/analytics.js        (GAME_URL changes the address)
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

const ALLOWED = {
  progression_started: ['level_id', 'step_index', 'attempt', 'source'],
  progression_completed: ['level_id', 'step_index', 'attempt', 'stars', 'moves', 'par', 'duration_sec', 'undo_used', 'extra_box', 'first_win'],
  progression_failed: ['level_id', 'step_index', 'attempt', 'reason', 'action', 'moves', 'duration_sec'],
  tutorial_completed: ['duration_sec', 'moves'],
  first_input: ['input', 'seconds', 'seconds_since_ready'],
  extra_box_requested: ['level_id', 'step_index', 'dead_end'],
  extra_box_granted: ['level_id', 'step_index', 'late'],
  levels_opened: ['source', 'step_index'],
  level_selected: ['level_id', 'step_index', 'from_step_index', 'completed'],
  settings_opened: ['source'],
  settings_changed: ['setting', 'enabled', 'source'],
  performance_sample: null
};
const VOCAB = {
  source: ['continue', 'next', 'replay', 'restart', 'level_select', 'button', 'label', 'key', 'final', 'settings'],
  reason: ['dead_end', 'restart', 'level_switch'], action: ['restart', 'level_switch'],
  input: ['touch', 'mouse', 'keyboard'], setting: ['music', 'sfx', 'all']
};
const PERF_FIELDS = ['target_fps', 'window_ms', 'active_ms', 'frame_count', 'fps_avg', 'fps_p10', 'frame_time_p50_ms',
  'frame_time_p95_ms', 'frame_time_p99_ms', 'frame_time_max_ms', 'frames_over_50ms', 'frames_over_100ms',
  'frames_over_250ms', 'frames_over_500ms', 'frames_over_1000ms', 'game_version'];

// record bridge.analytics.send and bridge.platform.sendMessage (patched on the module prototypes after init)
const hook = () => {
  window.__an = []; window.__pm = [];
  document.addEventListener('load', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'SCRIPT' || !/playgama-bridge\.js/.test(el.src || '')) return;
    const v = window.bridge;
    const init = v.initialize.bind(v);
    v.initialize = (...a) => init(...a).then((r) => {
      const patch = (obj, name, fn) => {
        let proto = Object.getPrototypeOf(obj);
        while (proto && !Object.prototype.hasOwnProperty.call(proto, name)) proto = Object.getPrototypeOf(proto);
        const orig = proto[name];
        proto[name] = function (...args) { fn(...args); return orig.apply(this, args); };
      };
      if (window.__noAnalytics) {
        // the analytics module is missing on this platform: the game must stay silent and work
        Object.defineProperty(v, 'analytics', { get: () => undefined, configurable: true });
      } else {
        patch(v.analytics, 'send', (n, d) => window.__an.push({ n, d: JSON.parse(JSON.stringify(d || {})), t: performance.now() }));
      }
      patch(v.platform, 'sendMessage', (m, o) => window.__pm.push({ m, o: o || null }));
      return r;
    });
  }, true);
};

async function tap(page, idx, wait = 50) {
  const r = (await dbg(page)).rects[idx];
  await page.mouse.click(r.x + r.w / 2, r.y + r.h * 0.6);
  await page.waitForTimeout(wait);
}
async function solve(page) {
  const d = await dbg(page);
  const sol = R.solveShortest(d.boxes, d.cap, 300000) || R.solve(d.boxes, d.cap);
  for (const [a, b] of sol) { await tap(page, a, 40); await tap(page, b, 40); }
  await page.waitForSelector('#win-modal:not(.hidden)', { timeout: 10000 });
}
// one harmless legal move that keeps the level solvable
async function oneMove(page) {
  const d = await dbg(page);
  const sol = R.solveShortest(d.boxes, d.cap, 300000) || R.solve(d.boxes, d.cap);
  await tap(page, sol[0][0]); await tap(page, sol[0][1], 400);
}
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
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: !!opts.touch });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  if (opts.noAnalytics) await page.addInitScript(() => { window.__noAnalytics = true; });
  if (opts.fake) await page.addInitScript(FAKE);
  await page.addInitScript(hook);
  await page.goto(URL);
  await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  if (opts.level) {
    await page.evaluate(([u, l]) => bridge.storage.set(['os_unlocked', 'os_level'], [String(u), String(l)]), [opts.unlocked || opts.level, opts.level]);
    await page.reload();
    await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  }
  return { ctx, page, errs };
}
const ev = (page) => page.evaluate(() => window.__an.slice());
const pm = (page) => page.evaluate(() => window.__pm.slice());
const names = (list, n) => list.filter((e) => e.n === n);
const fmt = (e) => e ? JSON.stringify(e.d) : 'none';

// every event: a known name, only known fields, strings from the fixed lists, numbers finite, no PII
function validate(list) {
  const bad = [];
  for (const e of list) {
    if (!(e.n in ALLOWED)) { bad.push('unknown event ' + e.n); continue; }
    const keys = Object.keys(e.d);
    if (e.n === 'performance_sample') {
      for (const k of PERF_FIELDS) if (!(k in e.d)) bad.push(`${e.n}: no ${k}`);
      continue;
    }
    for (const k of keys) {
      if (!ALLOWED[e.n].includes(k)) bad.push(`${e.n}: extra field ${k}`);
      const v = e.d[k];
      if (typeof v === 'string' && k !== 'level_id' && (!VOCAB[k] || !VOCAB[k].includes(v))) bad.push(`${e.n}.${k}="${v}" not in the list`);
      if (k === 'level_id' && !(+v >= 1 && +v <= 85)) bad.push(`${e.n}.level_id=${v}`);
      if (typeof v === 'number' && !isFinite(v)) bad.push(`${e.n}.${k} not finite`);
    }
    for (const k of ALLOWED[e.n]) if (!(k in e.d)) bad.push(`${e.n}: no ${k}`);
    if (e.d.level_id !== undefined && String(e.d.step_index) !== e.d.level_id) bad.push(`${e.n}: level_id ${e.d.level_id} vs step_index ${e.d.step_index}`);
  }
  return bad;
}
// platform messages go one to one with progression events (same level, same order)
function oneToOne(list, msgs) {
  const map = { progression_started: 'level_started', progression_completed: 'level_completed', progression_failed: 'level_failed' };
  const a = list.filter((e) => map[e.n]).map((e) => map[e.n] + ':' + e.d.level_id);
  const b = msgs.filter((m) => Object.values(map).includes(m.m)).map((m) => m.m + ':' + (m.o && m.o.level));
  return { ok: JSON.stringify(a) === JSON.stringify(b), a, b };
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. a new player: first input, tutorial, level 1 -> 2, restart, dead end, level window, settings
  {
    const { ctx, page, errs } = await open(browser);
    await page.waitForTimeout(700);
    check('nothing is sent before the player does something', (await ev(page)).length === 0, JSON.stringify(await ev(page)));
    await page.click('#btn-play', { force: true });
    await page.waitForTimeout(400);
    let L = await ev(page);
    const fi = names(L, 'first_input');
    check('first_input: once, mouse, seconds from the start and from ready', fi.length === 1 && fi[0].d.input === 'mouse' &&
      fi[0].d.seconds > 0 && fi[0].d.seconds_since_ready >= 0 && fi[0].d.seconds >= fi[0].d.seconds_since_ready, fmt(fi[0]));
    const st = names(L, 'progression_started');
    check('progression_started: level 1 from the title (source continue, attempt 1)', st.length === 1 &&
      st[0].d.level_id === '1' && st[0].d.step_index === 1 && st[0].d.source === 'continue' && st[0].d.attempt === 1, fmt(st[0]));

    await solve(page);
    L = await ev(page);
    const done = names(L, 'progression_completed');
    check('progression_completed: level 1 with stars, moves, par, first_win', done.length === 1 && done[0].d.step_index === 1 &&
      done[0].d.stars >= 1 && done[0].d.stars <= 3 && done[0].d.moves === (await dbg(page)).moves && done[0].d.par === LEVELS[0].p &&
      done[0].d.first_win === true && done[0].d.extra_box === false && done[0].d.undo_used === 0 && done[0].d.duration_sec > 0, fmt(done[0]));
    const tut = names(L, 'tutorial_completed');
    check('tutorial_completed: once, after level 1', tut.length === 1 && tut[0].d.moves > 0, fmt(tut[0]));
    check('first_input stays one after many taps', names(L, 'first_input').length === 1);

    await page.click('#btn-next'); await page.waitForTimeout(400);
    L = await ev(page);
    let s2 = names(L, 'progression_started').pop();
    check('Next -> progression_started level 2, source next', s2.d.step_index === 2 && s2.d.source === 'next' && s2.d.attempt === 1, fmt(s2));

    // restart without a single move: same attempt, nothing is sent
    const n0 = (await ev(page)).length, m0 = (await pm(page)).length;
    await page.click('#btn-restart', { force: true }); await page.waitForTimeout(300);
    check('Restart without a move: no events, no platform messages', (await ev(page)).length === n0 && (await pm(page)).length === m0,
      JSON.stringify((await ev(page)).slice(n0)));

    // restart after a move: failed (restart) + a new attempt
    await oneMove(page);
    await page.click('#btn-restart', { force: true }); await page.waitForTimeout(300);
    L = await ev(page);
    let f = names(L, 'progression_failed').pop();
    s2 = names(L, 'progression_started').pop();
    check('Restart after a move -> progression_failed reason restart', f && f.d.step_index === 2 && f.d.reason === 'restart' && f.d.action === 'restart' && f.d.moves === 1, fmt(f));
    check('... and progression_started source restart, attempt 2', s2.d.step_index === 2 && s2.d.source === 'restart' && s2.d.attempt === 2, fmt(s2));

    // level window: open with the label, pick level 1 after a move -> failed (level_switch), selected, started
    await oneMove(page);
    await page.click('#level-info'); await page.waitForTimeout(200);
    await page.click('#levels-grid [data-level="0"]'); await page.waitForTimeout(300);
    L = await ev(page);
    const lo = names(L, 'levels_opened').pop(), ls = names(L, 'level_selected').pop();
    f = names(L, 'progression_failed').pop();
    s2 = names(L, 'progression_started').pop();
    check('levels_opened: source label, current level 2', lo && lo.d.source === 'label' && lo.d.step_index === 2, fmt(lo));
    check('level_selected: level 1 from level 2, completed', ls && ls.d.step_index === 1 && ls.d.level_id === '1' && ls.d.from_step_index === 2 && ls.d.completed === true, fmt(ls));
    check('leaving a level after a move -> progression_failed reason level_switch', f.d.step_index === 2 && f.d.reason === 'level_switch' && f.d.action === 'level_switch', fmt(f));
    check('... then progression_started level 1, source level_select, attempt 2', s2.d.step_index === 1 && s2.d.source === 'level_select' && s2.d.attempt === 2, fmt(s2));
    await page.keyboard.press('l'); await page.waitForTimeout(200);
    await page.click('#btn-close-levels'); await page.waitForTimeout(200);
    check('levels_opened by the L key: source key', names(await ev(page), 'levels_opened').pop().d.source === 'key');

    // winning level 1 again: no second tutorial_completed, first_win false
    await solve(page);
    L = await ev(page);
    check('replaying level 1: no second tutorial_completed', names(L, 'tutorial_completed').length === 1);
    check('replaying level 1: first_win false', names(L, 'progression_completed').pop().d.first_win === false);
    await page.click('#btn-replay'); await page.waitForTimeout(300);
    const rp = names(await ev(page), 'progression_started').pop();
    check('Replay -> progression_started level 1, source replay, attempt 3', rp.d.step_index === 1 && rp.d.source === 'replay' && rp.d.attempt === 3, fmt(rp));

    // settings: open by the gear, music off, effects off, then M key (all)
    await page.click('#btn-settings'); await page.waitForTimeout(200);
    await page.click('#sw-music'); await page.waitForTimeout(100);
    await page.click('#sw-sfx'); await page.waitForTimeout(100);
    await page.click('#btn-close-settings'); await page.waitForTimeout(100);
    await page.keyboard.press('m'); await page.waitForTimeout(100);
    L = await ev(page);
    const so = names(L, 'settings_opened'), sc = names(L, 'settings_changed');
    check('settings_opened: once, source button', so.length === 1 && so[0].d.source === 'button', JSON.stringify(so.map((e) => e.d)));
    check('settings_changed: music off, sfx off (settings), all on (M key)', sc.length === 3 &&
      sc[0].d.setting === 'music' && sc[0].d.enabled === false && sc[0].d.source === 'settings' &&
      sc[1].d.setting === 'sfx' && sc[1].d.enabled === false &&
      sc[2].d.setting === 'all' && sc[2].d.enabled === true && sc[2].d.source === 'key', JSON.stringify(sc.map((e) => e.d)));
    // a volume slider is not an event
    await page.click('#btn-settings'); await page.waitForTimeout(200);
    const nv = (await ev(page)).length;
    await page.fill('#vol-music', '30'); await page.dispatchEvent('#vol-music', 'change'); await page.waitForTimeout(100);
    check('a volume slider sends nothing', (await ev(page)).length === nv);
    await page.click('#btn-close-settings');

    L = await ev(page);
    const bad = validate(L);
    check('every event: known name, known fields, values from the fixed lists', bad.length === 0, bad.slice(0, 5).join('; '));
    const o = oneToOne(L, await pm(page));
    check('platform level_started / completed / failed go one to one with progression_*', o.ok, `\n    analytics ${o.a.join(' ')}\n    platform  ${o.b.join(' ')}`);
    check('Bridge-own events are not repeated (no game_ready / level_* / ads / session in analytics.send)',
      !L.some((e) => /^(game_ready|level_started|level_completed|level_failed|session|ad_|rewarded|interstitial|core_)/.test(e.n)));
    check('no console errors (1)', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------- 2. dead end, then restart -> reason dead_end
  {
    const lv = 8;
    const seq = findDeadEnd(LEVELS[lv - 1]);
    const { ctx, page, errs } = await open(browser, { level: lv, touch: true });
    await page.touchscreen.tap(195, 500);     // tap on the title screen: the first input is a touch
    await page.click('#btn-play', { force: true }); await page.waitForTimeout(300);
    check('first_input by touch: input touch', names(await ev(page), 'first_input')[0]?.d.input === 'touch', fmt(names(await ev(page), 'first_input')[0]));
    for (const [a, b] of seq) { await tap(page, a); await tap(page, b, 400); }
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('hidden'), null, { timeout: 5000 }).catch(() => {});
    await page.click('#btn-restart', { force: true }); await page.waitForTimeout(300);
    const L = await ev(page);
    const f = names(L, 'progression_failed').pop();
    check('dead end, then Restart -> progression_failed reason dead_end, action restart', f && f.d.step_index === lv && f.d.reason === 'dead_end' && f.d.action === 'restart', fmt(f));
    check('no console errors (2)', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------- 3. "+1 box": requested and granted, exactly once each
  {
    const { ctx, page, errs } = await open(browser, { level: 13, fake: true });
    await page.click('#btn-play', { force: true }); await page.waitForTimeout(400);
    await page.click('#btn-extra');
    await page.waitForFunction(() => window.__adlog.includes('rewarded_state_changed:closed'), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const L = await ev(page);
    const rq = names(L, 'extra_box_requested'), gr = names(L, 'extra_box_granted');
    check('extra_box_requested: once, level 13', rq.length === 1 && rq[0].d.step_index === 13 && rq[0].d.dead_end === false, JSON.stringify(rq.map((e) => e.d)));
    check('extra_box_granted: once, level 13, not late', gr.length === 1 && gr[0].d.step_index === 13 && gr[0].d.late === false, JSON.stringify(gr.map((e) => e.d)));
    check('no ad events in analytics.send (the Bridge records ads itself)', !L.some((e) => /ad|rewarded|interstitial/.test(e.n.replace('extra_box', ''))));
    await solve(page);
    const c = names(await ev(page), 'progression_completed').pop();
    check('progression_completed after +1 box: extra_box true', c && c.d.extra_box === true, fmt(c));
    check('no console errors (3)', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------- 4. performance_sample: one per ~30 s of active play, menus and pauses are not counted
  {
    const { ctx, page, errs } = await open(browser, { level: 3 });
    await page.click('#btn-play', { force: true }); await page.waitForTimeout(300);
    await page.click('#btn-settings');                       // a menu: not gameplay
    await page.waitForTimeout(6000);
    await page.click('#btn-close-settings');
    await page.waitForTimeout(24500);
    check('no performance_sample before 30 s of play (6 s in the settings do not count)', names(await ev(page), 'performance_sample').length === 0);
    await page.waitForTimeout(7000);
    const ps = names(await ev(page), 'performance_sample');
    const d = ps[0] && ps[0].d;
    check('performance_sample: exactly one after ~30 s of play', ps.length === 1, `${ps.length}`);
    check('performance_sample: all fields of the guide', d && PERF_FIELDS.every((k) => k in d), d ? PERF_FIELDS.filter((k) => !(k in d)).join(',') : 'none');
    check('performance_sample: active_ms ~30 s, window_ms includes the 6 s menu', d && d.active_ms >= 30000 && d.active_ms < 31000 && d.window_ms >= d.active_ms + 5500, d && `active ${d.active_ms}, window ${d.window_ms}`);
    check('performance_sample: sane numbers (60 fps target, frames, percentiles in order)', d && d.target_fps === 60 && d.frame_count > 100 &&
      d.fps_avg > 5 && d.fps_p10 > 0 && d.fps_p10 <= d.fps_avg + 1 && d.frame_time_p50_ms <= d.frame_time_p95_ms &&
      d.frame_time_p95_ms <= d.frame_time_p99_ms && d.frame_time_p99_ms <= d.frame_time_max_ms &&
      d.frames_over_50ms >= d.frames_over_100ms && d.frames_over_100ms >= d.frames_over_1000ms, d && JSON.stringify(d));
    check('no console errors (4)', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------- 5. no analytics module: silent, the game works
  {
    const { ctx, page, errs } = await open(browser, { noAnalytics: true });
    await page.click('#btn-play', { force: true }); await page.waitForTimeout(300);
    await solve(page);
    await page.click('#btn-next'); await page.waitForTimeout(300);
    const d = await dbg(page);
    check('without bridge.analytics: the game plays on (level 2 after level 1), nothing recorded', d.level === 2 && (await ev(page)).length === 0);
    check('without bridge.analytics: no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
