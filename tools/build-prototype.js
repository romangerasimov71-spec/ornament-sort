#!/usr/bin/env node
/*
 * Builds prototype/index.html — one self-contained file (no external files,
 * no SDK, no sound, no saving). Rules and drawing code are copied in from
 * js/rules.js and js/game.js so the prototype plays exactly like the game.
 *
 *   node tools/build-prototype.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LEVELS = require('../js/levels-data.js');
const R = require('../js/rules.js');

// 2, 3, 4, 5, 6 colors — each one noticeably harder than the one before
const PICK = [0, 1, 4, 8, 12];

const game = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
function cut(from, to) {
  const a = game.indexOf(from);
  const b = game.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('marker not found: ' + (a < 0 ? from : to));
  return game.slice(a, b);
}

const levels = PICK.map((i) => {
  const lv = LEVELS[i];
  const sol = R.solve(lv.b, lv.c);
  if (!sol) throw new Error('level ' + i + ' is not solvable');
  return { c: lv.c, p: lv.p, b: lv.b };
});

// Sound: CC0 files from audio/ (see CREDITS.md), embedded as data URIs.
// The music uses a smaller 40 kbps copy (audio/music-proto.mp3) to keep the file light.
const SOUNDS = { music: 'music-proto.mp3', pick: 'pick.mp3', drop: 'drop.mp3', wrong: 'wrong.mp3',
  complete: 'complete.mp3', win: 'win.mp3', button: 'button.mp3' };
const audio = {};
for (const k in SOUNDS) {
  audio[k] = 'data:audio/mpeg;base64,' + fs.readFileSync(path.join(ROOT, 'audio', SOUNDS[k])).toString('base64');
}

const parts = {
  '/*AUDIO*/': JSON.stringify(audio),
  '/*LEVELS*/': JSON.stringify(levels),
  '/*RULES*/': fs.readFileSync(path.join(ROOT, 'js/rules.js'), 'utf8'),
  '/*COLORS*/': cut('  // ---------------------------------------------------------------- colors', '  // ---------------------------------------------------------------- state'),
  '/*HELPERS*/': cut('  function clamp(v, a, b)', '  // ================================================================ drawing: ornaments'),
  '/*DRAWING*/': cut('  // ================================================================ drawing: ornaments', '  // ================================================================ layout'),
  '/*LAYOUT*/': cut('  function computeLayout() {', '  // ================================================================ level logic'),
  '/*RENDERING*/': cut('  // ================================================================ rendering', '  // ================================================================ main loop')
};

let html = fs.readFileSync(path.join(__dirname, 'prototype-template.html'), 'utf8');
for (const k in parts) {
  if (!html.includes(k)) throw new Error('placeholder missing: ' + k);
  html = html.split(k).join(parts[k]);
}
fs.mkdirSync(path.join(ROOT, 'prototype'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'prototype/index.html'), html);
console.log('wrote prototype/index.html', (html.length / 1024).toFixed(1) + ' KB, levels:',
  levels.map((l) => new Set(l.b.flat()).size + ' colors').join(', '));
