/*
 * Sound: recorded mp3 files from /audio (see CREDITS.md), played with Web Audio.
 * Falls back to <audio> elements when the files cannot be fetched.
 */
(function () {
  'use strict';
  var FILES = {
    music: 'audio/music.mp3',
    pick: 'audio/pick.mp3',
    drop: 'audio/drop.mp3',
    complete: 'audio/complete.mp3',
    win: 'audio/win.mp3',
    button: 'audio/button.mp3',
    wrong: 'audio/wrong.mp3',
    reward: 'audio/reward.mp3'
  };
  var VOL = { music: 0.42, pick: 0.7, drop: 0.75, complete: 0.8, win: 0.85, button: 0.55, wrong: 0.6, reward: 0.8 };

  var ctx = null, master = null, musicBus = null, sfxBus = null, buffers = {}, elements = {};
  var mix = { musicOn: true, musicVol: 0.6, sfxOn: true, sfxVol: 0.8 };
  var stats = { played: 0 };
  var unlocked = false, audible = false, musicSource = null, musicWanted = false, useElements = false;

  function decode(data) {
    return new Promise(function (resolve, reject) {
      var p = ctx.decodeAudioData(data, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  var raw = {};

  // Fetch the files early; decoding waits for the AudioContext (first tap).
  function loadAll() {
    var names = Object.keys(FILES);
    return Promise.all(names.map(function (name) {
      return fetch(FILES[name])
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (data) { raw[name] = data; });
    })).catch(function () { useElements = true; });
  }

  function makeElements() {
    Object.keys(FILES).forEach(function (name) {
      var a = new Audio(FILES[name]);
      a.preload = 'auto';
      if (name === 'music') a.loop = true;
      elements[name] = a;
    });
  }

  function decodeAll() {
    return Promise.all(Object.keys(raw).map(function (name) {
      return decode(raw[name]).then(function (buf) { buffers[name] = buf; }, function () {});
    }));
  }

  function startMusic() {
    if (!musicWanted || !unlocked) return;
    if (useElements) {
      var m = elements.music;
      if (m && audible) { m.volume = musicLevel(); var p = m.play(); if (p && p.catch) p.catch(function () {}); }
      return;
    }
    if (musicSource || !buffers.music || !ctx) return;
    var src = ctx.createBufferSource();
    src.buffer = buffers.music;
    src.loop = true;
    // skip the mp3 encoder padding so the loop has no gap
    src.loopStart = 0.03;
    src.loopEnd = buffers.music.duration - 0.03;
    var g = ctx.createGain();
    g.gain.value = VOL.music;
    src.connect(g).connect(musicBus);
    src.start(0, 0.03);
    musicSource = src;
  }

  function musicLevel() { return mix.musicOn ? VOL.music * mix.musicVol : 0; }
  function applyMix() {
    if (musicBus) musicBus.gain.value = mix.musicOn ? mix.musicVol : 0;
    if (sfxBus) sfxBus.gain.value = mix.sfxOn ? mix.sfxVol : 0;
    if (elements.music) elements.music.volume = musicLevel();
  }

  function apply() {
    applyMix();
    if (useElements) {
      Object.keys(elements).forEach(function (k) { elements[k].muted = !audible; });
      if (elements.music) {
        if (audible && musicWanted && unlocked) startMusic();
        else elements.music.pause();
      }
      return;
    }
    if (!ctx) return;
    if (audible && unlocked) {
      if (ctx.state !== 'running') ctx.resume().catch(function () {});
      startMusic();
    } else if (ctx.state === 'running') {
      ctx.suspend().catch(function () {});
    }
  }

  var loaded = loadAll();

  window.OSAudio = {
    init: function () {
      return loaded;
    },
    // must be called from a user gesture (tap / key press)
    unlock: function () {
      if (unlocked) return;
      unlocked = true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!useElements && AC) {
        try {
          ctx = new AC();
          master = ctx.createGain();
          master.connect(ctx.destination);
          musicBus = ctx.createGain(); musicBus.connect(master);
          sfxBus = ctx.createGain(); sfxBus.connect(master);
          applyMix();
          if (!audible) ctx.suspend().catch(function () {});
        } catch (e) { ctx = null; }
      }
      if (!ctx) {
        useElements = true;
        makeElements();
        apply();
        return;
      }
      loaded.then(function () {
        if (useElements) { makeElements(); apply(); }
        else decodeAll().then(apply);
      });
      apply();
    },
    playMusic: function () { musicWanted = true; apply(); },
    setAudible: function (on) {
      on = !!on;
      if (on === audible) return;
      audible = on;
      apply();
    },
    isAudible: function () { return audible; },
    // separate music / effects switches and volumes (0..1)
    setMix: function (m) {
      mix.musicOn = !!m.musicOn; mix.sfxOn = !!m.sfxOn;
      mix.musicVol = Math.max(0, Math.min(1, +m.musicVol || 0));
      mix.sfxVol = Math.max(0, Math.min(1, +m.sfxVol || 0));
      applyMix();
    },
    stats: function () {
      return { state: ctx ? ctx.state : (useElements ? 'elements' : 'none'), music: !!musicSource, loaded: Object.keys(buffers).length,
        played: stats.played, musicGain: musicBus ? musicBus.gain.value : null, sfxGain: sfxBus ? sfxBus.gain.value : null };
    },
    play: function (name, rate) {
      if (!audible || !unlocked || !mix.sfxOn) return;
      if (useElements) {
        var el = elements[name];
        if (!el) return;
        var c = el.cloneNode();
        c.volume = (VOL[name] || 1) * mix.sfxVol;
        var p = c.play();
        if (p && p.catch) p.catch(function () {});
        return;
      }
      var buf = buffers[name];
      if (!buf || !ctx || ctx.state !== 'running') return;
      var s = ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = rate || 1;
      var g = ctx.createGain();
      g.gain.value = VOL[name] || 1;
      s.connect(g).connect(sfxBus);
      s.start();
      stats.played++;
    }
  };
})();
