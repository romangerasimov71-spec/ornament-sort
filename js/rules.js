/*
 * Ornament Sort — game rules and a small solver.
 * Shared by the game (browser) and by the tools in /tools (Node).
 *
 * A level state is an array of boxes; every box is an array of color ids,
 * listed bottom -> top. `cap` is how many ornaments fit in one box.
 *
 * Move rule: the top group (all touching ornaments of the same color on top)
 * goes to another box when that box is empty or its top ornament has the same
 * color. As many ornaments move as fit into the free space.
 * Win: every box is empty or full with one color.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OSRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clone(state) {
    return state.map(function (t) { return t.slice(); });
  }

  function topGroup(tube) {
    var n = tube.length;
    if (!n) return { color: -1, count: 0 };
    var c = tube[n - 1], k = 1;
    while (k < n && tube[n - 1 - k] === c) k++;
    return { color: c, count: k };
  }

  function canMove(state, cap, from, to) {
    if (from === to) return false;
    var a = state[from], b = state[to];
    if (!a || !b || !a.length) return false;
    if (b.length >= cap) return false;
    if (!b.length) return true;
    return b[b.length - 1] === a[a.length - 1];
  }

  // Number of ornaments a legal move would carry.
  function moveCount(state, cap, from, to) {
    if (!canMove(state, cap, from, to)) return 0;
    return Math.min(topGroup(state[from]).count, cap - state[to].length);
  }

  // Mutates state. Returns how many ornaments moved (0 = illegal move).
  function applyMove(state, cap, from, to) {
    var k = moveCount(state, cap, from, to);
    for (var i = 0; i < k; i++) state[to].push(state[from].pop());
    return k;
  }

  function isTubeDone(tube, cap) {
    if (tube.length !== cap) return false;
    for (var i = 1; i < tube.length; i++) if (tube[i] !== tube[0]) return false;
    return true;
  }

  function isSolved(state, cap) {
    for (var i = 0; i < state.length; i++) {
      var t = state[i];
      if (t.length && !isTubeDone(t, cap)) return false;
    }
    return true;
  }

  function key(state) {
    // Box order does not matter for solvability.
    return state.map(function (t) { return t.join(','); }).sort().join('|');
  }

  function isMono(t) {
    for (var i = 1; i < t.length; i++) if (t[i] !== t[0]) return false;
    return true;
  }

  // Legal moves, ordered so that useful ones come first, useless ones dropped.
  function usefulMoves(state, cap) {
    var moves = [];
    var emptySeen = false;
    for (var from = 0; from < state.length; from++) {
      var a = state[from];
      if (!a.length) continue;
      if (isTubeDone(a, cap)) continue;
      var g = topGroup(a);
      var mono = g.count === a.length;
      emptySeen = false;
      for (var to = 0; to < state.length; to++) {
        if (!canMove(state, cap, from, to)) continue;
        var b = state[to];
        if (!b.length) {
          if (mono) continue;          // moving a whole one-color box into an empty one changes nothing
          if (emptySeen) continue;     // all empty boxes are equivalent
          emptySeen = true;
        }
        var k = Math.min(g.count, cap - b.length);
        var score = 0;
        if (b.length) score += 10;                     // stack onto the same color
        if (b.length && isMono(b)) score += 10;        // grow a clean box
        if (k === g.count) score += 5;                 // whole group moved
        if (b.length + k === cap && isMono(b)) score += 20; // finishes a box
        if (!b.length) score -= 5;
        moves.push({ from: from, to: to, score: score });
      }
    }
    moves.sort(function (x, y) { return y.score - x.score; });
    return moves;
  }

  /*
   * Depth-first search with a visited set. Returns an array of [from, to]
   * moves that solves the level, or null when the level has no solution.
   * Returns undefined when the node limit was hit (unknown).
   */
  function solve(start, cap, maxNodes) {
    maxNodes = maxNodes || 2000000;
    var seen = new Set();
    var state = clone(start);
    var path = [];
    var nodes = 0;
    var aborted = false;

    function dfs() {
      if (isSolved(state, cap)) return true;
      var k = key(state);
      if (seen.has(k)) return false;
      seen.add(k);
      if (++nodes > maxNodes) { aborted = true; return false; }
      var moves = usefulMoves(state, cap);
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        var n = applyMove(state, cap, m.from, m.to);
        path.push([m.from, m.to]);
        if (dfs()) return true;
        path.pop();
        for (var j = 0; j < n; j++) state[m.from].push(state[m.to].pop());
        if (aborted) return false;
      }
      return false;
    }

    var ok = dfs();
    if (ok) return path.slice();
    return aborted ? undefined : null;
  }

  /*
   * Breadth-first search for the shortest solution. Only for small levels
   * (the tutorial uses it to point at the next move).
   */
  function solveShortest(start, cap, maxNodes) {
    maxNodes = maxNodes || 200000;
    var startKey = key(start);
    var queue = [{ s: clone(start), path: [] }];
    var seen = new Set([startKey]);
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      if (isSolved(cur.s, cap)) return cur.path;
      if (seen.size > maxNodes) return undefined;
      var moves = usefulMoves(cur.s, cap);
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        var s2 = clone(cur.s);
        applyMove(s2, cap, m.from, m.to);
        var k = key(s2);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ s: s2, path: cur.path.concat([[m.from, m.to]]) });
      }
    }
    return null;
  }

  return {
    clone: clone,
    topGroup: topGroup,
    canMove: canMove,
    moveCount: moveCount,
    applyMove: applyMove,
    isTubeDone: isTubeDone,
    isSolved: isSolved,
    key: key,
    usefulMoves: usefulMoves,
    solve: solve,
    solveShortest: solveShortest
  };
});
