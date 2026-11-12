/*
 * Android app (RuStore) mode: the WebView adds "OrnamentSortAndroid/<version>" to the user agent.
 * Checks: quick start without platform parameters, no external requests, progress survives a reload,
 * no "+1 box" even when rewarded ads are reported as supported, no interstitial calls, no VK support line,
 * OSGame.back() closes windows (false when nothing is open), OSGame.appPause() silences and resumes.
 *
 *   GAME_URL=http://127.0.0.1:8766/index.html node tests/android.js   (the release package from tools/build-release.js)
 */
const { chromium } = require('playwright');
const URL = (process.env.GAME_URL || 'http://127.0.0.1:8765/index.html');
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 OrnamentSortAndroid/1.0.1';
const results = [];
function check(name, ok, extra) { results.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('request', r => { if (!/^http:\/\/127\.0\.0\.1/.test(r.url())) external.push(r.url()); });
  await page.addInitScript(() => {
    window.__inter = 0;
    document.addEventListener('load', (e) => {
      const el = e.target;
      if (!el || el.tagName !== 'SCRIPT' || !/playgama-bridge\.js/.test(el.src || '')) return;
      const v = window.bridge, init = v.initialize.bind(v);
      v.initialize = (...a) => init(...a).then((r) => {
        // pretend the platform supports every ad: the app must still show none
        Object.defineProperty(v.advertisement, 'isRewardedSupported', { configurable: true, get: () => true });
        Object.defineProperty(v.advertisement, 'isInterstitialSupported', { configurable: true, get: () => true });
        v.advertisement.showInterstitial = () => { window.__inter++; return Promise.resolve(); };
        return r;
      });
    }, true);
  });

  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.OSGame && OSGame.debug && OSGame.debug().mode === 'title', null, { timeout: 15000 });
  const ms = Date.now() - t0;
  check('starts quickly without platform parameters (< 3 s)', ms < 3000, ms + ' ms');

  // progress: 8 levels open, last played 8 -> reload keeps it
  await page.evaluate(() => bridge.storage.set(['os_unlocked', 'os_level', 'os_stars'], ['8', '8', 's3333333']));
  await page.reload();
  await page.waitForFunction(() => window.OSGame && OSGame.debug().mode === 'title');
  await page.click('#btn-play', { force: true });
  await page.waitForTimeout(400);
  let d = await page.evaluate(() => OSGame.debug());
  check('progress survives a reload (level 8)', d.level === 8 && d.save.unlocked === 8, JSON.stringify(d.save));
  check('no "+1 box" on level 8 even when rewarded is reported as supported', !(await page.isVisible('#btn-extra')));

  // solve level 8 with the rules solver
  const R = require(require('path').join(__dirname, '..', 'js', 'rules.js'));
  const sol = R.solveShortest(d.boxes, d.cap, 300000) || R.solve(d.boxes, d.cap);
  for (const [a, b] of sol) {
    for (const idx of [a, b]) {
      const r = (await page.evaluate(() => OSGame.debug())).rects[idx];
      await page.mouse.click(r.x + r.w / 2, r.y + r.h * 0.6);
      await page.waitForTimeout(50);
    }
  }
  await page.waitForTimeout(1500);
  d = await page.evaluate(() => OSGame.debug());
  check('level 8 solved', d.won, 'moves ' + d.moves);
  await page.click('#btn-next');
  await page.waitForTimeout(400);
  check('no interstitial ad between levels', (await page.evaluate(() => window.__inter)) === 0);
  check('next level 9', (await page.evaluate(() => OSGame.debug().level)) === 9);

  // settings: no VK support line
  await page.click('#btn-settings');
  await page.waitForTimeout(200);
  check('no "support: vk.com" line in settings', !(await page.isVisible('#support-line')) && (await page.textContent('#support-line')) === '');
  check('back() closes settings', (await page.evaluate(() => OSGame.back())) === true && !(await page.isVisible('#settings-modal')));
  await page.click('#btn-levels');
  await page.waitForTimeout(200);
  check('back() closes the level window', (await page.evaluate(() => OSGame.back())) === true && !(await page.isVisible('#levels-modal')));
  check('back() with nothing open -> false (the app exits)', (await page.evaluate(() => OSGame.back())) === false);

  // background / foreground
  await page.evaluate(() => OSGame.appPause(true));
  d = await page.evaluate(() => OSGame.debug());
  check('appPause(true): paused and silent', d.paused && !d.audible);
  await page.evaluate(() => OSGame.appPause(false));
  d = await page.evaluate(() => OSGame.debug());
  check('appPause(false): resumes and audible', !d.paused && d.audible);

  check('no external requests', external.length === 0, external.join(' '));
  check('no console errors / warnings', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})();
