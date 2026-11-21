/* 排排坐 · 座位布局：在空白地面上拖动方块、复制小组、划分小组；以及排座位时的拖放 */
(function () {
  const W = 100, H = 64;          // desk size
  const BW = 1800, BH = 1200;     // floor size
  const SNAP = 10;
  const TOP = 80;                 // keep the "front of class" strip free
  const COLORS = ['#f4b860', '#7cc6d6', '#b39ddb', '#8fd19e', '#f19a9a', '#8fb3ff', '#e8d26a', '#d7a1e8', '#7fd6c2', '#ffb38a', '#a9c46c', '#f7a8c8'];

  const { t } = window.I18n;
  let board, stage, sizer, ctx;
  let ui; // shared UI state from app.js

  const snap = v => Math.round(v / SNAP) * SNAP;
  const clampX = x => Math.max(10, Math.min(BW - W - 10, x));
  const clampY = y => Math.max(TOP, Math.min(BH - H - 10, y));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function groupName(g, state) {
    if (g.name) return g.name;
    return t('groupN', { n: state.groups.indexOf(g) + 1 });
  }
  function roleName(r) { return r.name || (r.key ? t('role_' + r.key) : '?'); }
  function nextColor(state) {
    const used = state.groups.map(g => g.color);
    for (let i = 0; i < COLORS.length; i++) if (!used.includes(i)) return i;
    return state.groups.length % COLORS.length;
  }

  function bbox(desks) {
    if (!desks.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    desks.forEach(d => { x1 = Math.min(x1, d.x); y1 = Math.min(y1, d.y); x2 = Math.max(x2, d.x + W); y2 = Math.max(y2, d.y + H); });
    return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
  }

  // Find a free spot for a block of size w×h, scanning from the top-left.
  function blocked(x, y, w, h) {
    return window.Store.state.desks.some(d => d.x < x + w + 20 && d.x + W + 20 > x && d.y < y + h + 20 && d.y + H + 20 > y);
  }
  function freeSpot(w, h) {
    for (let y = TOP + 20; y + h < BH; y += 20) {
      for (let x = 40; x + w < BW; x += 20) {
        if (!blocked(x, y, w, h)) return { x, y };
      }
    }
    return { x: 40, y: TOP + 20 };
  }

  /* ---------- rendering ---------- */
  function render() {
    const state = window.Store.state;
    const layoutMode = ui.tab === 'layout';
    board.classList.toggle('layout-mode', layoutMode);
    board.classList.toggle('seat-mode', !layoutMode);
    board.style.width = BW + 'px';
    board.style.height = BH + 'px';
    board.style.transform = `scale(${ui.zoom})`;
    sizer.style.width = BW * ui.zoom + 'px';
    sizer.style.height = BH * ui.zoom + 'px';

    const students = new Map(state.students.map(s => [s.id, s]));
    const roles = new Map(state.roles.map(r => [r.id, r]));
    const groups = new Map(state.groups.map(g => [g.id, g]));
    const broken = new Set();
    if (!layoutMode) {
      const ids = new Set(window.Seating.brokenConstraints(state));
      state.constraints.forEach(c => { if (ids.has(c.id)) { broken.add(c.a); broken.add(c.b); } });
    }

    let html = '';
    // front of the class, centred over the desks
    const bb = bbox(state.desks);
    const fw = 260;
    const fx = bb ? Math.max(10, Math.min(BW - fw - 10, (bb.x1 + bb.x2) / 2 - fw / 2)) : 40;
    html += `<div class="front" style="left:${fx}px;width:${fw}px">${esc(t('front'))}</div>`;

    // group outlines + labels
    state.groups.forEach(g => {
      const gd = state.desks.filter(d => d.groupId === g.id);
      const b = bbox(gd);
      if (!b) return;
      const col = COLORS[g.color % COLORS.length];
      html += `<div class="gframe" style="left:${b.x1 - 8}px;top:${b.y1 - 8}px;width:${b.w + 16}px;height:${b.h + 16}px;--gc:${col}"></div>`;
      html += `<div class="glabel" data-group="${g.id}" style="left:${b.x1 - 8}px;top:${b.y1 - 30}px;--gc:${col}" title="${esc(t('rename'))}">${esc(groupName(g, state))}</div>`;
    });

    state.desks.forEach(d => {
      const st = d.studentId ? students.get(d.studentId) : null;
      const g = d.groupId ? groups.get(d.groupId) : null;
      const cls = ['desk'];
      if (layoutMode && ui.sel.has(d.id)) cls.push('sel');
      if (!st) cls.push('empty');
      if (st && st.gender) cls.push('g' + st.gender);
      if (st && ui.picked === st.id) cls.push('picked');
      if (st && broken.has(st.id)) cls.push('broken');
      const style = `left:${d.x}px;top:${d.y}px;` + (g ? `--gc:${COLORS[g.color % COLORS.length]}` : '');
      let inner = '';
      if (st) {
        const long = st.name.length > 18 ? ' xlong' : st.name.length > 10 ? ' long' : '';
        inner += `<div class="dname${long}">${esc(st.name)}</div>`;
        const rs = st.roles.map(r => roles.get(r)).filter(Boolean);
        if (rs.length) inner += `<div class="dbadges">${rs.map(r => `<span class="badge">${esc(roleName(r))}</span>`).join('')}</div>`;
      }
      html += `<div class="${cls.join(' ')}${g ? ' grouped' : ''}" data-desk="${d.id}" style="${style}">${inner}</div>`;
    });
    board.innerHTML = html;
  }

  function refreshSelection() {
    board.querySelectorAll('.desk').forEach(el => el.classList.toggle('sel', ui.sel.has(el.dataset.desk)));
    ctx.onSelectionChange();
  }

  function boardPoint(e) {
    const r = board.getBoundingClientRect();
    return { x: (e.clientX - r.left) / ui.zoom, y: (e.clientY - r.top) / ui.zoom };
  }

  // Generic pointer gesture helper (mouse, pen and touch)
  function gesture(e, onMove, onUp) {
    const id = e.pointerId;
    const move = ev => { if (ev.pointerId === id) onMove(ev); };
    const up = ev => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onUp(ev, ev.type === 'pointercancel');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* ---------- layout mode ---------- */
  function layoutDown(e) {
    const deskEl = e.target.closest('.desk');
    const label = e.target.closest('.glabel');
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const state = window.Store.state;

    if (label) {
      const gid = label.dataset.group;
      const ids = state.desks.filter(d => d.groupId === gid).map(d => d.id);
      if (!additive) ui.sel = new Set();
      ids.forEach(id => ui.sel.add(id));
      refreshSelection();
      startMove(e, null);
      return;
    }
    if (deskEl) {
      const id = deskEl.dataset.desk;
      if (additive) {
        ui.sel.has(id) ? ui.sel.delete(id) : ui.sel.add(id);
        refreshSelection();
        return;
      }
      if (!ui.sel.has(id)) { ui.sel = new Set([id]); refreshSelection(); }
      startMove(e, id);
      return;
    }
    startMarquee(e, additive);
  }

  function startMove(e, clickedId) {
    e.preventDefault();
    const state = window.Store.state;
    const p0 = boardPoint(e);
    const moving = state.desks.filter(d => ui.sel.has(d.id));
    const els = new Map();
    board.querySelectorAll('.desk').forEach(el => { if (ui.sel.has(el.dataset.desk)) els.set(el.dataset.desk, el); });
    const b = bbox(moving);
    let moved = false, dx = 0, dy = 0;
    gesture(e, ev => {
      const p = boardPoint(ev);
      const rx = p.x - p0.x, ry = p.y - p0.y;
      if (!moved && Math.hypot(rx, ry) < 4) return;
      if (!moved) { moved = true; board.classList.add('dragging'); }
      // keep the whole selection on the floor
      dx = snap(Math.max(10 - b.x1, Math.min(BW - 10 - b.x2, rx)));
      dy = snap(Math.max(TOP - b.y1, Math.min(BH - 10 - b.y2, ry)));
      moving.forEach(d => { const el = els.get(d.id); if (el) { el.style.left = d.x + dx + 'px'; el.style.top = d.y + dy + 'px'; } });
    }, (ev, cancelled) => {
      board.classList.remove('dragging');
      if (moved && !cancelled && (dx || dy)) {
        window.Store.commit(st => st.desks.forEach(d => { if (ui.sel.has(d.id)) { d.x = clampX(d.x + dx); d.y = clampY(d.y + dy); } }));
      } else if (moved) {
        render();
      } else if (clickedId && ui.sel.size > 1) {
        ui.sel = new Set([clickedId]);
        refreshSelection();
      }
    });
  }

  function startMarquee(e, additive) {
    e.preventDefault();
    const state = window.Store.state;
    const base = additive ? new Set(ui.sel) : new Set();
    const p0 = boardPoint(e);
    const box = document.createElement('div');
    box.className = 'marquee';
    let moved = false;
    gesture(e, ev => {
      const p = boardPoint(ev);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 4) return;
      if (!moved) { moved = true; board.appendChild(box); }
      const x1 = Math.min(p0.x, p.x), y1 = Math.min(p0.y, p.y), x2 = Math.max(p0.x, p.x), y2 = Math.max(p0.y, p.y);
      Object.assign(box.style, { left: x1 + 'px', top: y1 + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
      ui.sel = new Set(base);
      state.desks.forEach(d => { if (d.x < x2 && d.x + W > x1 && d.y < y2 && d.y + H > y1) ui.sel.add(d.id); });
      board.querySelectorAll('.desk').forEach(el => el.classList.toggle('sel', ui.sel.has(el.dataset.desk)));
    }, () => {
      box.remove();
      if (!moved) ui.sel = base;
      refreshSelection();
    });
  }

  /* ---------- layout actions ---------- */
  function addBlock(cols, rows, asGroup) {
    const gap = 4;
    const w = cols * W + (cols - 1) * gap, h = rows * H + (rows - 1) * gap;
    const spot = freeSpot(w, h);
    const ids = [];
    window.Store.commit(st => {
      let gid = null;
      if (asGroup) { gid = window.Store.uid('g'); st.groups.push({ id: gid, name: '', color: nextColor(st) }); }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const id = window.Store.uid('d');
        ids.push(id);
        st.desks.push({ id, x: clampX(snap(spot.x + c * (W + gap))), y: clampY(snap(spot.y + r * (H + gap))), groupId: gid, studentId: null });
      }
    });
    ui.sel = new Set(ids);
    afterChange(ids);
  }

  function quickRows(rows, cols, pairs) {
    const state = window.Store.state;
    if (state.desks.length && !confirm(t('confirmReplaceLayout'))) return;
    const ids = [];
    window.Store.commit(st => {
      st.desks = []; st.groups = [];
      const pairGap = 4, aisle = 60, single = 30, rowGap = 40;
      for (let r = 0; r < rows; r++) {
        let x = 40;
        for (let c = 0; c < cols; c++) {
          const id = window.Store.uid('d');
          ids.push(id);
          st.desks.push({ id, x: clampX(snap(x)), y: clampY(TOP + 30 + r * (H + rowGap)), groupId: null, studentId: null });
          x += W + (pairs ? (c % 2 === 0 ? pairGap : aisle) : single);
        }
      }
    });
    ui.sel = new Set();
    afterChange();
    fit();
  }

  function duplicate() {
    const state = window.Store.state;
    const src = state.desks.filter(d => ui.sel.has(d.id));
    if (!src.length) return;
    const b = bbox(src);
    // try right next to the original, then below, otherwise the first free spot on the floor
    let spot = null;
    for (const [cx, cy] of [[b.x2 + 40, b.y1], [b.x1, b.y2 + 50], [b.x2 + 40, b.y2 + 50]]) {
      if (cx + b.w <= BW - 10 && cy + b.h <= BH - 10 && !blocked(cx, cy, b.w, b.h)) { spot = { x: cx, y: cy }; break; }
    }
    if (!spot) spot = freeSpot(b.w, b.h);
    const ox = snap(spot.x - b.x1), oy = snap(spot.y - b.y1);
    const ids = [];
    window.Store.commit(st => {
      const gmap = {};
      src.forEach(d => {
        let gid = null;
        if (d.groupId) {
          const whole = st.desks.filter(x => x.groupId === d.groupId).every(x => ui.sel.has(x.id));
          if (whole) {
            if (!gmap[d.groupId]) {
              gmap[d.groupId] = window.Store.uid('g');
              st.groups.push({ id: gmap[d.groupId], name: '', color: nextColor(st) });
            }
            gid = gmap[d.groupId];
          }
        }
        const id = window.Store.uid('d');
        ids.push(id);
        st.desks.push({ id, x: clampX(snap(d.x + ox)), y: clampY(snap(d.y + oy)), groupId: gid, studentId: null });
      });
    });
    ui.sel = new Set(ids);
    afterChange(ids);
  }

  function removeSelected() {
    if (!ui.sel.size) return;
    window.Store.commit(st => { st.desks = st.desks.filter(d => !ui.sel.has(d.id)); });
    ui.sel = new Set();
    afterChange();
  }

  function makeGroup() {
    if (!ui.sel.size) return;
    window.Store.commit(st => {
      const gid = window.Store.uid('g');
      st.groups.push({ id: gid, name: '', color: nextColor(st) });
      st.desks.forEach(d => { if (ui.sel.has(d.id)) d.groupId = gid; });
    });
    afterChange();
  }

  function ungroup() {
    window.Store.commit(st => st.desks.forEach(d => { if (ui.sel.has(d.id)) d.groupId = null; }));
    afterChange();
  }

  function nudge(dx, dy) {
    if (!ui.sel.size) return;
    window.Store.commit(st => st.desks.forEach(d => { if (ui.sel.has(d.id)) { d.x = clampX(d.x + dx); d.y = clampY(d.y + dy); } }));
  }

  function selectAll() {
    ui.sel = new Set(window.Store.state.desks.map(d => d.id));
    refreshSelection();
  }

  function clearLayout() {
    if (!window.Store.state.desks.length || !confirm(t('confirmClearLayout'))) return;
    window.Store.commit(st => { st.desks = []; st.groups = []; });
    ui.sel = new Set();
    afterChange();
  }

  function renameGroup(gid) {
    const state = window.Store.state;
    const g = state.groups.find(x => x.id === gid);
    if (!g) return;
    const name = prompt(t('renameGroupPh'), groupName(g, state));
    if (name === null) return;
    const clean = name.trim();
    window.Store.commit(st => {
      const gg = st.groups.find(x => x.id === gid);
      if (gg) gg.name = clean === t('groupN', { n: st.groups.indexOf(gg) + 1 }) ? '' : clean;
    });
  }

  function afterChange(scrollToIds) {
    ctx.onSelectionChange();
    if (scrollToIds && scrollToIds.length) {
      const ds = window.Store.state.desks.filter(d => scrollToIds.includes(d.id));
      const b = bbox(ds);
      if (b) {
        const vx = b.x1 * ui.zoom, vy = b.y1 * ui.zoom;
        if (vx < stage.scrollLeft || vx + b.w * ui.zoom > stage.scrollLeft + stage.clientWidth) stage.scrollLeft = vx - 60;
        if (vy < stage.scrollTop || vy + b.h * ui.zoom > stage.scrollTop + stage.clientHeight) stage.scrollTop = vy - 80;
      }
    }
  }

  /* ---------- zoom ---------- */
  function setZoom(z) {
    ui.zoom = Math.max(0.3, Math.min(2, Math.round(z * 100) / 100));
    render();
    ctx.onZoom();
  }
  function fit() {
    const desks = window.Store.state.desks;
    const b = bbox(desks) || { x1: 0, y1: 0, x2: 900, y2: 600 };
    const z = Math.min((stage.clientWidth - 30) / (b.x2 + 40), (stage.clientHeight - 30) / (b.y2 + 40), 1.4);
    setZoom(Math.max(0.3, z));
    stage.scrollLeft = 0; stage.scrollTop = 0;
  }

  /* ---------- seat mode: drag names ---------- */
  // Drag a student's name (from the list or from a desk). Calls onClick when it was only a tap.
  function startNameDrag(e, studentId, onClick) {
    if (e.button !== undefined && e.button !== 0) return;
    const p0 = { x: e.clientX, y: e.clientY };
    let ghost = null, hover = null;
    const student = window.Store.state.students.find(s => s.id === studentId);
    const findTarget = ev => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el) return null;
      return el.closest('.desk') || el.closest('[data-dropzone="unseat"]');
    };
    gesture(e, ev => {
      if (!student) return;
      if (!ghost) {
        if (Math.hypot(ev.clientX - p0.x, ev.clientY - p0.y) < 6) return;
        ghost = document.createElement('div');
        ghost.className = 'ghost' + (student.gender ? ' g' + student.gender : '');
        ghost.textContent = student.name;
        document.body.appendChild(ghost);
        document.body.classList.add('name-dragging');
      }
      ev.preventDefault();
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
      const tgt = findTarget(ev);
      if (tgt !== hover) {
        if (hover) hover.classList.remove('drop-hover');
        hover = tgt;
        if (hover) hover.classList.add('drop-hover');
      }
    }, (ev, cancelled) => {
      if (hover) hover.classList.remove('drop-hover');
      document.body.classList.remove('name-dragging');
      if (!ghost) { if (!cancelled) onClick(); return; }
      ghost.remove();
      if (cancelled) return;
      const tgt = findTarget(ev);
      if (!tgt) return;
      if (tgt.dataset.desk) placeStudent(studentId, tgt.dataset.desk);
      else unseat(studentId);
    });
  }

  // Put a student on a desk. Whoever was there swaps to the student's old desk (or becomes unseated).
  function placeStudent(studentId, deskId) {
    window.Store.commit(st => {
      const target = st.desks.find(d => d.id === deskId);
      if (!target || target.studentId === studentId) return;
      const from = st.desks.find(d => d.studentId === studentId);
      const displaced = target.studentId;
      target.studentId = studentId;
      if (from) from.studentId = displaced || null;
    });
  }
  function unseat(studentId) {
    window.Store.commit(st => st.desks.forEach(d => { if (d.studentId === studentId) d.studentId = null; }));
  }

  function seatDown(e) {
    const deskEl = e.target.closest('.desk');
    if (!deskEl) {
      // tap on empty floor clears the picked student
      gesture(e, () => {}, (ev, cancelled) => { if (!cancelled && ui.picked) { ui.picked = null; ctx.onPick(); } });
      return;
    }
    e.preventDefault();
    const desk = window.Store.state.desks.find(d => d.id === deskEl.dataset.desk);
    startNameDrag(e, desk.studentId, () => ctx.onDeskClick(desk));
  }

  function init(opts) {
    board = opts.board; stage = opts.stage; sizer = opts.sizer; ctx = opts; ui = opts.ui;
    board.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (ui.tab === 'layout') layoutDown(e); else seatDown(e);
    });
    board.addEventListener('dblclick', e => {
      const label = e.target.closest('.glabel');
      if (label && ui.tab === 'layout') renameGroup(label.dataset.group);
    });
    // Ctrl + wheel zoom
    stage.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(ui.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
    }, { passive: false });
  }

  window.Layout = {
    init, render, refreshSelection, startNameDrag, placeStudent, unseat,
    addDesk: () => addBlock(1, 1, false),
    addGroup: (cols, rows) => addBlock(cols, rows, true),
    quickRows, duplicate, removeSelected, makeGroup, ungroup, nudge, selectAll, clearLayout, renameGroup,
    setZoom, fit, groupName, roleName, COLORS,
    BW, BH, W, H
  };
})();
