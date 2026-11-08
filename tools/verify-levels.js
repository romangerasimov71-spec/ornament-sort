#!/usr/bin/env node
/*
 * Proves that every level in js/levels-data.js can be solved.
 *
 * 1. Checks the shape of each level (every color appears exactly `cap` times,
 *    no box is over-full, no box starts finished).
 * 2. Searches for a solution with a solver written here, separately from the
 *    game's code (depth-first search over all legal moves, with a visited set,
 *    no pruning shortcuts).
 * 3. Replays that solution with the game's own rules (js/rules.js) and checks
 *    that the game also sees the level as solved.
 *
 *   node tools/verify-levels.js                        -> exit code 0 when all levels pass
 *   node tools/verify-levels.js prototype/index.html   -> checks the prototype's levels
 */
'use strict';
const fs = require('fs');
const LEVELS = process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8').match(/<script type="application\/json" id="levels-data">([\s\S]*?)<\/script>/)[1])
  : require('../js/levels-data.js');
const Game = require('../js/rules.js');

// ---- independent solver ---------------------------------------------------
function legal(st, cap, a, b) {
  if (a === b || !st[a].length || st[b].length >= cap) return false;
  return !st[b].length || st[b][st[b].length - 1] === st[a][st[a].length - 1];
}
function doMove(st, cap, a, b) {
  const c = st[a][st[a].length - 1];
  let n = 0;
  while (st[a].length && st[a][st[a].length - 1] === c && st[b].length < cap) {
    st[b].push(st[a].pop());
    n++;
  }
  return n;
}
function solved(st, cap) {
  return st.every((t) => t.length === 0 || (t.length === cap && t.every((x) => x === t[0])));
}
function solveIndependent(start, cap, limit) {
  const st = start.map((t) => t.slice());
  const seen = new Set();
  const path = [];
  let nodes = 0;
  const k = () => st.map((t) => t.join('.')).sort().join('/');
  function dfs() {
    if (solved(st, cap)) return true;
    const key = k();
    if (seen.has(key)) return false;
    seen.add(key);
    if (++nodes > limit) throw new Error('node limit');
    for (let a = 0; a < st.length; a++) {
      for (let b = 0; b < st.length; b++) {
        if (!legal(st, cap, a, b)) continue;
        const n = doMove(st, cap, a, b);
        path.push([a, b]);
        if (dfs()) return true;
        path.pop();
        for (let i = 0; i < n; i++) st[a].push(st[b].pop());
      }
    }
    return false;
  }
  return dfs() ? path : null;
}

// ---- checks ---------------------------------------------------------------
let failed = 0;
const MAX_BOXES = 14;
const t0 = Date.now();
LEVELS.forEach((lv, i) => {
  const n = i + 1;
  const errs = [];
  const cap = lv.c;
  const counts = {};
  lv.b.forEach((t) => t.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
  const colors = Object.keys(counts).length;
  for (const c in counts) if (counts[c] !== cap) errs.push(`color ${c} appears ${counts[c]} times`);
  if (lv.b.some((t) => t.length > cap)) errs.push('a box is over-full');
  if (lv.b.some((t) => t.length === cap && t.every((x) => x === t[0]))) errs.push('a box starts finished');
  if (lv.b.length > MAX_BOXES) errs.push('too many boxes for a phone screen');
  if (!(lv.p > 0)) errs.push('missing par');

  let sol = null;
  try {
    sol = solveIndependent(lv.b, cap, 3000000);
  } catch (e) {
    errs.push('solver hit its node limit');
  }
  if (sol === null && !errs.length) errs.push('NO SOLUTION');

  if (sol) {
    const st = Game.clone(lv.b);
    for (const [a, b] of sol) {
      if (!Game.applyMove(st, cap, a, b)) { errs.push('game rules reject a move of the solution'); break; }
    }
    if (!Game.isSolved(st, cap)) errs.push('game rules do not see the replayed solution as solved');
  }

  const empty = lv.b.filter((t) => !t.length).length;
  const line = `level ${String(n).padStart(2)}: ${String(colors).padStart(2)} colors, cap ${cap}, ` +
    `${lv.b.length} boxes (${empty} empty), par ${String(lv.p).padStart(2)}, ` +
    (sol ? `solved in ${sol.length} moves` : 'not solved');
  if (errs.length) { failed++; console.log(line + '  FAIL: ' + errs.join('; ')); }
  else console.log(line + '  OK');
});
// levels 50+: neighbouring levels never share a box set (colors x capacity, empty boxes)
if (!process.argv[2]) {
  const set = (l) => new Set(l.b.flat()).size + 'x' + l.c + '+' + l.b.filter((t) => !t.length).length;
  for (let n = 51; n <= LEVELS.length; n++) {
    if (set(LEVELS[n - 2]) === set(LEVELS[n - 1])) { failed++; console.log(`levels ${n - 1} and ${n}: same box set ${set(LEVELS[n - 1])}  FAIL`); }
  }
}
console.log(`\n${LEVELS.length} levels checked in ${((Date.now() - t0) / 1000).toFixed(1)} s: ` +
  (failed ? `${failed} FAILED` : 'all solvable'));
process.exit(failed ? 1 : 0);
