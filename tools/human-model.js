/*
 * "Human-like" player model, taken from the game reviewer's human.js (review round 2).
 * The player makes the obvious greedy move most of the time (sometimes one of the top 3),
 * never repeats a position, and when the game says "dead end" undoes (up to 5 per attempt)
 * or restarts. A level is measured with 30 such players, each with up to 20 attempts.
 *
 * Used by tools/tune-levels.js to order levels by real difficulty, not by move count.
 * The random seed depends on the level NUMBER (n * 97 + 1), exactly as in the review script,
 * so the numbers here match what the reviewer measures.
 */
'use strict';
const R = require('../js/rules.js');

function rnd(seed) {
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
}

function attempt(lv, r) {
  const s = R.clone(lv.b);
  const hist = [];
  let undo = 5, moves = 0;
  const seen = new Set([R.key(s)]);
  const tried = new Map();
  while (moves < 300) {
    if (R.isSolved(s, lv.c)) return { win: true, moves };
    const k = R.key(s);
    const t = tried.get(k) || new Set();
    let mv = R.usefulMoves(s, lv.c).filter((m) => !t.has(m.from + '-' + m.to));
    mv = mv.filter((m) => { const s2 = R.clone(s); R.applyMove(s2, lv.c, m.from, m.to); return !seen.has(R.key(s2)); });
    const dead = !mv.length || R.solve(s, lv.c, 25000) === null;
    if (dead) {
      if (undo > 0 && hist.length) {
        const h = hist.pop();
        for (let j = 0; j < h.n; j++) s[h.from].push(s[h.to].pop());
        undo--;
        continue;
      }
      return { win: false, moves };
    }
    const m = r() < 0.75 ? mv[0] : mv[Math.floor(r() * Math.min(3, mv.length))];
    t.add(m.from + '-' + m.to);
    tried.set(k, t);
    const n = R.applyMove(s, lv.c, m.from, m.to);
    hist.push({ from: m.from, to: m.to, n });
    seen.add(R.key(s));
    moves++;
  }
  return { win: false, moves };
}

/*
 * lv = { c: capacity, b: boxes }, n = level number (1-based).
 * Returns { wins, firstTry, medianTries, meanTries, difficulty }.
 * difficulty = average attempts per player, a player who never wins counts as 25.
 * giveUpAfter: stop early when that many players in a row fail (saves time on hopeless boards).
 */
function evaluate(lv, n, players = 30, giveUpAfter = 0) {
  const r = rnd(n * 97 + 1);
  let wins = 0, firstTry = 0, sum = 0, failRow = 0;
  const att = [];
  for (let p = 0; p < players; p++) {
    let a = 0, res;
    do { a++; res = attempt(lv, r); } while (!res.win && a < 20);
    if (res.win) { wins++; att.push(a); sum += a; failRow = 0; if (a === 1) firstTry++; }
    else { sum += 25; failRow++; }
    if (giveUpAfter && failRow >= giveUpAfter) { sum += 25 * (players - p - 1); break; }
  }
  att.sort((x, y) => x - y);
  return { wins, firstTry, medianTries: att.length ? att[att.length >> 1] : null, meanTries: att.length ? +(att.reduce((x, y) => x + y, 0) / att.length).toFixed(1) : null, difficulty: +(sum / players).toFixed(2) };
}

// Share of first moves that already lead to a board that cannot be solved.
function firstMoveTrap(lv) {
  const mv = R.usefulMoves(lv.b, lv.c);
  let dead = 0;
  for (const m of mv) {
    const s = R.clone(lv.b);
    R.applyMove(s, lv.c, m.from, m.to);
    if (R.solve(s, lv.c, 200000) === null) dead++;
  }
  return { dead, total: mv.length };
}

module.exports = { evaluate, firstMoveTrap, attempt };
