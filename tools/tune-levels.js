#!/usr/bin/env node
/*
 * Re-tunes levels by REAL difficulty, measured with the human-like player model
 * (tools/human-model.js), not by the number of moves. Review round 2 + Roman's decisions 6 and 7.
 *
 *   - levels 1-4 and the regular levels 5-49 stay as they are;
 *   - breathers (one empty box) at 8, 12, 20, 30, 37, 44, 52, 61, 65, 72 are re-picked so that
 *     at most half of the first moves lead to a dead end and nearly every player solves them;
 *   - 50-75: real difficulty grows, the box sets alternate (no identical blocks);
 *   - 76-85 finale: ordered by real difficulty, 85 is the hardest, but at least ~40% of
 *     the model players solve every finale level.
 *
 * Review round 3: after the run levels 76 and 77 had the same set (10x5); level 77 was replaced by one
 * board of another set (8 colors x 6, difficulty 5.23 between 76 = 4.33 and 78 = 5.67), picked with the same
 * board() generator and human-model.evaluate(lv, 77). verify-levels.js now fails on such repeats.
 *
 *   node tools/tune-levels.js          (about 20-30 minutes, uses 4 processes)
 * Then: node tools/verify-levels.js && node tests/play-all.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const R = require('../js/rules.js');
const H = require('./human-model.js');

const BREATHERS = [8, 12, 20, 30, 37, 44, 52, 61, 65, 72];
const MAIN_FROM = 50, FINALE_FROM = 76, LAST = 85;
// neighbouring levels never share a box set
const SET_A = [[12, 4], [9, 5], [8, 6], [10, 4]];
const SET_B = [[11, 4], [10, 5], [7, 6], [8, 5]];

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
  let layer = [{ s: R.clone(start), path: 0 }];
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
        if (R.isSolved(s2, cap)) return node.path + 1;
        next.push({ s: s2, path: node.path + 1, h: breaks(s2) });
      }
    }
    if (!next.length) return null;
    next.sort((a, b) => a.h - b.h);
    layer = next.slice(0, width);
  }
  return null;
}
function board(seed, colors, cap, empty) {
  const rnd = mulberry32(seed);
  const pool = [];
  for (let c = 0; c < colors; c++) for (let k = 0; k < cap; k++) pool.push(c);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const boxes = [];
  for (let b = 0; b < colors; b++) boxes.push(pool.slice(b * cap, b * cap + cap));
  if (boxes.some((t) => R.isTubeDone(t, cap))) return null;
  if (boxes.some((t) => R.topGroup(t).count >= cap - 1)) return null;
  for (let e = 0; e < empty; e++) boxes.push([]);
  if (!R.solve(boxes, cap, 400000)) return null;
  return { c: cap, b: boxes };
}

// ---------------------------------------------------------------- one job (runs in a worker)
function runJob(job) {
  const t0 = Date.now();
  let best = null;
  const tried = [];
  for (let round = 0; round < job.rounds; round++) {
    for (const [colors, cap] of job.configs) {
      let lv = null;
      for (let a = 0; a < 400 && !lv; a++) lv = board(job.n * 100003 + round * 7919 + a * 31 + colors * 13 + cap, colors, cap, job.empty);
      if (!lv) continue;
      let trap = null;
      if (job.kind === 'breather') {
        trap = H.firstMoveTrap(lv);
        if (trap.dead * 2 > trap.total) { tried.push({ colors, cap, trap: trap.dead + '/' + trap.total }); continue; }
      }
      const ev = H.evaluate(lv, job.n, 30, 8);
      const ok = ev.wins >= job.minWins && (job.maxWins == null || ev.wins <= job.maxWins);
      const miss = Math.abs(ev.difficulty - job.target) + (ok ? 0 : 100);
      tried.push({ colors, cap, d: ev.difficulty, wins: ev.wins });
      if (!best || miss < best.miss) best = { lv, ev, trap, miss, colors, cap };
      if (ok && Math.abs(ev.difficulty - job.target) <= job.tol) {
        round = job.rounds; break;
      }
    }
  }
  const par = Math.min(beamSolve(best.lv.b, best.lv.c, 600, 400) || 999, R.solve(best.lv.b, best.lv.c).length);
  return { n: job.n, kind: job.kind, level: { c: best.lv.c, p: par, b: best.lv.b }, ev: best.ev, trap: best.trap,
    colors: best.colors, cap: best.cap, target: job.target, tried: tried.length, seconds: Math.round((Date.now() - t0) / 1000) };
}

if (process.argv[2] === '--worker') {
  process.on('message', (job) => process.send(runJob(job)));
  return;
}

// ---------------------------------------------------------------- plan
const LEVELS = require('../js/levels-data.js');
const jobs = [];
for (const n of BREATHERS) {
  const old = LEVELS[n - 1];
  const colors = new Set(old.b.flat()).size;
  jobs.push({ n, kind: 'breather', configs: [[colors, old.c]], empty: 1, target: 1.4, tol: 0.6, minWins: 30, rounds: 12 });
}
for (let n = MAIN_FROM; n <= LAST; n++) {
  if (BREATHERS.includes(n)) continue;
  const set = n % 2 ? SET_A : SET_B;
  if (n < FINALE_FROM) {
    const target = 1.3 + (n - MAIN_FROM) / (FINALE_FROM - 1 - MAIN_FROM) * 2.7;      // 1.3 .. 4.0
    jobs.push({ n, kind: 'main', configs: set, empty: 2, target, tol: 0.35, minWins: 27, rounds: 6 });
  } else {
    const target = 4.5 + (n - FINALE_FROM) * 0.75;                                   // 4.5 .. 11.25
    jobs.push({ n, kind: 'finale', configs: set, empty: 2, target, tol: 0.8, minWins: n === LAST ? 12 : 13, maxWins: n === LAST ? 22 : null, rounds: 8 });
  }
}

const results = [];
let next = 0, running = 0;
const WORKERS = 4;
function startWorker() {
  const w = fork(__filename, ['--worker']);
  const give = () => {
    if (next >= jobs.length) { w.kill(); if (--running === 0) finish(); return; }
    w.send(jobs[next++]);
  };
  w.on('message', (r) => {
    results.push(r);
    const e = r.ev;
    console.log(`level ${String(r.n).padStart(2)} ${r.kind.padEnd(8)} ${r.colors}c x${r.cap}: difficulty ${e.difficulty} (target ${r.target.toFixed(1)}), ` +
      `solved ${e.wins}/30, first try ${e.firstTry}, median tries ${e.medianTries}` + (r.trap ? `, dead first moves ${r.trap.dead}/${r.trap.total}` : '') + `  [${r.seconds}s]`);
    give();
  });
  running++;
  give();
}
for (let i = 0; i < WORKERS; i++) startWorker();

function finish() {
  const out = LEVELS.map((l) => ({ c: l.c, p: l.p, b: l.b }));
  for (const r of results) out[r.n - 1] = r.level;
  // finale: order the ten boards by measured difficulty, the hardest last
  const fin = results.filter((r) => r.kind === 'finale').sort((a, b) => a.ev.difficulty - b.ev.difficulty);
  fin.forEach((r, i) => { out[FINALE_FROM - 1 + i] = r.level; });
  // sorting may put two boards with the same set next to each other (review round 3: 76 and 77)
  const setOf = (l) => new Set(l.b.flat()).size + 'x' + l.c;
  for (let n = FINALE_FROM; n <= LAST; n++) {
    if (setOf(out[n - 2]) === setOf(out[n - 1])) console.log(`WARNING: levels ${n - 1} and ${n} share the set ${setOf(out[n - 1])} - re-pick one of them`);
  }
  const body = out.map((l) => '  {c:' + l.c + ',p:' + l.p + ',b:' + JSON.stringify(l.b) + '}').join(',\n');
  const file = '/* Generated by tools/generate-levels.js, re-tuned by tools/tune-levels.js — do not edit by hand. */\n' +
    '(function (root) {\nvar LEVELS = [\n' + body + '\n];\n' +
    "if (typeof module === 'object' && module.exports) module.exports = LEVELS;\n" +
    "else root.OS_LEVELS = LEVELS;\n})(typeof self !== 'undefined' ? self : this);\n";
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'levels-data.js'), file);
  console.log('wrote js/levels-data.js');
}
