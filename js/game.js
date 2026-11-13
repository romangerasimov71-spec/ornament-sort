/*
 * Ornament Sort / Новогодняя сортировка — main game.
 * Plain JS + canvas. All graphics are drawn in code.
 */
(function () {
  'use strict';

  var R = window.OSRules;
  var LEVELS = window.OS_LEVELS;
  var I18N = window.OSI18n;
  var SND = window.OSAudio;
  var t = I18N.t;

  var GAME_VERSION = '1.0.1';      // goes into performance_sample: raise it with every new build for the platforms
  // support contact (VK requirement): the studio group «Уютные игры». Shown in Settings only in VK / OK; empty -> hidden.
  // In OK only the OK group (no vk.com, no «ВКонтакте» — OK moderation risk); in VK the VK community.
  var SUPPORT = { vk: 'vk.com/club243202759', ok: 'ok.ru/group/70000061487179' };
  var UNDO_PER_LEVEL = 5;
  var EXTRA_BOX_FROM_LEVEL = 8;    // "+1 box for an ad" only from this level on: on levels 1-7 a dead end is impossible
  var KEYS = ['os_level', 'os_unlocked', 'os_stars', 'os_settings'];
  // Android app (RuStore): its WebView adds "OrnamentSortAndroid/<version>" to the user agent.
  // There are no ads (rewarded and interstitial) and no VK support line in the app.
  var ANDROID = /OrnamentSortAndroid\//.test((window.navigator && navigator.userAgent) || '');

  // ---------------------------------------------------------------- colors
  // Every color also has its own pattern, so ornaments differ not only by hue.
  var COLORS = [
    { base: '#e3303c', light: '#ff9aa0', dark: '#7a0b16', pat: 'band',    acc: '#fff3e0' },
    { base: '#1fa257', light: '#8af0b4', dark: '#07502a', pat: 'dots',    acc: '#ffe28a' },
    { base: '#2d6fe3', light: '#9cc4ff', dark: '#0d2f7a', pat: 'snow',    acc: '#ffffff' },
    { base: '#f2b81d', light: '#fff0a6', dark: '#9a5d05', pat: 'zigzag',  acc: '#b8202d' },
    { base: '#8f43d8', light: '#d8b0ff', dark: '#3d1270', pat: 'rings',   acc: '#ffe28a' },
    { base: '#f2741c', light: '#ffc58f', dark: '#8a3304', pat: 'stripes', acc: '#fff6e8' },
    { base: '#f2559f', light: '#ffc0de', dark: '#8a1550', pat: 'hearts',  acc: '#ffffff' },
    { base: '#15b5ad', light: '#94f5ef', dark: '#05524f', pat: 'stars',   acc: '#fff4b0' },
    { base: '#cfd8e3', light: '#ffffff', dark: '#6b7a8e', pat: 'diamond', acc: '#3a78d8' },
    { base: '#97d02a', light: '#e4ff9e', dark: '#3f6608', pat: 'swirl',   acc: '#2c5a06' },
    { base: '#8e1d3b', light: '#e47a97', dark: '#3d0616', pat: 'band2',   acc: '#ffd36b' },
    { base: '#9a6430', light: '#e8b47c', dark: '#45240a', pat: 'checker', acc: '#fff0d6' }
  ];
  var LIGHT_COLORS = ['#ff4d5a', '#ffd34d', '#4dff9a', '#5ab4ff', '#ff7ae0'];

  // ---------------------------------------------------------------- state
  var bridge = window.OS_BRIDGE_READY ? window.bridge : null;
  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };
  var ui = {
    hud: $('hud'), topbar: $('topbar'), bottombar: $('bottombar'),
    levelLabel: $('level-label'), movesLabel: $('moves-label'),
    btnLevels: $('btn-levels'), btnSettings: $('btn-settings'), levelInfo: $('level-info'), btnUndo: $('btn-undo'),
    settings: $('settings-modal'), settingsTitle: $('settings-title'), btnCloseSettings: $('btn-close-settings'),
    swMusic: $('sw-music'), swSfx: $('sw-sfx'), volMusic: $('vol-music'), volSfx: $('vol-sfx'),
    lblMusic: $('lbl-music'), lblSfx: $('lbl-sfx'), supportLine: $('support-line'),
    undoCount: $('undo-count'), btnExtra: $('btn-extra'), extraLabel: $('extra-label'),
    btnRestart: $('btn-restart'), chip: $('hint-chip'), hand: $('hand'), toast: $('toast'),
    title: $('title-screen'), titleText: $('title-text'), subtitle: $('subtitle-text'), btnPlay: $('btn-play'),
    win: $('win-modal'), winTitle: $('win-title'), winSub: $('win-sub'), winMoves: $('win-moves'),
    stars: document.querySelectorAll('#win-modal .star'), btnNext: $('btn-next'), nextLabel: $('next-label'),
    btnReplay: $('btn-replay'), replayLabel: $('replay-label'),
    levels: $('levels-modal'), levelsTitle: $('levels-title'), levelsGrid: $('levels-grid'),
    btnCloseLevels: $('btn-close-levels'), boot: $('boot')
  };

  var save = { level: 1, unlocked: 1, stars: [], settings: { musicOn: true, musicVol: 0.6, sfxOn: true, sfxVol: 0.8 } };
  var W = 0, H = 0, DPR = 1;
  var area = { x: 0, y: 0, w: 0, h: 0 };
  var garlandY = 0, garlandSag = 30;
  var mode = 'boot';                // boot | title | play
  var pause = { platform: false, hidden: false, ad: false, view: false };
  var platformAudio = true;
  var now = 0, lastFrame = 0;

  var G = null;                     // current level
  var nextOrnId = 1;
  var layout = { boxes: [], w: 0, d: 0, pitch: 0, rows: [] };
  var bgCanvas = document.createElement('canvas');
  var spriteCache = {};
  var snow = [], sparks = [];
  var keyboardMode = false;
  var rewardPending = false;
  var rewardToken = null;          // the level attempt the player asked a rewarded ad for (kept after the wait
                                   // ends: a late "rewarded" for the same attempt still gives the box)
  var winTimer = 0;
  var rewardWatch = 0;             // watchdog: the platform may never answer
  var rewardOpened = false;
  var deadTimer = 0;
  var lastKick = 0, lastDraw = -1;  // idle frame skipping
  var toastTimer = 0;

  // ---------------------------------------------------------------- analytics (docs/analytics.md)
  var AN = window.GameAnalytics || null;
  var attempts = {};               // attempts per level since the page was opened
  function track(name, data) { if (AN) AN.event(name, data); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function lvData(index, extra) {
    var d = { level_id: String(index + 1), step_index: index + 1 };
    if (extra) Object.keys(extra).forEach(function (k) { d[k] = extra[k]; });
    return d;
  }
  // a new attempt of a level: progression_started + the platform's level_started, always together
  function beginAttempt(index, source) {
    attempts[index] = (attempts[index] || 0) + 1;
    var a = Math.min(20, attempts[index]);
    track('progression_started', lvData(index, { attempt: a, source: source }));
    sendMessage('level_started', { level: String(index + 1) });
    return a;
  }
  // the player left an unfinished attempt: progression_failed + the platform's level_failed
  // reason: dead_end (the game showed "Dead end"), otherwise what the player did (restart / level_switch)
  function failAttempt(level, action) {
    track('progression_failed', lvData(level.index, {
      attempt: level.attempt, reason: level.deadEnd ? 'dead_end' : action, action: action,
      moves: level.moves, duration_sec: r1(now - level.startedAt)
    }));
    sendMessage('level_failed', { level: String(level.index + 1) });
  }
  // is the player really playing right now (for performance_sample): a level on screen, no pause, no menu
  function gameplayActive() {
    return mode === 'play' && !!G && !isPaused() && !rewardPending && ui.win.classList.contains('hidden') &&
      ui.levels.classList.contains('hidden') && ui.settings.classList.contains('hidden');
  }

  // ---------------------------------------------------------------- bridge helpers
  function bridgeCall(fn) {
    if (!bridge) return null;
    try { var r = fn(bridge); if (r && r.catch) r.catch(function () {}); return r; } catch (e) { return null; }
  }
  function sendMessage(msg, data) {
    bridgeCall(function (b) { return data ? b.platform.sendMessage(msg, data) : b.platform.sendMessage(msg); });
  }
  function storageSet(keys, values) {
    bridgeCall(function (b) { return b.storage.set(keys, values); });
  }
  // levels are numbered from 1 for the player, G.index from 0
  function extraBoxAllowed() {
    return !!G && G.index + 1 >= EXTRA_BOX_FROM_LEVEL;
  }
  function rewardedSupported() {
    if (ANDROID) return false;
    return !!(bridge && bridge.advertisement && bridge.advertisement.isRewardedSupported);
  }

  // ---------------------------------------------------------------- pause / audio
  function isPaused() { return pause.platform || pause.hidden || pause.ad || pause.view; }
  function setPause(reason, on) {
    pause[reason] = !!on;
    updateAudio();
  }
  function updateAudio() {
    // the platform's audio state and pauses silence everything; the settings set music / effects
    SND.setMix(save.settings);
    SND.setAudible(platformAudio && !isPaused());
  }

  // ---------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var q = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
      return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ================================================================ drawing: ornaments
  function starPath(c, x, y, r1, r2, n, rot) {
    c.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? r2 : r1;
      var a = rot + i * Math.PI / n;
      c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  }

  // A curved band across the sphere (looks wrapped around it).
  function bandPath(c, cx, cy, r, off, th) {
    var k = r * 0.22;
    c.beginPath();
    c.moveTo(cx - r * 1.1, cy + off - th);
    c.quadraticCurveTo(cx, cy + off - th + k, cx + r * 1.1, cy + off - th);
    c.lineTo(cx + r * 1.1, cy + off + th);
    c.quadraticCurveTo(cx, cy + off + th + k, cx - r * 1.1, cy + off + th);
    c.closePath();
  }

  function drawPattern(c, col, cx, cy, r) {
    var acc = col.acc;
    c.fillStyle = hexA(acc, 0.85);
    c.strokeStyle = hexA(acc, 0.85);
    c.lineWidth = Math.max(1, r * 0.09);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    var i, a;
    switch (col.pat) {
      case 'band':
        bandPath(c, cx, cy, r, 0, r * 0.16); c.fill();
        c.fillStyle = hexA(col.base, 0.9);
        for (i = -2; i <= 2; i++) { c.beginPath(); c.arc(cx + i * r * 0.38, cy + r * 0.05 * (1 - Math.abs(i) * 0.3), r * 0.07, 0, 7); c.fill(); }
        break;
      case 'band2':
        // one wide gold band with maroon stars: reads differently from the thin 'rings'
        bandPath(c, cx, cy, r, 0, r * 0.24); c.fill();
        c.fillStyle = hexA(col.dark, 0.95);
        for (i = -1; i <= 1; i++) { starPath(c, cx + i * r * 0.5, cy + r * 0.06 * (1 - Math.abs(i) * 0.4), r * 0.2, r * 0.08, 4, 0); c.fill(); }
        break;
      case 'dots':
        for (i = 0; i < 7; i++) {
          a = i / 7 * Math.PI * 2;
          c.beginPath(); c.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.42 + r * 0.05, r * 0.1, 0, 7); c.fill();
        }
        c.beginPath(); c.arc(cx, cy + r * 0.05, r * 0.13, 0, 7); c.fill();
        break;
      case 'snow':
        c.save(); c.translate(cx, cy + r * 0.05);
        for (i = 0; i < 6; i++) {
          c.rotate(Math.PI / 3);
          c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * 0.55);
          c.moveTo(0, -r * 0.3); c.lineTo(-r * 0.14, -r * 0.44);
          c.moveTo(0, -r * 0.3); c.lineTo(r * 0.14, -r * 0.44);
          c.stroke();
        }
        c.restore();
        break;
      case 'zigzag':
        c.lineWidth = r * 0.13;
        c.beginPath();
        for (i = 0; i <= 8; i++) {
          var zx = cx - r + i * r / 4;
          var zy = cy + (i % 2 ? -r * 0.14 : r * 0.14) + r * 0.08 * (1 - Math.pow((zx - cx) / r, 2));
          if (i) c.lineTo(zx, zy); else c.moveTo(zx, zy);
        }
        c.stroke();
        break;
      case 'rings':
        c.lineWidth = r * 0.1;
        for (i = -1; i <= 1; i += 2) {
          c.beginPath(); c.ellipse(cx, cy + i * r * 0.36, r * 0.98, r * 0.2, 0, 0, Math.PI); c.stroke();
        }
        c.beginPath(); c.ellipse(cx, cy, r, r * 0.22, 0, 0, Math.PI); c.stroke();
        break;
      case 'stripes':
        c.lineWidth = r * 0.12;
        for (i = -2; i <= 2; i++) {
          c.beginPath(); c.ellipse(cx, cy, Math.abs(i) * r * 0.36 + 0.01, r * 1.02, 0, 0, Math.PI * 2);
          if (i === 0) { c.moveTo(cx, cy - r); c.lineTo(cx, cy + r); }
          c.stroke();
        }
        break;
      case 'hearts':
        for (i = 0; i < 3; i++) {
          var hx = cx + (i - 1) * r * 0.55, hy = cy + r * 0.02 + (i === 1 ? r * 0.08 : 0), s = r * 0.17;
          c.beginPath();
          c.moveTo(hx, hy + s * 0.9);
          c.bezierCurveTo(hx - s * 1.6, hy - s * 0.2, hx - s * 0.7, hy - s * 1.4, hx, hy - s * 0.5);
          c.bezierCurveTo(hx + s * 0.7, hy - s * 1.4, hx + s * 1.6, hy - s * 0.2, hx, hy + s * 0.9);
          c.fill();
        }
        break;
      case 'stars':
        starPath(c, cx, cy + r * 0.05, r * 0.32, r * 0.14, 5, -Math.PI / 2); c.fill();
        starPath(c, cx - r * 0.55, cy - r * 0.25, r * 0.14, r * 0.06, 5, -Math.PI / 2); c.fill();
        starPath(c, cx + r * 0.52, cy + r * 0.38, r * 0.14, r * 0.06, 5, -Math.PI / 2); c.fill();
        break;
      case 'diamond':
        bandPath(c, cx, cy, r, 0, r * 0.2); c.fillStyle = hexA(acc, 0.35); c.fill();
        c.fillStyle = hexA(acc, 0.9);
        for (i = -2; i <= 2; i++) {
          var dx = cx + i * r * 0.4, dy = cy + r * 0.07 * (1 - Math.abs(i) * 0.3);
          c.beginPath(); c.moveTo(dx, dy - r * 0.17); c.lineTo(dx + r * 0.12, dy); c.lineTo(dx, dy + r * 0.17); c.lineTo(dx - r * 0.12, dy); c.closePath(); c.fill();
        }
        break;
      case 'swirl':
        c.lineWidth = r * 0.18;
        for (i = 0; i < 3; i++) {
          c.beginPath();
          c.moveTo(cx - r, cy - r * 0.5 + i * r * 0.5);
          c.bezierCurveTo(cx - r * 0.4, cy - r * 0.95 + i * r * 0.5, cx + r * 0.3, cy - r * 0.05 + i * r * 0.5, cx + r, cy - r * 0.5 + i * r * 0.5);
          c.stroke();
        }
        break;
      case 'checker':
        bandPath(c, cx, cy, r, 0, r * 0.22); c.save(); c.clip();
        for (i = -5; i <= 5; i++) {
          for (var j = 0; j < 2; j++) {
            if ((i + j) % 2) continue;
            c.fillRect(cx + i * r * 0.22, cy - r * 0.2 + j * r * 0.22 + r * 0.05, r * 0.22, r * 0.22);
          }
        }
        c.restore();
        break;
    }
  }

  function drawOrnament(c, cx, cy, d, col) {
    var r = d / 2;
    // hanger loop and metal cap
    c.lineWidth = Math.max(1, d * 0.035);
    c.strokeStyle = '#d9b45a';
    c.beginPath(); c.ellipse(cx, cy - r - d * 0.13, d * 0.065, d * 0.06, 0, 0, Math.PI * 2); c.stroke();
    var capW = d * 0.3, capH = d * 0.13, capY = cy - r - d * 0.08;
    var cg = c.createLinearGradient(cx - capW / 2, 0, cx + capW / 2, 0);
    cg.addColorStop(0, '#9b7322'); cg.addColorStop(0.35, '#fff1b8'); cg.addColorStop(0.6, '#e2b84c'); cg.addColorStop(1, '#8a6118');
    c.fillStyle = cg;
    rr(c, cx - capW / 2, capY, capW, capH, d * 0.03); c.fill();
    c.fillStyle = 'rgba(80,50,10,.35)';
    c.fillRect(cx - capW / 2, capY + capH * 0.45, capW, Math.max(1, capH * 0.12));

    // glass sphere
    var g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r * 1.05);
    g.addColorStop(0, col.light);
    g.addColorStop(0.35, col.base);
    g.addColorStop(1, col.dark);
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();

    c.save();
    c.beginPath(); c.arc(cx, cy, r * 0.98, 0, Math.PI * 2); c.clip();
    drawPattern(c, col, cx, cy, r);
    // shade over the pattern so it sits on the sphere
    var sh = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.2, cx, cy, r * 1.05);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.7, 'rgba(0,0,0,0.05)');
    sh.addColorStop(1, 'rgba(0,0,0,0.38)');
    c.fillStyle = sh;
    c.fillRect(cx - r, cy - r, d, d);
    // reflected light at the bottom
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.beginPath(); c.ellipse(cx + r * 0.15, cy + r * 0.72, r * 0.5, r * 0.16, -0.2, 0, Math.PI * 2); c.fill();
    c.restore();

    // specular highlight
    c.fillStyle = 'rgba(255,255,255,0.78)';
    c.beginPath(); c.ellipse(cx - r * 0.38, cy - r * 0.42, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(cx - r * 0.12, cy - r * 0.6, r * 0.05, 0, Math.PI * 2); c.fill();
    c.lineWidth = Math.max(1, d * 0.02);
    c.strokeStyle = hexA(col.dark, 0.6);
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  }

  function ornamentSprite(color, d) {
    var key = color + ':' + Math.round(d * DPR);
    var s = spriteCache[key];
    if (s) return s;
    var size = Math.ceil(d * 1.5 * DPR);
    s = document.createElement('canvas');
    s.width = s.height = size;
    var c = s.getContext('2d');
    c.scale(DPR, DPR);
    drawOrnament(c, d * 0.75, d * 0.8, d, COLORS[color]);
    s.cssSize = d * 1.5;
    s.ox = d * 0.75; s.oy = d * 0.8;
    spriteCache[key] = s;
    return s;
  }

  // ================================================================ drawing: boxes
  function boxSprite(w, h, cap) {
    var key = 'box:' + Math.round(w * DPR) + ':' + cap;
    var s = spriteCache[key];
    if (s) return s;
    var pad = w * 0.12;
    s = document.createElement('canvas');
    s.width = Math.ceil((w + pad * 2) * DPR);
    s.height = Math.ceil((h + pad * 2) * DPR);
    var c = s.getContext('2d');
    c.scale(DPR, DPR);
    c.translate(pad, pad);
    s.pad = pad;

    // shadow on the snow
    c.fillStyle = 'rgba(0,10,30,.35)';
    c.beginPath(); c.ellipse(w / 2, h + w * 0.02, w * 0.56, w * 0.09, 0, 0, Math.PI * 2); c.fill();

    // body — kraft paper box
    var r = w * 0.2;
    var bg = c.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, '#c98a4f'); bg.addColorStop(0.18, '#e6ae70'); bg.addColorStop(0.55, '#d4934f'); bg.addColorStop(1, '#a8652f');
    c.fillStyle = bg;
    rr(c, 0, 0, w, h, r); c.fill();
    c.lineWidth = Math.max(1.5, w * 0.025);
    c.strokeStyle = '#6a3a18';
    c.stroke();

    // red ribbon down the front edge (behind the cavity)
    c.save(); rr(c, 0, 0, w, h, r); c.clip();
    c.fillStyle = '#c3263a';
    c.fillRect(w * 0.42, 0, w * 0.16, h);
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fillRect(w * 0.44, 0, w * 0.03, h);
    c.restore();

    // velvet cavity
    var L = boxGeom(w, cap);
    var vg = c.createLinearGradient(0, L.cy0, 0, L.cy0 + L.ch);
    vg.addColorStop(0, '#24091a'); vg.addColorStop(1, '#4a1630');
    c.fillStyle = vg;
    rr(c, L.cx0, L.cy0, L.cw, L.ch, w * 0.15); c.fill();
    c.save(); rr(c, L.cx0, L.cy0, L.cw, L.ch, w * 0.15); c.clip();
    c.lineWidth = w * 0.08; c.strokeStyle = 'rgba(0,0,0,.35)';
    rr(c, L.cx0 - w * 0.02, L.cy0 - w * 0.01, L.cw + w * 0.04, L.ch + w * 0.04, w * 0.17); c.stroke();
    // little cups that hold each ornament
    c.strokeStyle = 'rgba(255,205,130,.22)';
    c.lineWidth = Math.max(1, w * 0.02);
    for (var i = 0; i < cap; i++) {
      var sy = L.slotY(i) + L.d * 0.47;
      c.beginPath(); c.ellipse(w / 2, sy, L.d * 0.36, L.d * 0.08, 0, 0, Math.PI); c.stroke();
    }
    c.restore();
    c.lineWidth = Math.max(1, w * 0.022);
    c.strokeStyle = 'rgba(255,214,128,.75)';
    rr(c, L.cx0, L.cy0, L.cw, L.ch, w * 0.15); c.stroke();

    // holly sprig on the front
    var hx = w / 2, hy = h - w * 0.135, hs = w * 0.1;
    c.fillStyle = '#1d7a40';
    c.strokeStyle = '#0b3d1f';
    c.lineWidth = Math.max(1, w * 0.012);
    [-1, 1].forEach(function (sd) {
      c.save(); c.translate(hx + sd * hs * 0.9, hy); c.rotate(sd * 0.35);
      c.beginPath(); c.ellipse(0, 0, hs * 1.05, hs * 0.48, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
    });
    c.fillStyle = '#e8283a';
    [[-0.32, -0.2], [0.32, -0.2], [0, 0.18]].forEach(function (p) {
      c.beginPath(); c.arc(hx + p[0] * hs, hy + p[1] * hs, hs * 0.36, 0, Math.PI * 2); c.fill();
    });
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath(); c.arc(hx - hs * 0.4, hy - hs * 0.32, hs * 0.1, 0, Math.PI * 2); c.fill();

    // snow on the top edge
    c.fillStyle = '#f3f8ff';
    c.beginPath();
    c.moveTo(-w * 0.02, w * 0.12);
    c.bezierCurveTo(-w * 0.04, -w * 0.06, w * 0.3, -w * 0.08, w * 0.5, -w * 0.03);
    c.bezierCurveTo(w * 0.72, -w * 0.08, w * 1.05, -w * 0.05, w * 1.02, w * 0.12);
    c.bezierCurveTo(w * 0.9, w * 0.1, w * 0.88, w * 0.2, w * 0.8, w * 0.1);
    c.bezierCurveTo(w * 0.6, w * 0.06, w * 0.45, w * 0.07, w * 0.3, w * 0.1);
    c.bezierCurveTo(w * 0.22, w * 0.2, w * 0.14, w * 0.18, w * 0.13, w * 0.1);
    c.bezierCurveTo(w * 0.08, w * 0.08, w * 0.02, w * 0.1, -w * 0.02, w * 0.12);
    c.fill();
    c.fillStyle = 'rgba(160,190,225,.6)';
    c.beginPath(); c.ellipse(w * 0.5, w * 0.075, w * 0.4, w * 0.02, 0, 0, Math.PI); c.fill();

    spriteCache[key] = s;
    return s;
  }

  // Geometry of a box in its own coordinates.
  function boxGeom(w, cap) {
    var pitch = w * 0.77;
    var d = w * 0.72;
    var cx0 = w * 0.09, cw = w * 0.82, cy0 = w * 0.12, ch = cap * pitch + w * 0.06;
    return {
      w: w, h: w * (0.46 + 0.77 * cap), d: d, pitch: pitch,
      cx0: cx0, cw: cw, cy0: cy0, ch: ch,
      slotY: function (i) { return cy0 + ch - w * 0.03 - (i + 0.5) * pitch; }
    };
  }

  function drawBow(c, x, y, s) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.fillStyle = '#d21f35';
    c.strokeStyle = '#7d0a19';
    c.lineWidth = 0.05;
    // tails
    c.beginPath(); c.moveTo(-0.05, 0.05); c.lineTo(-0.32, 0.5); c.lineTo(-0.18, 0.47); c.lineTo(-0.12, 0.58); c.lineTo(0.02, 0.1); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0.05, 0.05); c.lineTo(0.32, 0.5); c.lineTo(0.18, 0.47); c.lineTo(0.12, 0.58); c.lineTo(-0.02, 0.1); c.fill(); c.stroke();
    // loops
    [-1, 1].forEach(function (sd) {
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(sd * 0.25, -0.38, sd * 0.62, -0.3, sd * 0.55, 0.02);
      c.bezierCurveTo(sd * 0.5, 0.22, sd * 0.2, 0.12, 0, 0);
      c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.3)';
      c.beginPath(); c.ellipse(sd * 0.3, -0.12, 0.1, 0.04, sd * -0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d21f35';
    });
    c.fillStyle = '#ff4a5c';
    c.beginPath(); c.ellipse(0, 0.02, 0.11, 0.1, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  }

  // ================================================================ background
  function renderBackground() {
    bgCanvas.width = Math.ceil(W * DPR);
    bgCanvas.height = Math.ceil(H * DPR);
    var c = bgCanvas.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    var sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a1430');
    sky.addColorStop(0.55, '#173a66');
    sky.addColorStop(1, '#2a5d8a');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);

    // soft colored glows
    [[W * 0.15, H * 0.2, '#3be0c0', 0.12], [W * 0.85, H * 0.28, '#b06cff', 0.1], [W * 0.5, H * 0.75, '#ffcf7a', 0.12]].forEach(function (g) {
      var rg = c.createRadialGradient(g[0], g[1], 0, g[0], g[1], Math.max(W, H) * 0.5);
      rg.addColorStop(0, hexA(g[2], g[3]));
      rg.addColorStop(1, hexA(g[2], 0));
      c.fillStyle = rg;
      c.fillRect(0, 0, W, H);
    });

    // stars
    var rnd = mulberry(7);
    var n = Math.round(W * H / 6000);
    for (var i = 0; i < n; i++) {
      var sx = rnd() * W, sy = rnd() * H * 0.6, sr = rnd() * 1.3 + 0.3;
      c.fillStyle = 'rgba(255,255,255,' + (0.25 + rnd() * 0.5) + ')';
      c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
    }

    // distant hills with fir trees
    var u = Math.min(W, H);
    function hill(baseY, amp, color, trees, treeColor, seed) {
      var r2 = mulberry(seed);
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, H);
      for (var x = 0; x <= W + 10; x += 10) c.lineTo(x, baseY + Math.sin(x / W * 5 + seed) * amp + Math.sin(x / W * 13 + seed * 2) * amp * 0.3);
      c.lineTo(W, H);
      c.closePath();
      c.fill();
      for (var k = 0; k < trees; k++) {
        var tx = r2() * W;
        var ty = baseY + Math.sin(tx / W * 5 + seed) * amp + Math.sin(tx / W * 13 + seed * 2) * amp * 0.3 + 2;
        var th = u * (0.07 + r2() * 0.07);
        drawFir(c, tx, ty, th, treeColor);
      }
    }
    hill(H * 0.74, H * 0.025, '#21507c', Math.round(W / 70), '#173e63', 3);
    hill(H * 0.82, H * 0.03, '#d5e4f3', Math.round(W / 110), '#1c4a52', 9);
    // front snow
    var sg = c.createLinearGradient(0, H * 0.88, 0, H);
    sg.addColorStop(0, '#f2f8ff'); sg.addColorStop(1, '#bcd3ea');
    c.fillStyle = sg;
    c.beginPath(); c.moveTo(0, H);
    for (var x = 0; x <= W + 10; x += 10) c.lineTo(x, H * 0.9 + Math.sin(x / W * 4 + 1) * H * 0.015);
    c.lineTo(W, H); c.closePath(); c.fill();

    // vignette
    var vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,20,.35)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    drawGarlandRope(c);
  }

  function drawFir(c, x, y, h, color) {
    c.fillStyle = color;
    var tiers = 3;
    for (var i = 0; i < tiers; i++) {
      var ty = y - h * (i / tiers) * 0.75;
      var tw = h * 0.42 * (1 - i * 0.22);
      c.beginPath();
      c.moveTo(x - tw, ty);
      c.quadraticCurveTo(x, ty + h * 0.06, x + tw, ty);
      c.lineTo(x, ty - h * 0.5);
      c.closePath();
      c.fill();
    }
    c.fillStyle = 'rgba(240,248,255,.55)';
    for (i = 0; i < tiers; i++) {
      ty = y - h * (i / tiers) * 0.75 - h * 0.5 + h * 0.02;
      c.beginPath(); c.moveTo(x, ty); c.lineTo(x - h * 0.06, ty + h * 0.08); c.lineTo(x + h * 0.06, ty + h * 0.08); c.closePath(); c.fill();
    }
  }

  // ================================================================ garland
  function garlandPoints() {
    var swags = Math.max(2, Math.round(W / 300));
    var seg = W / swags;
    var pts = [];
    for (var s = 0; s < swags; s++) {
      for (var i = 0; i <= 24; i++) {
        var f = i / 24;
        pts.push({ x: s * seg + f * seg, y: garlandY + Math.sin(f * Math.PI) * garlandSag, s: s, f: f });
      }
    }
    return { pts: pts, swags: swags, seg: seg };
  }

  // the fir rope does not change: it is drawn once into the background layer
  function drawGarlandRope(c) {
    var gp = garlandPoints();
    var pts = gp.pts;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (var s = 0; s < gp.swags; s++) {
      c.beginPath();
      for (var i = 0; i <= 24; i++) {
        var p = pts[s * 25 + i];
        if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
      }
      c.strokeStyle = '#0f4a2a'; c.lineWidth = 12; c.stroke();
      c.strokeStyle = '#1f7a43'; c.lineWidth = 8; c.setLineDash([3, 4]); c.stroke();
      c.strokeStyle = '#2f9a58'; c.lineWidth = 4; c.setLineDash([2, 6]); c.stroke();
      c.setLineDash([]);
    }
  }

  var glowCache = {};
  function glowSprite(col) {
    var key = col + DPR;
    if (glowCache[key]) return glowCache[key];
    var g = document.createElement('canvas');
    g.width = g.height = Math.ceil(36 * DPR);
    var c = g.getContext('2d');
    c.scale(DPR, DPR);
    var rg = c.createRadialGradient(18, 18, 0, 18, 18, 18);
    rg.addColorStop(0, hexA(col, 0.55));
    rg.addColorStop(1, hexA(col, 0));
    c.fillStyle = rg;
    c.fillRect(0, 0, 36, 36);
    glowCache[key] = g;
    return g;
  }

  // the blinking bulbs are drawn every frame
  function drawGarland(c) {
    var gp = garlandPoints();
    var spacing = 34, idx = 0;
    for (var s = 0; s < gp.swags; s++) {
      var count = Math.max(4, Math.round(gp.seg / spacing));
      for (var k = 1; k < count; k++) {
        var f = k / count;
        var bx = s * gp.seg + f * gp.seg;
        var by = garlandY + Math.sin(f * Math.PI) * garlandSag + 6;
        var col = LIGHT_COLORS[idx % LIGHT_COLORS.length];
        var on = 0.55 + 0.45 * Math.sin(now * 2.4 + idx * 1.7);
        c.globalAlpha = on;
        c.drawImage(glowSprite(col), bx - 18, by - 14, 36, 36);
        c.globalAlpha = 1;
        c.fillStyle = '#3c3c3c';
        c.fillRect(bx - 2.5, by - 3, 5, 4);
        c.fillStyle = col;
        c.globalAlpha = 0.55 + 0.45 * on;
        c.beginPath(); c.ellipse(bx, by + 5, 4, 6, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        c.fillStyle = 'rgba(255,255,255,.7)';
        c.fillRect(bx - 2, by + 2, 1.6, 1.6);
        idx++;
      }
    }
  }

  // ================================================================ snow and sparkles
  function initSnow() {
    var n = clamp(Math.round(W * H / 9000), 40, 170);
    snow = [];
    for (var i = 0; i < n; i++) snow.push(newFlake(true));
  }
  function newFlake(anyY) {
    var z = Math.random();
    return {
      x: Math.random() * W,
      y: anyY ? Math.random() * H : -5,
      r: 0.8 + z * 2.4,
      v: 18 + z * 42,
      ph: Math.random() * 6.28,
      a: 0.35 + z * 0.55
    };
  }
  function updateSnow(dt) {
    for (var i = 0; i < snow.length; i++) {
      var f = snow[i];
      f.y += f.v * dt;
      f.x += Math.sin(now * 0.8 + f.ph) * 12 * dt;
      if (f.y > H + 5) snow[i] = newFlake(false);
      if (f.x < -5) f.x = W + 5; else if (f.x > W + 5) f.x = -5;
    }
  }
  function drawSnow(c, front) {
    c.fillStyle = '#fff';
    for (var i = 0; i < snow.length; i++) {
      var f = snow[i];
      if ((f.r > 2.6) !== front) continue;
      c.globalAlpha = f.a;
      c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  function burst(x, y, n, spread, colors) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = spread * (0.3 + Math.random() * 0.7);
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - spread * 0.4,
        life: 0, max: 0.7 + Math.random() * 0.6,
        size: 3 + Math.random() * 5,
        rot: Math.random() * 3,
        col: colors[i % colors.length]
      });
    }
  }
  function updateSparks(dt) {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i];
      p.life += dt;
      if (p.life >= p.max) { sparks.splice(i, 1); continue; }
      p.vy += 260 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 4;
    }
  }
  function drawSparks(c) {
    for (var i = 0; i < sparks.length; i++) {
      var p = sparks[i];
      var k = 1 - p.life / p.max;
      c.globalAlpha = Math.min(1, k * 1.6);
      c.fillStyle = p.col;
      var s = p.size * (0.5 + k * 0.5);
      c.beginPath();
      for (var j = 0; j < 8; j++) {
        var a = p.rot + j * Math.PI / 4;
        var rr2 = j % 2 ? s * 0.28 : s;
        c.lineTo(p.x + Math.cos(a) * rr2, p.y + Math.sin(a) * rr2);
      }
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 1;
  }

  // ================================================================ layout
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    // keep the canvas backing store at or under ~2.5 megapixels
    DPR = Math.max(0.75, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.5e6 / Math.max(1, W * H))));
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    spriteCache = {};
    glowCache = {};
    kick();
    var hudOn = !ui.hud.classList.contains('hidden');
    var topB = hudOn ? ui.topbar.getBoundingClientRect().bottom : 0;
    var botT = hudOn ? ui.bottombar.getBoundingClientRect().top : H;
    var landscape = window.matchMedia('(min-aspect-ratio: 13/10)').matches;
    garlandSag = clamp(Math.min(W, H) * 0.045, 12, 30);
    garlandY = 2;
    // the hint / toast line sits between the board and the buttons with a 6 px gap below it
    var fs = parseFloat(getComputedStyle(ui.chip).fontSize) || 15;
    var chipH = Math.ceil(fs * 1.3 + 12 + 3);
    var badgeOut = 4;                   // the undo counter badge sticks out 4 px above its button
    var chipSpace = chipH + 6 + badgeOut + 4;
    var side = 8;
    var wideBottom = 0;
    if (landscape && hudOn) {
      // the corner buttons sit at the bottom; the board may use the full height between them
      var bb = ui.btnUndo.getBoundingClientRect();
      side = bb.right + 8;
      botT = H - Math.max(6, H - bb.bottom);
      // low landscape screens (phones): above the corner buttons the board may use the full width
      if (H <= 480) wideBottom = bb.top - badgeOut - 6;
    }
    area.x = side;
    area.w = W - side * 2;
    area.y = hudOn ? topB + 4 : 0;
    area.h = Math.max(50, botT - chipSpace - area.y);
    area.bottom = area.y + area.h;
    // low landscape screens: a long row of boxes is limited by the width, not the height;
    // computeLayout() may then use this wider (but a bit lower) area
    area.wide = null;
    if (wideBottom > area.y + 50) {
      var wb = Math.min(area.bottom, wideBottom);
      area.wide = { x: 8, w: W - 16, y: area.y, h: wb - area.y, bottom: wb };
    }
    var chipTop = botT - badgeOut - 6 - chipH;
    [ui.chip, ui.toast].forEach(function (el) {
      el.style.top = chipTop + 'px';
      el.style.height = chipH + 'px';
      el.style.lineHeight = (chipH - 12 - 3) + 'px';
      el.style.maxWidth = Math.max(120, area.w) + 'px';
    });
    renderBackground();
    initSnow();
    if (G) computeLayout();
    positionHand();
    if (mode !== 'boot') drawScene(0);
  }

  function computeLayout() {
    var n = G.boxes.length, cap = G.cap;
    var hRatio = 0.46 + 0.77 * cap;
    var liftR = 0.95, rowGapR = 0.12;
    var best = null;
    // the usual area; on low landscape screens also the full width above the corner buttons,
    // there with the usual or slightly narrower gaps between the boxes
    [[area, 0.3], [area.wide, 0.3], [area.wide, 0.2]].forEach(function (opt, o) {
      var A = opt[0], g = opt[1];
      if (!A) return;
      for (var rows = 1; rows <= 4; rows++) {
        var k = Math.ceil(n / rows);
        if (rows > 1 && Math.ceil(n / (rows - 1)) === k) continue;
        var wW = A.w / (k + (k - 1) * g);
        var wH = A.h / (rows * (hRatio + liftR) + (rows - 1) * rowGapR);
        var w = Math.min(wW, wH, 128, A.w / (k * (1 + g) + 0.4));
        // the other options only when the boxes really get bigger (by at least 2 px)
        if (!best || w > best.w + (o ? 2 : 0.5)) best = { rows: rows, k: k, w: w, A: A, g: g };
      }
    });
    var A = best.A, gapR = best.g;
    var w = Math.floor(best.w);
    var bh = w * hRatio;
    var rowsCount = best.rows;
    // balanced rows: e.g. 11 boxes -> 6 + 5
    var perRow = [];
    var left = n;
    for (var r = 0; r < rowsCount; r++) {
      var c = Math.ceil(left / (rowsCount - r));
      perRow.push(c);
      left -= c;
    }
    var blockH = rowsCount * (bh + w * liftR) + (rowsCount - 1) * w * rowGapR;
    var y0 = A.y + (A.h - blockH) / 2;
    var gap = w * gapR;
    // spread a bit wider when there is room
    var maxRow = Math.max.apply(null, perRow);
    var free = A.w - (maxRow * w + (maxRow - 1) * gap);
    if (free > 0) gap = Math.min(gap + free / Math.max(1, maxRow + 1), w * 0.75);
    var boxes = [];
    var idx = 0;
    for (r = 0; r < rowsCount; r++) {
      var cnt = perRow[r];
      var rowW = cnt * w + (cnt - 1) * gap;
      var x0 = A.x + (A.w - rowW) / 2;
      var by = y0 + r * (bh + w * liftR + w * rowGapR) + w * liftR;
      for (var i = 0; i < cnt; i++) {
        boxes.push({ x: x0 + i * (w + gap), y: by, w: w, h: bh, row: r, col: i, gap: gap });
        idx++;
      }
    }
    layout.boxes = boxes;
    layout.w = w;
    layout.geom = boxGeom(w, cap);
    layout.d = layout.geom.d;
    layout.perRow = perRow;
    layout.area = A;
  }

  function slotPos(b, i) {
    var B = layout.boxes[b];
    return { x: B.x + B.w / 2, y: B.y + layout.geom.slotY(i) };
  }

  function liftTargetY(b) {
    var B = layout.boxes[b];
    return B.y - layout.d * 0.55;
  }

  // Touch zone of a box: sideways to the middle of the gap, up and down over the whole row.
  // Between two rows the border is not in the middle: the first ~10 px under a box (or more of the
  // free space on big boxes) still belong to it, but the lifted ornament of the lower row stays with
  // the lower box.
  function rowSplit(B) {
    var bottom = B.y + B.h;                                  // bottom of the upper box
    var free = B.w * (0.95 + 0.12) - layout.d * 1.05;       // up to the top of a lower lifted ornament
    var share = Math.min(Math.max(10, free * 0.6), free + layout.d * 0.2);
    return bottom + share;
  }
  // The ornaments lifted out of the selected box (with cap and loop) always belong to that box: the
  // ~10 px zone under a box of the upper row works only where no lifted ornament is.
  function hitLifted(px, py) {
    if (!G || G.selected < 0 || !layout.boxes[G.selected]) return false;
    var B = layout.boxes[G.selected], d = layout.d;
    var cx = B.x + B.w / 2;
    var top = liftTargetY(G.selected) - d * 0.69;            // top of the hanger loop of the lifted ornament
    // a fingertip is not exact: 5 px above the loop still count as the ornament
    return Math.abs(px - cx) <= d / 2 + 2 && py >= top - 5 && py < B.y + B.h;
  }
  function hitBox(px, py) {
    if (hitLifted(px, py)) return G.selected;
    var rows = layout.perRow ? layout.perRow.length : 1;
    var best = -1, bestD = 1e9;
    for (var i = 0; i < layout.boxes.length; i++) {
      var B = layout.boxes[i];
      var mx = B.gap / 2;
      var rowPitch = B.h + B.w * (0.95 + 0.12);
      var A = layout.area || area;
      var top = B.row === 0 ? Math.min(B.y - B.w * 0.95, A.y) : rowSplit({ y: B.y - rowPitch, h: B.h, w: B.w });
      var bottom = B.row === rows - 1 ? Math.max(B.y + B.h + Math.max(10, B.w * 0.1), A.bottom || 0) : rowSplit(B);
      if (px >= B.x - mx && px <= B.x + B.w + mx && py >= top && py < bottom) {
        var d = Math.abs(px - (B.x + B.w / 2));
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  // ================================================================ level logic
  function colorState() {
    return G.boxes.map(function (b) { return b.map(function (o) { return o.c; }); });
  }

  // source: continue | next | replay | restart | level_select (docs/analytics.md)
  function startLevel(index, source) {
    index = clamp(index, 0, LEVELS.length - 1);
    var prev = G;
    // "Restart" (or the same level picked again) before a single move: the same attempt goes on
    var carry = !!(prev && prev.index === index && !prev.won && !prev.played && (source === 'restart' || source === 'level_select'));
    if (prev && !prev.won && !carry) failAttempt(prev, prev.index === index ? 'restart' : 'level_switch');
    clearTimeout(winTimer);
    clearTimeout(deadTimer);
    clearHighlights();
    var data = LEVELS[index];
    var keepExtra = G && G.index === index && G.extraUsed;
    G = {
      index: index,
      cap: data.c,
      par: data.p,
      boxes: data.b.map(function (box) {
        return box.map(function (c) { return { id: nextOrnId++, c: c, fly: null, land: -9, lift: 0, liftOff: 0 }; });
      }),
      history: [],
      undoLeft: UNDO_PER_LEVEL,
      moves: 0,
      extraUsed: keepExtra,
      selected: -1,
      cursor: 0,
      won: false,
      winAt: 0,
      shake: [],
      appear: [],
      doneAt: [],
      sparkedAt: [],
      startedAt: carry ? prev.startedAt : now,
      attempt: carry ? prev.attempt : 0,
      played: false,
      tutorial: index === 0,
      goalHint: index === 1,
      deadEnd: false
    };
    kick();
    if (keepExtra) G.boxes.push([]);
    G.boxes.forEach(function (b, i) { G.shake[i] = -9; G.appear[i] = -9; G.doneAt[i] = -9; });
    computeLayout();
    ui.win.classList.add('hidden');
    hideToast();
    updateHud();
    updateTutorial();
    if (!carry) G.attempt = beginAttempt(index, source || 'continue');
  }

  function updateHud() {
    ui.levelLabel.textContent = t('level', { n: G.index + 1 });
    ui.movesLabel.textContent = t('moves', { n: G.moves });
    ui.undoCount.textContent = String(G.undoLeft);
    ui.btnUndo.disabled = G.undoLeft <= 0 || !G.history.length || G.won || rewardPending;
    ui.btnRestart.disabled = rewardPending;
    var showExtra = rewardedSupported() && extraBoxAllowed() && !G.extraUsed && !G.won;
    ui.btnExtra.classList.toggle('hidden', !showExtra);
    ui.btnExtra.disabled = rewardPending;
    ui.btnLevels.disabled = rewardPending;
    ui.btnSettings.disabled = rewardPending;
  }

  function select(b) {
    G.selected = b;
    var box = G.boxes[b];
    var g = R.topGroup(colorState()[b]);
    var topY = slotPos(b, box.length - 1).y;
    var off = topY - liftTargetY(b);
    for (var i = box.length - g.count; i < box.length; i++) box[i].liftOff = off;
    SND.play('pick', 0.95 + Math.random() * 0.1);
  }

  function deselect() {
    G.selected = -1;
  }

  function tapBox(b) {
    if (!G || G.won || mode !== 'play' || isPaused() || rewardPending) return;
    kick();
    if (b < 0 || b >= G.boxes.length) return;
    var cs = colorState();
    if (G.selected === -1) {
      if (!cs[b].length || R.isTubeDone(cs[b], G.cap)) { G.shake[b] = now; SND.play('wrong'); return; }
      select(b);
    } else if (G.selected === b) {
      deselect();
      SND.play('drop', 1.1);
    } else if (R.canMove(cs, G.cap, G.selected, b)) {
      doMove(G.selected, b, false);
    } else if (cs[b].length && !R.isTubeDone(cs[b], G.cap)) {
      select(b);                       // another box with ornaments: just switch to it
    } else {
      G.shake[b] = now;                // a finished box cannot take anything
      SND.play('wrong');
      deselect();
    }
    updateTutorial();
  }

  // Moves ornaments and starts their flight animation.
  function doMove(from, to, isUndo) {
    var src = G.boxes[from], dst = G.boxes[to];
    var count;
    if (isUndo) count = isUndo;
    else count = R.moveCount(colorState(), G.cap, from, to);
    var flights = [];
    for (var i = 0; i < count; i++) {
      var o = src.pop();
      var pos = ornamentPos(o, from, src.length);
      o.fly = { t0: now + i * 0.07, dur: 0.34, sx: pos.x, sy: pos.y, from: from };
      o.lift = 0; o.liftOff = 0;
      dst.push(o);
      flights.push(o);
    }
    G.selected = -1;
    if (!isUndo) {
      G.history.push({ from: from, to: to, count: count });
      G.moves++;
      G.played = true;
    }
    SND.play('drop', 0.95 + Math.random() * 0.1);
    var cs = colorState();
    G.boxes.forEach(function (b, k) {
      var done = R.isTubeDone(cs[k], G.cap);
      if (done && G.doneAt[k] < 0) G.doneAt[k] = now + 0.07 * count + 0.3;
      if (!done) G.doneAt[k] = -9;
    });
    if (!isUndo && R.isSolved(cs, G.cap)) {
      G.won = true;
      G.winAt = now + 0.07 * count + 0.75;
      onWin();
    }
    if (!G.won) scheduleDeadEndCheck();
    updateHud();
  }

  // ---- dead ends: the board can no longer be solved (moves may still exist, they only loop)
  var DEAD_NODES = 25000;     // keeps the check short on big levels; unknown -> say nothing
  function scheduleDeadEndCheck() {
    clearTimeout(deadTimer);
    if (G.deadEnd) { G.deadEnd = false; hideToast(); clearHighlights(); }
    var level = G;
    deadTimer = setTimeout(function () {
      if (G !== level || G.won) return;
      var cs = colorState();
      if (R.solve(cs, G.cap, DEAD_NODES) !== null) return;   // solvable or unknown
      G.deadEnd = true;
      // can undo still help? walk back through the moves the player may still undo
      var undoHelps = false;
      var st = R.clone(cs);
      var steps = Math.min(G.undoLeft, G.history.length);
      for (var k = 1; k <= steps; k++) {
        var h = G.history[G.history.length - k];
        for (var j = 0; j < h.count; j++) st[h.from].push(st[h.to].pop());
        if (R.solve(st, G.cap, DEAD_NODES) !== null) { undoHelps = true; break; }
      }
      showToast(t('deadEnd'), 1e9);
      ui.btnRestart.classList.add('attention');
      if (undoHelps) ui.btnUndo.classList.add('attention');
    }, 120);
  }
  function clearHighlights() {
    ui.btnRestart.classList.remove('attention');
    ui.btnUndo.classList.remove('attention');
  }

  function undo() {
    if (!G || G.won || mode !== 'play' || isPaused() || rewardPending) return;
    if (!G.history.length) return;
    if (G.undoLeft <= 0) { showToast(t('noUndo'), 2); SND.play('wrong'); return; }
    var h = G.history.pop();
    G.undoLeft--;
    G.moves = Math.max(0, G.moves - 1);
    G.selected = -1;
    kick();
    doMove(h.to, h.from, h.count);
    hideToast();
    updateHud();
    updateTutorial();
  }

  function restart() {
    if (!G || mode !== 'play' || isPaused() || rewardPending) return;
    SND.play('button');
    startLevel(G.index, 'restart');
  }

  function addExtraBox() {
    if (!G || G.extraUsed || !extraBoxAllowed()) return;
    G.extraUsed = true;
    track('extra_box_granted', lvData(G.index, { late: !rewardPending }));   // late: after the game stopped waiting
    G.boxes.push([]);
    var k = G.boxes.length - 1;
    G.shake[k] = -9; G.appear[k] = now; G.doneAt[k] = -9;
    G.selected = -1;
    computeLayout();
    SND.play('reward');
    showToast(t('extraGot'), 2);
    ui.toast.style.background = 'rgba(24,120,70,.92)';
    clearHighlights();
    G.deadEnd = false;
    kick();
    updateHud();
  }

  function onWin() {
    var stars = G.moves <= Math.round(G.par * 1.2) + 2 ? 3 : G.moves <= Math.round(G.par * 1.6) + 5 ? 2 : 1;
    G.stars = stars;
    var n = G.index + 1;
    var firstWin = !(save.stars[G.index] > 0);
    var dur = r1(now - G.startedAt);
    track('progression_completed', lvData(G.index, {
      attempt: G.attempt, stars: stars, moves: G.moves, par: G.par, duration_sec: dur,
      undo_used: UNDO_PER_LEVEL - G.undoLeft, extra_box: !!G.extraUsed, first_win: firstWin
    }));
    if (G.index === 0 && firstWin && AN) AN.once('tutorial_completed', { duration_sec: dur, moves: G.moves });
    save.stars[G.index] = Math.max(save.stars[G.index] || 0, stars);
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, n + 1));
    save.level = Math.min(LEVELS.length, n + 1);
    storageSet(['os_level', 'os_unlocked', 'os_stars'], [String(save.level), String(save.unlocked), starsToString()]);
    sendMessage('level_completed', { level: String(n) });   // together with progression_completed
    hideHand();
    ui.chip.classList.add('hidden');
  }

  // stored as text with a letter in front so the platform never turns it into a number
  function starsToString() {
    var out = 's';
    for (var i = 0; i < save.stars.length; i++) out += String(save.stars[i] || 0);
    return out;
  }

  function showWinModal(level) {
    if (!G || G !== level || !G.won) return;   // the level was restarted or changed meanwhile
    var n = G.index + 1;
    ui.winTitle.textContent = t('winTitle');
    ui.winSub.textContent = n >= LEVELS.length ? t('allDone') : t('winSub', { n: n });
    ui.winMoves.textContent = t('winMoves', { n: G.moves });
    for (var i = 0; i < 3; i++) {
      var s = ui.stars[i];
      s.classList.remove('on');
      s.style.animationDelay = (0.25 + i * 0.22) + 's';
      if (i < G.stars) { void s.offsetWidth; s.classList.add('on'); }
    }
    ui.win.classList.remove('hidden');
    ui.btnNext.focus({ preventScroll: true });
  }

  function nextLevel() {
    if (ui.win.classList.contains('hidden')) return;
    SND.play('button');
    ui.win.classList.add('hidden');
    // natural pause between levels: let the Bridge decide whether an ad is shown
    if (!ANDROID) bridgeCall(function (b) { return b.advertisement.showInterstitial('level_completed'); });
    if (G.index + 1 >= LEVELS.length) { startLevel(G.index, 'replay'); openLevels('final'); return; }
    startLevel(Math.min(G.index + 1, save.unlocked - 1), 'next');   // never past the unlocked levels
  }

  function replayLevel() {
    SND.play('button');
    ui.win.classList.add('hidden');
    if (!ANDROID) bridgeCall(function (b) { return b.advertisement.showInterstitial('level_completed'); });
    G.extraUsed = false; // a replay is a new attempt
    startLevel(G.index, 'replay');
  }

  // ================================================================ tutorial and hints
  function updateTutorial() {
    if (!G) return;
    if (G.won || mode !== 'play') { hideHand(); return; }
    if (G.tutorial) {
      var sol = R.solveShortest(colorState(), G.cap, 5000);
      if (!sol || !sol.length) { hideHand(); return; }
      var m = sol[0];
      if (G.selected >= 0 && G.selected !== m[0]) {
        // the player picked another box: show where that one can go, or how to put it back
        var cs = colorState(), best = -1;
        for (var to = 0; to < cs.length; to++) {
          if (!R.canMove(cs, G.cap, G.selected, to)) continue;
          var tmp = R.clone(cs);
          R.applyMove(tmp, G.cap, G.selected, to);
          if (R.solveShortest(tmp, G.cap, 5000)) { best = to; break; }
          if (best < 0) best = to;
        }
        if (best >= 0) { pointHand(best, G.boxes[best].length); setChip(t('tut2')); }
        else { pointHand(G.selected, G.boxes[G.selected].length - 1); setChip(t('tutBack')); }
        return;
      }
      if (G.selected === m[0]) { pointHand(m[1], G.boxes[m[1]].length); setChip(t('tut2')); }
      else { pointHand(m[0], G.boxes[m[0]].length - 1); setChip(t(G.history.length ? 'tut3' : 'tut1')); }
      return;
    }
    hideHand();
    if (G.goalHint && !G.history.length) setChip(t('goal'));
    else ui.chip.classList.add('hidden');
  }

  function setChip(text) {
    ui.chip.textContent = text;
    ui.chip.classList.remove('hidden');
  }

  // The fingertip points at slot `slot` of box `b`: the top ornament to take,
  // or the free place where the ornament will land.
  var handTarget = -1, handSlot = 0;
  function pointHand(b, slot) {
    handTarget = b;
    handSlot = slot;
    ui.hand.classList.remove('hidden');
    positionHand();
  }
  function hideHand() {
    handTarget = -1;
    ui.hand.classList.add('hidden');
  }
  function handPoint() {
    if (handTarget < 0 || !layout.boxes[handTarget]) return null;
    return slotPos(handTarget, handSlot);
  }
  function positionHand() {
    var p = handPoint();
    if (!p) return;
    ui.hand.style.left = p.x + 'px';
    ui.hand.style.top = p.y + 'px';
  }

  function showToast(text, sec) {
    ui.toast.textContent = text;
    ui.toast.style.background = '';
    ui.toast.classList.remove('hidden');
    ui.chip.classList.add('hidden');
    toastTimer = sec;
  }
  function hideToast() {
    toastTimer = 0;
    ui.toast.classList.add('hidden');
  }
  // the board is still in a dead end: bring the "Dead end" line back (after another message or an ad)
  function restoreDeadEnd() {
    if (!G || !G.deadEnd || G.won || mode !== 'play' || rewardPending) return;
    if (toastTimer > 0 && !ui.toast.classList.contains('hidden')) return;   // another message is still up
    showToast(t('deadEnd'), 1e9);
  }

  // ================================================================ rendering
  function ornamentPos(o, b, i) {
    var home = slotPos(b, i);
    var x = home.x, y = home.y - o.liftOff * o.lift;
    if (o.fly) {
      var f = o.fly;
      var k = (now - f.t0) / f.dur;
      if (k <= 0) {
        x = f.sx; y = f.sy;
      } else if (k < 1) {
        var e = easeInOut(k);
        var topY = Math.min(f.sy, liftTargetY(b), liftTargetY(f.from)) - layout.d * 0.15;
        // cubic Bezier: up from the source, across, down into the slot
        var p1x = f.sx, p1y = topY, p2x = home.x, p2y = topY;
        var u = 1 - e;
        x = u * u * u * f.sx + 3 * u * u * e * p1x + 3 * u * e * e * p2x + e * e * e * home.x;
        y = u * u * u * f.sy + 3 * u * u * e * p1y + 3 * u * e * e * p2y + e * e * e * home.y;
      }
    }
    return { x: x, y: y };
  }

  function drawScene(dt) {
    var c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(bgCanvas, 0, 0);
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSnow(c, false);
    if (mode === 'title') drawTitleDecor(c);
    drawGarland(c);
    if (mode === 'play' && G) drawBoard(c, dt);
    drawSparks(c);
    drawSnow(c, true);
  }

  function drawTitleDecor(c) {
    var u = Math.min(W, H);
    var gp = garlandPoints();
    var picks = [0.18, 0.5, 0.82];
    var cols = [0, 3, 2];
    var d = clamp(u * 0.13, 44, 120);
    picks.forEach(function (fx, i) {
      var x = W * fx;
      var s = Math.floor(x / gp.seg), f = (x - s * gp.seg) / gp.seg;
      var y0 = garlandY + Math.sin(f * Math.PI) * garlandSag + 4;
      var len = H * (W < H ? [0.2, 0.3, 0.16][i] : [0.1, 0.16, 0.08][i]) + d * 0.2;
      var ang = Math.sin(now * 1.3 + i * 1.9) * 0.08;
      var ox = x + Math.sin(ang) * len, oy = y0 + Math.cos(ang) * len;
      c.strokeStyle = 'rgba(255,230,160,.8)';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x, y0); c.lineTo(ox, oy - d * 0.6); c.stroke();
      var spr = ornamentSprite(cols[i], d);
      c.save();
      c.translate(ox, oy);
      c.rotate(-ang);
      c.drawImage(spr, -spr.ox, -spr.oy + d * 0.0, spr.cssSize, spr.cssSize);
      c.restore();
    });
  }

  function drawBoard(c, dt) {
    var boxes = layout.boxes;
    var w = layout.w;
    var spr = boxSprite(w, layout.geom.h, G.cap);
    var k;
    // boxes
    for (var b = 0; b < G.boxes.length; b++) {
      var B = boxes[b];
      if (!B) continue;
      var sx = 0;
      var st = now - G.shake[b];
      if (st < 0.4 || now - G.appear[b] < 0.5) kick();
      if (st < 0.4) sx = Math.sin(st * 45) * w * 0.07 * (1 - st / 0.4);
      var sc = 1;
      var at = now - G.appear[b];
      if (at < 0.5) sc = ease(clamp(at / 0.5, 0, 1)) * (1 + 0.15 * Math.sin(clamp(at / 0.5, 0, 1) * Math.PI));
      B.sx = sx;
      c.save();
      c.translate(B.x + B.w / 2 + sx, B.y + B.h);
      c.scale(sc, sc);
      c.translate(-B.w / 2, -B.h);
      var done = G.doneAt[b] > 0 && now >= G.doneAt[b];
      if (G.selected === b || done) {
        c.save();
        c.shadowColor = done ? 'rgba(255,215,90,.95)' : 'rgba(255,240,170,.95)';
        c.shadowBlur = done ? 22 + 6 * Math.sin(now * 4) : 18;
        c.fillStyle = done ? 'rgba(255,200,80,.9)' : 'rgba(255,245,200,.9)';
        rr(c, 0, 0, B.w, B.h, B.w * 0.2);
        c.fill();
        c.restore();
      }
      c.drawImage(spr, -spr.pad, -spr.pad, spr.width / DPR, spr.height / DPR);
      if (keyboardMode && G.cursor === b) {
        c.save();
        c.strokeStyle = '#fff';
        c.lineWidth = 3;
        c.setLineDash([7, 5]);
        c.lineDashOffset = -now * 20;
        rr(c, -5, -B.w * 0.12, B.w + 10, B.h + B.w * 0.12 + 5, B.w * 0.24);
        c.stroke();
        c.restore();
      }
      c.restore();
    }

    // ornaments (resting first, flying ones on top)
    var flying = [];
    var lerp = 1 - Math.exp(-dt * 16);
    for (b = 0; b < G.boxes.length; b++) {
      var box = G.boxes[b];
      if (!boxes[b]) continue;
      var group = G.selected === b ? R.topGroup(colorState()[b]).count : 0;
      for (var i = 0; i < box.length; i++) {
        var o = box[i];
        var target = (G.selected === b && i >= box.length - group) ? 1 : 0;
        o.lift += (target - o.lift) * lerp;
        if (Math.abs(target - o.lift) > 0.002 || o.fly || now - o.land < 0.5) kick();
        if (o.fly && now >= o.fly.t0 + o.fly.dur) {
          o.fly = null;
          o.land = now;
        }
        if (o.fly && now >= o.fly.t0) { flying.push([o, b, i]); continue; }
        drawOrn(c, o, b, i);
      }
    }
    for (k = 0; k < flying.length; k++) drawOrn(c, flying[k][0], flying[k][1], flying[k][2]);

    // bows on finished boxes
    for (b = 0; b < G.boxes.length; b++) {
      if (!(G.doneAt[b] > 0) || now < G.doneAt[b]) continue;
      var B2 = boxes[b];
      var bt = now - G.doneAt[b];
      if (bt < 0.6) kick();
      if (G.sparkedAt[b] !== G.doneAt[b]) {
        G.sparkedAt[b] = G.doneAt[b];
        burst(B2.x + B2.w / 2, B2.y + B2.w * 0.1, 22, 240, ['#fff6c2', '#ffd34d', '#ffffff', COLORS[G.boxes[b][0].c].light]);
        SND.play('complete');
      }
      var s = w * 0.62 * (bt < 0.4 ? ease(bt / 0.4) * (1 + 0.25 * Math.sin(bt / 0.4 * Math.PI)) : 1);
      drawBow(c, B2.x + B2.w / 2 + (B2.sx || 0), B2.y - w * 0.04, s);
    }

    // win: celebrate, then show the result card
    if (G.won && G.winAt) kick();
    for (b = 0; b < G.boxes.length; b++) if (G.doneAt[b] > now) kick();
    if (G.won && G.winAt && now >= G.winAt) {
      G.winAt = 0;
      SND.play('win');
      for (b = 0; b < boxes.length; b++) {
        if (G.boxes[b].length) burst(boxes[b].x + boxes[b].w / 2, boxes[b].y + boxes[b].h * 0.4, 14, 300, ['#ffd34d', '#ffffff', '#ff6b7a', '#7dffb0']);
      }
      var wonLevel = G;
      clearTimeout(winTimer);
      winTimer = setTimeout(function () { showWinModal(wonLevel); }, 900);
    }
  }

  function drawOrn(c, o, b, i) {
    var p = ornamentPos(o, b, i);
    var d = layout.d;
    var spr = ornamentSprite(o.c, d);
    var lt = now - o.land;
    var sxs = 1, sys = 1, dy = 0;
    if (lt < 0.45) {
      var k = lt / 0.45;
      var wob = Math.sin(k * Math.PI * 3) * (1 - k) * 0.16;
      sxs = 1 + wob; sys = 1 - wob;
      dy = d * wob * 0.3;
    }
    var bx = layout.boxes[b];
    var x = p.x + (o.fly ? 0 : (bx.sx || 0));
    if (sxs !== 1) {
      c.save();
      c.translate(x, p.y + d / 2 + dy);
      c.scale(sxs, sys);
      c.drawImage(spr, -spr.ox, -spr.oy - d / 2, spr.cssSize, spr.cssSize);
      c.restore();
    } else {
      c.drawImage(spr, x - spr.ox, p.y - spr.oy, spr.cssSize, spr.cssSize);
    }
  }

  // ================================================================ main loop
  function frame(ts) {
    requestAnimationFrame(frame);
    if (AN) AN.frame(ts, gameplayActive());
    var tsec = ts / 1000;
    var dt = lastFrame ? Math.min(0.05, tsec - lastFrame) : 0.016;
    lastFrame = tsec;
    if (isPaused()) return;           // freeze the game while paused
    now += dt;
    updateSnow(dt);
    updateSparks(dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) { hideToast(); updateTutorial(); restoreDeadEnd(); }
    }
    // nothing is moving: snow and lights are redrawn ~20 times a second instead of 60
    if (sparks.length) kick();
    if (now - lastKick > 1 && now - lastDraw < 0.05) return;
    drawScene(lastDraw < 0 ? dt : Math.min(0.1, now - lastDraw));
    lastDraw = now;
  }
  function kick() { lastKick = now; }

  // ================================================================ input
  function onPointerDown(e) {
    if (mode !== 'play' || !G) return;
    keyboardMode = false;
    SND.unlock();
    var rect = canvas.getBoundingClientRect();
    var b = hitBox(e.clientX - rect.left, e.clientY - rect.top);
    if (b >= 0) { G.cursor = b; tapBox(b); }
    else if (G.selected >= 0) { deselect(); }
  }

  function onKey(e) {
    var k = e.key;
    if (k === 'Escape' || k === 'Esc') return;   // Esc is left to the browser
    SND.unlock();
    var handled = true;
    var act = document.activeElement;
    var isActivate = k === 'Enter' || k === ' ' || k === 'Spacebar';
    if (isActivate && act === ui.levelInfo && mode === 'play') { e.preventDefault(); openLevels('label'); return; }
    // a focused button / slider keeps Enter and Space for itself
    if (isActivate && act && act !== document.body && (act.tagName === 'BUTTON' || act.tagName === 'INPUT')) return;
    if (mode === 'title') {
      if (k === 'Enter' || k === ' ' || k === 'Spacebar') play();
      else handled = false;
    } else if (!ui.levels.classList.contains('hidden') || !ui.settings.classList.contains('hidden')) {
      handled = false;                 // the level list uses normal Tab / Enter focus
    } else if (!ui.win.classList.contains('hidden')) {
      if (k === 'Enter' || k === ' ' || k === 'Spacebar' || k === 'n' || k === 'N') nextLevel();
      else if (k === 'r' || k === 'R' || k === 'к' || k === 'К') replayLevel();
      else handled = false;
    } else if (mode === 'play' && G) {
      var n = G.boxes.length;
      if (/^[0-9]$/.test(k)) {
        var idx = k === '0' ? 9 : parseInt(k, 10) - 1;
        if (idx < n) { keyboardMode = true; G.cursor = idx; tapBox(idx); }
      } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        keyboardMode = true;
        G.cursor = (G.cursor + (k === 'ArrowRight' ? 1 : -1) + n) % n;
      } else if (k === 'ArrowDown' || k === 'ArrowUp') {
        keyboardMode = true;
        var B = layout.boxes[G.cursor];
        var rowStart = 0, r;
        for (r = 0; r < B.row; r++) rowStart += layout.perRow[r];
        var nr = B.row + (k === 'ArrowDown' ? 1 : -1);
        if (nr >= 0 && nr < layout.perRow.length) {
          var ns = 0;
          for (r = 0; r < nr; r++) ns += layout.perRow[r];
          G.cursor = ns + Math.min(B.col, layout.perRow[nr] - 1);
        }
      } else if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
        keyboardMode = true;
        tapBox(G.cursor);
      } else if (k === 'u' || k === 'U' || k === 'г' || k === 'Г' || k === 'Backspace') {
        undo();
      } else if (k === 'r' || k === 'R' || k === 'к' || k === 'К') {
        restart();
      } else if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') {
        toggleMute();
      } else if (k === 's' || k === 'S' || k === 'ы' || k === 'Ы') {
        openSettings('key');
      } else if (k === 'l' || k === 'L' || k === 'д' || k === 'Д') {
        openLevels('key');
      } else handled = false;
    } else handled = false;
    if (handled) e.preventDefault();
  }

  // M key: everything off / on at once
  function toggleMute() {
    var on = !(save.settings.musicOn || save.settings.sfxOn);
    save.settings.musicOn = on;
    save.settings.sfxOn = on;
    track('settings_changed', { setting: 'all', enabled: on, source: 'key' });
    settingsChanged();
    if (on) SND.play('button');
  }

  // ================================================================ settings
  // stored as text with a letter in front so the platform never turns it into a number
  function settingsToString() {
    var st = save.settings;
    return 'v1:' + (st.musicOn ? 1 : 0) + ':' + Math.round(st.musicVol * 100) + ':' + (st.sfxOn ? 1 : 0) + ':' + Math.round(st.sfxVol * 100);
  }
  function parseSettings(v) {
    if (typeof v !== 'string' || v.indexOf('v1:') !== 0) return;
    var p = v.split(':');
    save.settings.musicOn = p[1] === '1';
    save.settings.musicVol = clamp((parseInt(p[2], 10) || 0) / 100, 0, 1);
    save.settings.sfxOn = p[3] === '1';
    save.settings.sfxVol = clamp((parseInt(p[4], 10) || 0) / 100, 0, 1);
  }
  function renderSettings() {
    var st = save.settings;
    ui.swMusic.setAttribute('aria-checked', String(st.musicOn));
    ui.swSfx.setAttribute('aria-checked', String(st.sfxOn));
    ui.volMusic.value = Math.round(st.musicVol * 100);
    ui.volSfx.value = Math.round(st.sfxVol * 100);
    ui.volMusic.disabled = !st.musicOn;
    ui.volSfx.disabled = !st.sfxOn;
  }
  function settingsChanged() {
    updateAudio();
    renderSettings();
    storageSet(['os_settings'], [settingsToString()]);
  }
  function openSettings(source) {
    if (rewardPending) return;       // not while a rewarded ad is on its way
    track('settings_opened', { source: source || 'button' });
    SND.play('button');
    renderSettings();
    ui.settings.classList.remove('hidden');
    ui.btnCloseSettings.focus({ preventScroll: true });
  }
  function closeSettings() {
    SND.play('button');
    ui.settings.classList.add('hidden');
  }

  function watchAdForBox() {
    if (!G || G.extraUsed || rewardPending || G.won) return;
    if (!rewardedSupported() || !extraBoxAllowed()) return;
    track('extra_box_requested', lvData(G.index, { dead_end: !!G.deadEnd }));
    SND.play('button');
    rewardPending = true;          // stays until the ad reports closed / failed
    rewardOpened = false;
    rewardToken = G;
    G.selected = -1;
    // no answer at all within 12 s -> give the board back
    clearTimeout(rewardWatch);
    rewardWatch = setTimeout(function () { if (!rewardOpened) endRewardWait(true); }, 12000);
    updateHud();
    setAdWait(true);
    try {
      // Bridge 2.4.1 returns undefined here; the result comes only through the state events
      var r = bridge.advertisement.showRewarded('extra_box');
      if (r && r.catch) r.catch(function () {});
    } catch (e) {
      endRewardWait(true);
    }
  }

  // The rewarded ad is over (or never came): unlock everything.
  // rewardToken stays: the platform may still show the ad and report "rewarded" later.
  function endRewardWait(failed) {
    clearTimeout(rewardWatch);
    var was = rewardPending;
    rewardPending = false;
    rewardOpened = false;
    setPause('ad', false);
    setAdWait(false);
    if (G) updateHud();
    if (was && failed) showToast(t('adFail'), 2.5);   // the dead-end line comes back after it
    else restoreDeadEnd();                             // closed without a reward
  }
  function setAdWait(on) {
    document.body.classList.toggle('ad-wait', !!on);
    if (on) { hideHand(); hideToast(); setChip(t('adLoading')); }
    else if (G) { ui.chip.classList.add('hidden'); updateTutorial(); }
  }

  // ================================================================ level list
  // source: button | label | key | final
  function openLevels(source) {
    if (rewardPending) return;       // changing the level now would lose the reward
    track('levels_opened', { source: source || 'button', step_index: G ? G.index + 1 : 0 });
    SND.play('button');
    var grid = ui.levelsGrid;
    grid.innerHTML = '';
    var star = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
    var check = '<span class="check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
    var lock = '<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
    for (var i = 0; i < LEVELS.length; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lv';
      var open = i < save.unlocked;
      var st = save.stars[i] || 0;
      btn.setAttribute('data-level', String(i));
      btn.addEventListener('click', onLevelPick);
      if (!open) {
        btn.classList.add('locked');
        btn.innerHTML = lock;
        btn.setAttribute('aria-label', t('level', { n: i + 1 }) + ' — ' + t('locked'));
      } else {
        if (G && i === G.index) btn.classList.add('current');
        else if (st) btn.classList.add('done');
        var mini = '<span class="mini">';
        for (var s = 0; s < 3; s++) mini += '<span class="' + (s < st ? 'on' : '') + '">' + star + '</span>';
        btn.innerHTML = '<span>' + (i + 1) + '</span>' + mini + '</span>' + (st ? check : '');
        btn.setAttribute('aria-label', t('level', { n: i + 1 }));
      }
      grid.appendChild(btn);
    }
    ui.levels.classList.remove('hidden');
    var cur = grid.querySelector('.current');
    if (cur) {
      cur.focus({ preventScroll: true });
      grid.scrollTop = cur.offsetTop - grid.clientHeight / 2;
    }
  }
  function onLevelPick(e) {
    var i = parseInt(e.currentTarget.getAttribute('data-level'), 10);
    if (i >= save.unlocked) { SND.play('wrong'); return; }   // locked: nothing happens
    ui.levels.classList.add('hidden');
    SND.play('button');
    // remember the chosen level so a reload resumes on it (one write per explicit choice)
    if (save.level !== i + 1) { save.level = i + 1; storageSet(['os_level'], [String(save.level)]); }
    track('level_selected', lvData(i, { from_step_index: G ? G.index + 1 : 0, completed: (save.stars[i] || 0) > 0 }));
    startLevel(i, 'level_select');
  }
  function closeLevels() {
    SND.play('button');
    ui.levels.classList.add('hidden');
  }

  // ================================================================ start
  function applyTexts() {
    document.title = t('title');
    ui.titleText.textContent = t('title');
    ui.subtitle.textContent = t('subtitle');
    ui.btnPlay.textContent = t('play');
    ui.extraLabel.textContent = t('extra');
    ui.nextLabel.textContent = t('next');
    ui.replayLabel.textContent = t('replay');
    ui.levelsTitle.textContent = t('levels');
    ui.btnUndo.setAttribute('aria-label', t('undo'));
    ui.btnRestart.setAttribute('aria-label', t('restart'));
    ui.btnLevels.setAttribute('aria-label', t('levels'));
    ui.btnSettings.setAttribute('aria-label', t('settings'));
    ui.levelInfo.setAttribute('aria-label', t('levels'));
    ui.settingsTitle.textContent = t('settings');
    ui.lblMusic.textContent = t('music');
    ui.lblSfx.textContent = t('sfx');
    ui.swMusic.setAttribute('aria-label', t('music'));
    ui.swSfx.setAttribute('aria-label', t('sfx'));
    ui.volMusic.setAttribute('aria-label', t('musicVol'));
    ui.volSfx.setAttribute('aria-label', t('sfxVol'));
    ui.btnCloseSettings.setAttribute('aria-label', t('close'));
    ui.btnExtra.setAttribute('aria-label', t('extra'));
    ui.btnCloseLevels.setAttribute('aria-label', t('close'));
    // only in VK / OK: on Playgama and Yandex the VK community address is not shown (no other platforms there)
    var supText = ANDROID || !inVkOk() ? '' : (inOk() ? SUPPORT.ok : SUPPORT.vk) || '';
    var showSup = !!supText;
    ui.supportLine.textContent = showSup ? t('support') + ': ' + supText : '';
    ui.supportLine.classList.toggle('hidden', !showSup);
  }

  function play() {
    if (mode !== 'title') return;
    SND.unlock();
    SND.playMusic();
    SND.play('button');
    mode = 'play';
    ui.title.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    startLevel(clamp(save.level, 1, save.unlocked) - 1, 'continue');
    resize();
  }

  function parseSave(values) {
    var v = values || [];
    var lvl = parseInt(v[0], 10), unl = parseInt(v[1], 10);
    save.unlocked = clamp(isNaN(unl) ? 1 : unl, 1, LEVELS.length);
    save.level = clamp(isNaN(lvl) ? 1 : lvl, 1, save.unlocked);
    save.stars = [];
    var s = typeof v[2] === 'string' && v[2].charAt(0) === 's' ? v[2].slice(1) : '';
    for (var i = 0; i < s.length && i < LEVELS.length; i++) save.stars[i] = clamp(parseInt(s[i], 10) || 0, 0, 3);
    parseSettings(v[3]);
  }

  function bindEvents() {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('selectstart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('visibilitychange', function () { setPause('hidden', document.hidden); });
    subscribeVkView();
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    ui.btnPlay.addEventListener('click', play);
    ui.btnUndo.addEventListener('click', function () { SND.unlock(); undo(); });
    ui.btnRestart.addEventListener('click', function () { SND.unlock(); restart(); });
    ui.btnSettings.addEventListener('click', function () { SND.unlock(); openSettings('button'); });
    ui.levelInfo.addEventListener('click', function () { SND.unlock(); if (mode === 'play') openLevels('label'); });
    ui.btnCloseSettings.addEventListener('click', closeSettings);
    ui.settings.addEventListener('pointerdown', function (e) { if (e.target === ui.settings) closeSettings(); });
    ui.levels.addEventListener('pointerdown', function (e) { if (e.target === ui.levels) closeLevels(); });
    ui.swMusic.addEventListener('click', function () {
      save.settings.musicOn = !save.settings.musicOn;
      track('settings_changed', { setting: 'music', enabled: save.settings.musicOn, source: 'settings' });
      settingsChanged(); SND.play('button');
    });
    ui.swSfx.addEventListener('click', function () {
      save.settings.sfxOn = !save.settings.sfxOn;
      track('settings_changed', { setting: 'sfx', enabled: save.settings.sfxOn, source: 'settings' });
      settingsChanged(); SND.play('button');
    });
    // sliders: live volume while dragging, saved once when released
    ui.volMusic.addEventListener('input', function () { save.settings.musicVol = ui.volMusic.value / 100; updateAudio(); });
    ui.volSfx.addEventListener('input', function () { save.settings.sfxVol = ui.volSfx.value / 100; updateAudio(); });
    ui.volMusic.addEventListener('change', settingsChanged);
    ui.volSfx.addEventListener('change', function () { settingsChanged(); SND.play('drop'); });
    ui.btnLevels.addEventListener('click', function () { SND.unlock(); openLevels('button'); });
    ui.btnCloseLevels.addEventListener('click', closeLevels);
    ui.btnExtra.addEventListener('click', function () { SND.unlock(); watchAdForBox(); });
    ui.btnNext.addEventListener('click', nextLevel);
    ui.btnReplay.addEventListener('click', replayLevel);
    // buttons should not steal Space/Enter from the board after a click
    document.querySelectorAll('#hud button').forEach(function (b) {
      b.addEventListener('pointerup', function () { b.blur(); });
    });

    if (bridge) {
      var EV = bridge.EVENT_NAME || {};
      try {
        bridge.platform.on(EV.PAUSE_STATE_CHANGED || 'pause_state_changed', function (p) { setPause('platform', p); });
        bridge.platform.on(EV.AUDIO_STATE_CHANGED || 'audio_state_changed', function (on) { platformAudio = !!on; updateAudio(); });
      } catch (e) { /* platform events unavailable */ }
      try {
        bridge.advertisement.on(EV.INTERSTITIAL_STATE_CHANGED || 'interstitial_state_changed', function (s) {
          if (s === 'opened') setPause('ad', true);
          else if (s === 'closed' || s === 'failed') setPause('ad', false);
        });
        bridge.advertisement.on(EV.REWARDED_STATE_CHANGED || 'rewarded_state_changed', function (s) {
          if (s === 'opened') {
            setPause('ad', true);
            if (rewardPending) {
              rewardOpened = true;
              // opened but never closed: give up after 3 minutes
              clearTimeout(rewardWatch);
              rewardWatch = setTimeout(function () { endRewardWait(false); }, 180000);
            }
          } else if (s === 'rewarded') {
            // the only place where the reward is granted: only for the same attempt of the same level,
            // not won yet, and at most one extra box per level (a late answer after the 12 s wait counts too)
            if (rewardToken && rewardToken === G && !G.won && !G.extraUsed) addExtraBox();
          } else if (s === 'closed' || s === 'failed') {
            setPause('ad', false);
            if (rewardPending) endRewardWait(s === 'failed');
            if (G) updateHud();
          }
        });
      } catch (e2) { /* ads unavailable */ }
    }
  }

  // VK: the app is minimized / restored (VKWebAppViewHide / VKWebAppViewRestore). Playgama Bridge 2.4.1
  // does not listen to these, so we subscribe to VK Bridge ourselves (rule 2.2.5 of VK: silence on ViewHide).
  // OK has no such events: there visibilitychange does the job.
  function subscribeVkView() {
    var vkb = null;
    try { if (bridge && bridge.platform && bridge.platform.sdk && typeof bridge.platform.sdk.subscribe === 'function') vkb = bridge.platform.sdk; } catch (e) { vkb = null; }
    if (!vkb && window.vkBridge && typeof window.vkBridge.subscribe === 'function') vkb = window.vkBridge;
    if (!vkb) return;
    try {
      vkb.subscribe(function (e) {
        var type = e && e.detail && e.detail.type;
        if (type === 'VKWebAppViewHide') setPause('view', true);
        else if (type === 'VKWebAppViewRestore') setPause('view', false);
      });
    } catch (e2) { /* no VK events */ }
    // safety: if a ViewRestore is ever lost, the next touch means the app is on screen again
    document.addEventListener('pointerdown', function () { if (pause.view) setPause('view', false); }, true);
  }

  // launched inside VK or OK: by the Bridge, or by the launch parameters (when the Bridge did not start)
  // OK: Bridge 2.4.1 inside OK may answer 'vk', so the launch address decides
  // (vk_client=ok / vk_platform=*_ok — OK through VK Bridge; logged_user_id + application_key — OK directly).
  function inOk() {
    var id = '';
    try { id = bridge ? String(bridge.platform.id || '') : ''; } catch (e) { id = ''; }
    if (id === 'ok') return true;
    var q = '';
    try { q = location.search || ''; } catch (e2) { q = ''; }
    return /[?&]vk_client=ok(&|$)/.test(q) || /[?&]vk_platform=[a-z_]+_ok(&|$)/.test(q) ||
      (/[?&](logged_user_id|application_key)=/.test(q) && /[?&](api_server|session_key|auth_sig)=/.test(q));
  }

  function inVkOk() {
    var id = '';
    try { id = bridge ? String(bridge.platform.id || '') : ''; } catch (e) { id = ''; }
    if (id === 'vk' || id === 'ok') return true;
    var q = '';
    try { q = location.search || ''; } catch (e2) { q = ''; }
    return /[?&](vk_app_id|vk_platform|vk_client|vk_user_id)=/.test(q) ||
      (/[?&](logged_user_id|application_key)=/.test(q) && /[?&](api_server|session_key|auth_sig)=/.test(q));
  }

  // language: the launch parameter of VK / OK first (vk_language, then language), otherwise the platform.
  // Bridge 2.4.1 reads only the old `language` and falls back to navigator.language, so a moderator with an
  // English browser would see the game in English. ru / uk / be / kk -> Russian, anything else -> English.
  function launchLanguage() {
    var code = '';
    try {
      var q = new URLSearchParams(location.search);
      code = q.get('vk_language') || q.get('language') || '';
    } catch (e) { code = ''; }
    if (!code) return '';
    code = String(code).toLowerCase();
    return /^(ru|uk|be|kk)/.test(code) ? 'ru' : 'en';
  }

  function start() {
    var lang = launchLanguage();
    // inside VK / OK without a language parameter: Russian (the main language of the game there)
    if (!lang && inVkOk()) lang = 'ru';
    if (!lang) {
      try { lang = bridge ? bridge.platform.language : 'en'; } catch (e) { lang = 'en'; }
    }
    I18N.setLanguage(lang);
    applyTexts();
    if (AN) AN.init(bridge, { gameVersion: GAME_VERSION, targetFps: 60 });

    if (bridge) {
      try { platformAudio = bridge.platform.isAudioEnabled !== false; } catch (e) { platformAudio = true; }
      try { if (bridge.advertisement.interstitialState === 'opened') pause.ad = true; } catch (e3) { /* ignore */ }
    }
    bindEvents();
    setPause('hidden', document.hidden);

    var load = bridge
      ? Promise.resolve().then(function () { return bridge.storage.get(KEYS); }).catch(function () { return []; })
      : Promise.resolve([]);
    Promise.all([load, SND.init()]).then(function (res) {
      parseSave(res[0]);
      updateAudio();
      mode = 'title';
      ui.title.classList.remove('hidden');
      resize();
      requestAnimationFrame(frame);
      ui.boot.classList.add('hidden');
      sendMessage('game_ready');
      if (AN) AN.ready();
    });
  }

  // Small read-only hook for automated tests.
  window.OSGame = {
    start: start,
    // Android app: the "Back" button. Closes an open window and returns true; false = nothing to close (the app exits).
    back: function () {
      if (!ui.settings.classList.contains('hidden')) { closeSettings(); return true; }
      if (!ui.levels.classList.contains('hidden')) { closeLevels(); return true; }
      return false;
    },
    // Android app: the app went to the background (true) or came back (false) -> pause and silence, like a hidden tab.
    appPause: function (on) { setPause('view', !!on); },
    debug: function () {
      return {
        mode: mode,
        level: G ? G.index + 1 : 0,
        moves: G ? G.moves : 0,
        won: G ? G.won : false,
        selected: G ? G.selected : -1,
        undoLeft: G ? G.undoLeft : 0,
        boxes: G ? colorState() : [],
        cap: G ? G.cap : 0,
        rects: layout.boxes.map(function (B) { return { x: B.x, y: B.y, w: B.w, h: B.h }; }),
        save: JSON.parse(JSON.stringify(save)),
        paused: isPaused(),
        audible: SND.isAudible(),
        audio: SND.stats(),
        hand: ui.hand.classList.contains('hidden') ? null : handPoint(),
        lang: I18N.lang()
      };
    }
  };
})();
