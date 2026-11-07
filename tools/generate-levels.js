#!/usr/bin/env node
/*
 * Generates js/levels-data.js — every level is built from a fixed seed, so the
 * output is the same on every run. A level is kept only when the solver finds
 * a solution. `par` (moves for 3 stars) comes from a beam search.
 *
 *   node tools/generate-levels.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('../js/rules.js');

// Difficulty plan (Roman, 7 Nov 2026: "make the levels hard, growing to the very end").
// Levels 1-4 are fixed (tutorial + warm-up, approved). From level 5 on, blocks of
// [count, colors, capacity, empty boxes]. One-empty levels are short "trick" breathers and are
// never placed next to each other. Every block picks harder shuffles than the one before
// (higher quantile of the minimum-move count); the finale picks the hardest it finds.
const SCHEDULE = [
  [3, 4, 4, 2], [1, 4, 4, 1],
  [3, 5, 4, 2], [1, 5, 4, 1],
  [3, 6, 4, 2], [1, 5, 5, 2],
  [3, 7, 4, 2], [1, 6, 4, 1],
  [3, 5, 6, 2],
  [3, 6, 5, 2],
  [3, 8, 4, 2], [1, 7, 4, 1],
  [3, 6, 6, 2],
  [3, 9, 4, 2], [1, 5, 5, 1],
  [3, 7, 5, 2],
  [3, 10, 4, 2], [1, 6, 4, 1],
  [3, 8, 5, 2],
  [4, 11, 4, 2], [1, 7, 4, 1],
  [4, 7, 6, 2],
  [4, 9, 5, 2], [1, 6, 5, 1],
  [3, 12, 4, 2], [1, 8, 4, 1],
  [3, 7, 6, 2],
  [3, 9, 5, 2], [1, 6, 5, 1],
  [3, 12, 4, 2],
  // finale 76-85: the hardest boards, no breathers
  [2, 10, 5, 2], [2, 8, 6, 2], [2, 12, 4, 2], [2, 10, 5, 2], [2, 8, 6, 2]
];
const FIXED = 4;          // levels 1-4 stay exactly as approved
const FINALE_FROM = 76;

// Level 1 is a hand-made tutorial: 3 moves.
const TUTORIAL = { cap: 4, boxes: [[0, 0, 0, 1], [1, 1, 1, 0], []] };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function breaks(state) {
  let b = 0;
  const bottoms = {};
  for (const t of state) {
    for (let i = 1; i < t.length; i++) if (t[i] !== t[i - 1]) b++;
    if (t.length) bottoms[t[0]] = (bottoms[t[0]] || 0) + 1;
  }
  for (const c in bottoms) b += bottoms[c] - 1;
  return b;
}

function beamSolve(start, cap, width, maxDepth) {
  let layer = [{ s: R.clone(start), path: [] }];
  const seen = new Set([R.key(start)]);
  for (let d = 0; d < maxDepth; d++) {
    const next = [];
    for (const node of layer) {
      for (const m of R.usefulMoves(node.s, cap)) {
        const s2 = R.clone(node.s);
        R.applyMove(s2, cap, m.from, m.to);
        const k = R.key(s2);
        if (seen.has(k)) continue;
        seen.add(k);
        const p2 = node.path.concat([[m.from, m.to]]);
        if (R.isSolved(s2, cap)) return p2;
        next.push({ s: s2, path: p2, h: breaks(s2) });
      }
    }
    if (!next.length) return null;
    next.sort((a, b) => a.h - b.h);
    layer = next.slice(0, width);
  }
  return null;
}

function candidate(index, attempt, colors, cap, empty) {
  const rnd = mulberry32(index * 7919 + attempt * 104729 + 17);
  const pool = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < cap; k++) pool.push(c);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const boxes = [];
  for (let b = 0; b < colors; b++) boxes.push(pool.slice(b * cap, b * cap + cap));
  // no box may start finished, and the start should be well mixed
  if (boxes.some((t) => R.isTubeDone(t, cap))) return null;
  if (boxes.some((t) => R.topGroup(t).count >= cap - 1)) return null;
  for (let e = 0; e < empty; e++) boxes.push([]);
  const sol = R.solve(boxes, cap, 400000);
  if (!sol) return null;
  const beam = beamSolve(boxes, cap, 600, 400);
  return { cap, boxes, par: beam ? Math.min(beam.length, sol.length) : sol.length };
}

// q: 0..1, which candidate to take when sorted by par (1 = the hardest found)
function makeLevel(index, colors, cap, empty, q, want) {
  const found = [];
  for (let attempt = 0; attempt < 3000 && found.length < want; attempt++) {
    const c = candidate(index, attempt, colors, cap, empty);
    if (c) found.push(c);
  }
  if (!found.length) throw new Error('Could not build level ' + index);
  found.sort((a, b) => a.par - b.par);
  return found[Math.min(found.length - 1, Math.round(q * (found.length - 1)))];
}

function main() {
  const old = require('../js/levels-data.js');
  const levels = old.slice(0, FIXED).map((l) => ({ cap: l.c, boxes: l.b, par: l.p }));
  const total = SCHEDULE.reduce((n, s) => n + s[0], 0) + FIXED;
  for (const [count, colors, cap, empty] of SCHEDULE) {
    for (let i = 0; i < count; i++) {
      const n = levels.length + 1;
      const progress = (n - FIXED - 1) / (total - FIXED - 1);       // 0 .. 1 over levels 5..85
      const finale = n >= FINALE_FROM;
      const q = finale ? 1 : 0.45 + 0.5 * progress;                 // harder shuffles later on
      const lv = makeLevel(n, colors, cap, empty, q, finale ? 40 : 16);
      levels.push({ cap: lv.cap, boxes: lv.boxes, par: lv.par });
      process.stdout.write(`level ${String(n).padStart(2)}: ${colors} colors, cap ${cap}, ${empty} empty, par ${lv.par}\n`);
    }
  }
  if (levels.length !== 85) throw new Error('expected 85 levels, got ' + levels.length);
  const body = levels
    .map((l) => '  {c:' + l.cap + ',p:' + l.par + ',b:' + JSON.stringify(l.boxes) + '}')
    .join(',\n');
  const out =
    '/* Generated by tools/generate-levels.js — do not edit by hand. */\n' +
    '(function (root) {\n' +
    'var LEVELS = [\n' + body + '\n];\n' +
    "if (typeof module === 'object' && module.exports) module.exports = LEVELS;\n" +
    'else root.OS_LEVELS = LEVELS;\n' +
    "})(typeof self !== 'undefined' ? self : this);\n";
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'levels-data.js'), out);
  console.log('wrote', levels.length, 'levels');
}

main();
