/* 排排坐 · 自动分配座位（随机 / 男女平衡 / 条件） */
(function () {
  const W = 100, H = 64; // desk size, kept in sync with layout.js

  // Two desks are "next to" each other when they are left/right, front/back or diagonal neighbours.
  function adjacency(desks) {
    const adj = desks.map(() => new Set());
    for (let i = 0; i < desks.length; i++) {
      for (let j = i + 1; j < desks.length; j++) {
        const dx = Math.abs(desks[i].x - desks[j].x), dy = Math.abs(desks[i].y - desks[j].y);
        if (dx <= W + 40 && dy <= H + 50) { adj[i].add(j); adj[j].add(i); }
      }
    }
    return adj;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function isBroken(c, pa, pb, adj, grp) {
    if (pa == null || pb == null) return false;
    if (c.type === 'adjacent') return adj[pa].has(pb);
    return !!grp[pa] && grp[pa] === grp[pb];
  }

  // Returns the ids of constraints the current seating breaks.
  function brokenConstraints(state) {
    const desks = state.desks;
    const adj = adjacency(desks);
    const grp = desks.map(d => d.groupId);
    const pos = new Map();
    desks.forEach((d, i) => { if (d.studentId) pos.set(d.studentId, i); });
    return state.constraints.filter(c => isBroken(c, pos.get(c.a), pos.get(c.b), adj, grp)).map(c => c.id);
  }

  /**
   * opts.method: 'random' | 'gender'
   * opts.fillOnly: keep students who are already seated
   * Returns { seats: Array<studentId|null> aligned with state.desks, broken: number, unseated: number }
   */
  function assign(state, opts) {
    const desks = state.desks;
    const n = desks.length;
    const adj = adjacency(desks);
    const grp = desks.map(d => d.groupId);
    const gender = new Map(state.students.map(s => [s.id, s.gender]));

    const arr = new Array(n).fill(null);
    const keep = new Set();
    if (opts.fillOnly) desks.forEach((d, i) => { if (d.studentId) { arr[i] = d.studentId; keep.add(d.studentId); } });

    const free = [];
    for (let i = 0; i < n; i++) if (!arr[i]) free.push(i);
    const pool = shuffle(state.students.filter(s => !keep.has(s.id)).map(s => s.id));
    shuffle(free);
    pool.slice(0, free.length).forEach((sid, k) => { arr[free[k]] = sid; });
    const unseated = Math.max(0, pool.length - free.length);

    const pos = new Map();
    arr.forEach((sid, i) => { if (sid) pos.set(sid, i); });

    // Gender balance targets
    const useGender = opts.method === 'gender';
    let ratioM = 0.5;
    if (useGender) {
      let m = 0, f = 0;
      arr.forEach(sid => { if (!sid) return; const g = gender.get(sid); if (g === 'M') m++; else if (g === 'F') f++; });
      ratioM = m + f ? m / (m + f) : 0.5;
    }
    const pairs = [];
    adj.forEach((set, i) => set.forEach(j => { if (j > i) pairs.push([i, j]); }));
    const groupIds = [...new Set(grp.filter(Boolean))];

    function cost() {
      let c = 0;
      for (const con of state.constraints) if (isBroken(con, pos.get(con.a), pos.get(con.b), adj, grp)) c += 1000;
      if (useGender) {
        const cnt = {};
        groupIds.forEach(g => { cnt[g] = [0, 0]; });
        for (let i = 0; i < n; i++) {
          const sid = arr[i];
          if (!sid || !grp[i]) continue;
          const g = gender.get(sid);
          if (g === 'M') cnt[grp[i]][0]++; else if (g === 'F') cnt[grp[i]][1]++;
        }
        for (const g of groupIds) {
          const [m, f] = cnt[g];
          const diff = m - (m + f) * ratioM;
          c += 4 * diff * diff;
        }
        // prefer boy–girl neighbours (matters most for layouts in rows)
        for (const [i, j] of pairs) {
          const a = arr[i] && gender.get(arr[i]), b = arr[j] && gender.get(arr[j]);
          if (a && b && a === b) c += Math.abs(desks[i].y - desks[j].y) < H / 2 ? 1 : 0.4;
        }
      }
      return c;
    }

    let cur = cost();
    let best = cur, bestArr = arr.slice();
    const movable = [];
    for (let i = 0; i < n; i++) if (!(opts.fillOnly && desks[i].studentId)) movable.push(i);
    const needSearch = movable.length > 1 && (useGender || state.constraints.length);

    if (needSearch && cur > 0) {
      const iters = Math.min(60000, 4000 + movable.length * 800);
      for (let it = 0; it < iters; it++) {
        const T = 4 * (1 - it / iters) + 0.02;
        const i = movable[Math.floor(Math.random() * movable.length)];
        const j = movable[Math.floor(Math.random() * movable.length)];
        if (i === j || (!arr[i] && !arr[j])) continue;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        if (arr[i]) pos.set(arr[i], i);
        if (arr[j]) pos.set(arr[j], j);
        const nc = cost();
        const d = nc - cur;
        if (d <= 0 || Math.random() < Math.exp(-d / T)) {
          cur = nc;
          if (cur < best - 1e-9) { best = cur; bestArr = arr.slice(); if (best === 0) break; }
        } else {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          if (arr[i]) pos.set(arr[i], i);
          if (arr[j]) pos.set(arr[j], j);
        }
      }
    }

    const finalPos = new Map();
    bestArr.forEach((sid, i) => { if (sid) finalPos.set(sid, i); });
    const broken = state.constraints.filter(c => isBroken(c, finalPos.get(c.a), finalPos.get(c.b), adj, grp)).length;
    return { seats: bestArr, broken, unseated };
  }

  window.Seating = { assign, adjacency, brokenConstraints };
})();
