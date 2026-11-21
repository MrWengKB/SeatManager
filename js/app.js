/* 排排坐 · 界面 */
(function () {
  const { t } = window.I18n;
  const Store = window.Store, Layout = window.Layout;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ui = {
    tab: 'layout',
    sel: new Set(),       // selected desk ids (layout mode)
    picked: null,         // picked student id (seat modes)
    pickedFrom: null,     // 'list' | 'desk'
    zoom: 1,
    importText: '',
    importMsg: null,
    rows: 5, cols: 8, pairs: true,
    method: 'random',
    fillOnly: false,
    assignMsg: null,
    consA: '', consB: '', consType: 'adjacent', consMsg: null
  };
  try {
    const saved = JSON.parse(localStorage.getItem('paipaizuo:ui') || '{}');
    if (['layout', 'roster', 'assign', 'roles'].includes(saved.tab)) ui.tab = saved.tab;
    if (saved.method === 'gender') ui.method = 'gender';
  } catch (e) { /* ignore */ }
  function saveUi() { try { localStorage.setItem('paipaizuo:ui', JSON.stringify({ tab: ui.tab, method: ui.method })); } catch (e) { /* ignore */ } }

  const side = $('#side');
  const board = $('#board');

  /* ---------- header ---------- */
  function renderHeader() {
    document.title = '排排坐 · ' + t('appSub');
    $('#brandSub').textContent = t('appSub');
    const title = $('#classTitle');
    title.placeholder = t('classNamePh');
    if (document.activeElement !== title) title.value = Store.state.title || '';
    $('#printTitle').textContent = Store.state.title || '';
    $('#langSel').value = window.I18n.lang;
    $('#langSel').title = t('language');
    [['#btnNew', 'newPlan'], ['#btnOpen', 'open'], ['#btnSave', 'save'], ['#btnPrint', 'print']].forEach(([s, k]) => { $(s + ' span').textContent = t(k); $(s).title = t(k); });
    $('#btnZip span').textContent = t('offlineZip');
    $('#btnZip').title = t('offlineTip');
    $('#btnUndo').title = t('undo'); $('#btnRedo').title = t('redo');
    $('#btnUndo').disabled = !Store.canUndo();
    $('#btnRedo').disabled = !Store.canRedo();
    document.querySelectorAll('.tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === ui.tab);
      b.querySelector('span').textContent = t({ layout: 'tabLayout', roster: 'tabRoster', assign: 'tabAssign', roles: 'tabRoles' }[b.dataset.tab]);
    });
    $('#zoomOut').title = t('zoomOut'); $('#zoomIn').title = t('zoomIn'); $('#zoomFit').textContent = t('zoomFit');
    $('#zoomVal').textContent = Math.round(ui.zoom * 100) + '%';
    $('#footNote').textContent = t('autosaved');
  }

  /* ---------- helpers ---------- */
  const roleName = r => Layout.roleName(r);
  function seatedSet() { return new Set(Store.state.desks.map(d => d.studentId).filter(Boolean)); }
  function studentById(id) { return Store.state.students.find(s => s.id === id); }
  function genderBtn(s) {
    const label = s.gender === 'M' ? '♂' : s.gender === 'F' ? '♀' : '?';
    const tip = (s.gender === 'M' ? t('genderM') : s.gender === 'F' ? t('genderF') : t('genderU')) + ' · ' + t('genderTip');
    return `<button class="gbtn g${s.gender || 'U'}" data-act="gender" data-id="${s.id}" title="${esc(tip)}" aria-label="${esc(tip)}">${label}</button>`;
  }
  function chip(s, extra) {
    const cls = ['chip'];
    if (s.gender) cls.push('g' + s.gender);
    if (ui.picked === s.id) cls.push('picked');
    if (extra) cls.push(extra);
    return `<span class="${cls.join(' ')}" data-student="${s.id}">${esc(s.name)}</span>`;
  }
  function msg(m) { return m ? `<div class="msg ${m.kind || ''}">${esc(m.text)}</div>` : ''; }

  /* ---------- sidebar ---------- */
  function renderSide() {
    const st = Store.state;
    let h = '';
    if (ui.tab === 'layout') h = sideLayout(st);
    else if (ui.tab === 'roster') h = sideRoster(st);
    else if (ui.tab === 'assign') h = sideAssign(st);
    else h = sideRoles(st);
    const scroll = side.scrollTop;
    side.innerHTML = h;
    side.scrollTop = scroll;
  }

  function sideLayout(st) {
    const n = ui.sel.size;
    let h = `<section><h3>${t('addTitle')}</h3>
      <div class="btnrow">
        <button data-act="addDesk"><i class="ic-desk"></i>${t('addDesk')}</button>
        <button data-act="addGroup4"><i class="ic-g4"></i>${t('addGroup4')}</button>
        <button data-act="addGroup6"><i class="ic-g6"></i>${t('addGroup6')}</button>
      </div></section>`;
    h += `<section><h3>${t('selTitle')} ${n ? `<em>${t('selectedN', { n })}</em>` : ''}</h3>
      ${n ? '' : `<p class="hint">${t('nothingSelected')}</p>`}
      <div class="btnrow">
        <button data-act="duplicate" ${n ? '' : 'disabled'}>${t('duplicate')} <kbd>Ctrl D</kbd></button>
        <button data-act="makeGroup" ${n ? '' : 'disabled'}>${t('makeGroup')}</button>
        <button data-act="ungroup" ${n && st.desks.some(d => ui.sel.has(d.id) && d.groupId) ? '' : 'disabled'}>${t('ungroup')}</button>
        <button data-act="removeSel" class="danger" ${n ? '' : 'disabled'}>${t('delete')}</button>
        <button data-act="selectAll" ${st.desks.length ? '' : 'disabled'}>${t('selectAll')}</button>
      </div></section>`;
    h += `<section><h3>${t('groupsTitle')}</h3>`;
    if (!st.groups.length) h += `<p class="hint">${t('noGroups')}</p>`;
    else {
      h += '<ul class="glist">';
      st.groups.forEach(g => {
        const cnt = st.desks.filter(d => d.groupId === g.id).length;
        h += `<li><span class="swatch" style="background:${Layout.COLORS[g.color % Layout.COLORS.length]}"></span>
          <button class="link" data-act="selGroup" data-id="${g.id}">${esc(Layout.groupName(g, st))}</button>
          <span class="muted">${cnt}</span>
          <button class="icon" data-act="renameGroup" data-id="${g.id}" title="${esc(t('rename'))}">✎</button></li>`;
      });
      h += '</ul>';
    }
    h += `</section>`;
    h += `<section><h3>${t('quickTitle')}</h3>
      <div class="formrow">
        <label>${t('rows')} <input type="number" min="1" max="12" id="qRows" value="${ui.rows}"></label>
        <label>${t('cols')} <input type="number" min="1" max="14" id="qCols" value="${ui.cols}"></label>
      </div>
      <div class="formrow">
        <label class="radio"><input type="radio" name="qArr" value="single" ${ui.pairs ? '' : 'checked'}> ${t('arrSingle')}</label>
        <label class="radio"><input type="radio" name="qArr" value="pairs" ${ui.pairs ? 'checked' : ''}> ${t('arrPairs')}</label>
      </div>
      <div class="btnrow"><button data-act="quickRows">${t('generate')}</button>
      <button data-act="clearLayout" class="danger ghostbtn">${t('clearLayout')}</button></div></section>`;
    h += `<p class="hint small">${t('deskCount', { n: st.desks.length, g: st.groups.length })}<br>${t('layoutHelp')}</p>`;
    return h;
  }

  function sideRoster(st) {
    const seated = seatedSet();
    const m = st.students.filter(s => s.gender === 'M').length, f = st.students.filter(s => s.gender === 'F').length;
    let h = `<section><h3>${t('importTitle')}</h3>
      <p class="hint small">${t('importHelp')}</p>
      <textarea id="importText" rows="6" placeholder="${esc(t('pastePh'))}">${esc(ui.importText)}</textarea>
      <div class="btnrow">
        <label class="filebtn"><input type="file" id="importFile" accept=".txt,.csv,.tsv,.xlsx,.xls,.xlsm,.ods,text/plain,text/csv">${t('chooseFile')}</label>
      </div>
      <div class="btnrow">
        <button data-act="importAppend" class="primary">${t('importAppend')}</button>
        <button data-act="importReplace">${t('importReplace')}</button>
      </div>${msg(ui.importMsg)}</section>`;
    h += `<section data-dropzone="unseat"><h3>${t('studentsN', { n: st.students.length })}</h3>
      <p class="hint small">${t('genderStats', { m, f, u: st.students.length - m - f })}</p>
      <form class="addrow" data-form="addStudent"><input id="addName" placeholder="${esc(t('addStudentPh'))}" autocomplete="off"><button>${t('add')}</button></form>`;
    if (!st.students.length) h += `<p class="hint">${t('emptyRoster')}</p>`;
    else {
      const roles = new Map(st.roles.map(r => [r.id, r]));
      h += '<ul class="slist">';
      st.students.forEach(s => {
        const badges = s.roles.map(r => roles.get(r)).filter(Boolean).map(r => `<span class="badge">${esc(roleName(r))}</span>`).join('');
        h += `<li>${genderBtn(s)}${chip(s)}${badges}
          <span class="spacer"></span>${seated.has(s.id) ? `<span class="seated" title="${esc(t('seatedMark'))}">✓</span>` : ''}
          <button class="icon" data-act="renameStudent" data-id="${s.id}" title="${esc(t('rename'))}">✎</button>
          <button class="icon danger" data-act="delStudent" data-id="${s.id}" title="${esc(t('delete'))}">✕</button></li>`;
      });
      h += `</ul><div class="btnrow"><button data-act="clearRoster" class="danger ghostbtn">${t('clearRoster')}</button></div>`;
    }
    h += '</section>';
    return h;
  }

  function sideAssign(st) {
    const seated = seatedSet();
    const unseated = st.students.filter(s => !seated.has(s.id));
    const broken = new Set(window.Seating.brokenConstraints(st));
    let h = `<section><h3>${t('autoTitle')}</h3>
      <label class="radio"><input type="radio" name="method" value="random" ${ui.method === 'random' ? 'checked' : ''}> ${t('methodRandom')}</label>
      <label class="radio"><input type="radio" name="method" value="gender" ${ui.method === 'gender' ? 'checked' : ''}> ${t('methodGender')}</label>
      <label class="check"><input type="checkbox" id="fillOnly" ${ui.fillOnly ? 'checked' : ''}> ${t('fillOnly')}</label>
      <div class="btnrow"><button data-act="assign" class="primary">🎲 ${t('assignBtn')}</button>
      <button data-act="clearSeats" class="danger ghostbtn">${t('clearSeats')}</button></div>${msg(ui.assignMsg)}</section>`;

    h += `<section data-dropzone="unseat"><h3>${t('manualTitle')}</h3><p class="hint small">${t('manualHelp')}</p>
      <h4>${t('unseatedN', { n: unseated.length })}</h4>`;
    if (ui.picked && ui.pickedFrom === 'list' && studentById(ui.picked)) h += `<div class="msg info">${esc(t('pickedHint', { name: studentById(ui.picked).name }))}</div>`;
    h += unseated.length ? `<div class="chips">${unseated.map(s => chip(s)).join('')}</div>` : `<p class="hint">${st.students.length ? t('allSeated') : t('noStudents')}</p>`;
    h += '</section>';

    const opts = sel => `<option value="">${esc(t('pickStudent'))}</option>` + st.students.map(s => `<option value="${s.id}" ${sel === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    h += `<section><h3>${t('consTitle')}</h3>
      <div class="cons-form">
        <select id="consA">${opts(ui.consA)}</select>
        <select id="consType">
          <option value="adjacent" ${ui.consType === 'adjacent' ? 'selected' : ''}>${esc(t('consAdjacent'))}</option>
          <option value="group" ${ui.consType === 'group' ? 'selected' : ''}>${esc(t('consGroup'))}</option>
        </select>
        <select id="consB">${opts(ui.consB)}</select>
        <button data-act="addCons">${t('consAdd')}</button>
      </div>${msg(ui.consMsg)}<p class="hint small">${t('consHelp')}</p>`;
    if (!st.constraints.length) h += `<p class="hint">${t('consNone')}</p>`;
    else {
      h += '<ul class="clist">';
      st.constraints.forEach(c => {
        const a = studentById(c.a), b = studentById(c.b);
        const bad = broken.has(c.id);
        h += `<li class="${bad ? 'bad' : ''}">${bad ? `<span title="${esc(t('consBroken'))}">⚠</span>` : '<span class="okmark">✓</span>'}
          <span><b>${esc(a.name)}</b> ${esc(t(c.type === 'adjacent' ? 'consAdjacent' : 'consGroup'))} <b>${esc(b.name)}</b></span>
          <span class="spacer"></span><button class="icon danger" data-act="delCons" data-id="${c.id}" title="${esc(t('delete'))}">✕</button></li>`;
      });
      h += '</ul>';
    }
    h += '</section>';
    return h;
  }

  function sideRoles(st) {
    let h = `<section><h3>${t('rolesTitle')}</h3><ul class="rlist">`;
    st.roles.forEach(r => {
      h += `<li><span class="badge">${esc(roleName(r))}</span><span class="spacer"></span>
        <button class="icon" data-act="renameRole" data-id="${r.id}" title="${esc(t('rename'))}">✎</button>
        <button class="icon danger" data-act="delRole" data-id="${r.id}" title="${esc(t('delete'))}">✕</button></li>`;
    });
    h += `</ul><form class="addrow" data-form="addRole"><input id="newRole" placeholder="${esc(t('newRolePh'))}" autocomplete="off"><button>${t('add')}</button></form></section>`;

    const p = ui.picked && studentById(ui.picked);
    h += `<section class="picked-card">`;
    if (!p) h += `<p class="hint">${t('pickForRole')}</p>`;
    else {
      h += `<h3>${esc(t('rolesFor', { name: p.name }))}</h3><div class="toggles">`;
      st.roles.forEach(r => {
        const on = p.roles.includes(r.id);
        h += `<button class="toggle ${on ? 'on' : ''}" data-act="toggleRole" data-id="${r.id}">${on ? '✓ ' : ''}${esc(roleName(r))}</button>`;
      });
      h += '</div>';
    }
    h += '</section>';

    h += `<section><h3>${t('allStudents')}</h3>`;
    h += st.students.length ? `<div class="chips">${st.students.map(s => chip(s)).join('')}</div>` : `<p class="hint">${t('noStudents')}</p>`;
    h += '</section>';

    h += `<section><h3>${t('summaryTitle')}</h3><dl class="summary">`;
    const groupOf = new Map();
    st.desks.forEach(d => { if (d.studentId && d.groupId) groupOf.set(d.studentId, d.groupId); });
    st.roles.forEach(r => {
      const holders = st.students.filter(s => s.roles.includes(r.id));
      h += `<dt>${esc(roleName(r))}</dt><dd>`;
      if (!holders.length) h += `<span class="muted">${t('nobody')}</span>`;
      else h += holders.map(s => {
        let extra = '';
        if (r.key === 'leader') {
          const g = st.groups.find(x => x.id === groupOf.get(s.id));
          extra = ` <span class="muted">(${esc(g ? Layout.groupName(g, st) : t('leaderNoGroup'))})</span>`;
        }
        return chip(s) + extra;
      }).join(' ');
      h += '</dd>';
    });
    h += '</dl></section>';
    return h;
  }

  /* ---------- actions ---------- */
  async function doImport(replace) {
    const list = window.Roster.parseText(ui.importText);
    if (!list.length) { ui.importMsg = { kind: 'warn', text: t('importNone') }; renderSide(); return; }
    addStudents(list, replace);
  }
  function addStudents(list, replace) {
    if (replace && Store.state.students.length && !confirm(t('confirmReplaceRoster'))) return;
    Store.commit(st => {
      if (replace) { st.students = []; st.desks.forEach(d => { d.studentId = null; }); st.constraints = []; }
      list.forEach(x => st.students.push({ id: Store.uid('s'), name: x.name, gender: x.gender || '', roles: [] }));
    });
    ui.importText = '';
    ui.importMsg = { kind: 'ok', text: t('importedN', { n: list.length }) };
    renderSide();
  }
  // Read a file into the text box so the teacher can check it before adding.
  async function importFile(file) {
    ui.importMsg = { kind: 'info', text: t('excelLoading') };
    renderSide();
    try {
      const list = await window.Roster.parseFile(file);
      if (!list.length) { ui.importMsg = { kind: 'warn', text: t('importNone') }; renderSide(); return; }
      ui.importText = list.map(x => x.gender ? `${x.name}, ${x.gender}` : x.name).join('\n');
      ui.importMsg = { kind: 'info', text: t('fileLoaded', { n: list.length }) };
    } catch (e) {
      ui.importMsg = { kind: 'warn', text: t('importError') };
    }
    renderSide();
  }

  function doAssign() {
    const st = Store.state;
    if (!st.desks.length) { ui.assignMsg = { kind: 'warn', text: t('noDesks') }; renderSide(); return; }
    if (!st.students.length) { ui.assignMsg = { kind: 'warn', text: t('noStudents') }; renderSide(); return; }
    const res = window.Seating.assign(st, { method: ui.method, fillOnly: ui.fillOnly });
    Store.commit(s => s.desks.forEach((d, i) => { d.studentId = res.seats[i] || null; }));
    const parts = [];
    let kind = 'ok';
    parts.push(res.broken ? t('resultViolations', { n: res.broken }) : t('resultOk'));
    if (res.broken) kind = 'warn';
    if (res.unseated) { parts.push(t('notEnoughDesks', { n: res.unseated })); kind = 'warn'; }
    if (ui.method === 'gender') {
      const u = st.students.filter(s => !s.gender).length;
      if (u) parts.push(t('genderMissing', { n: u }));
    }
    ui.picked = null;
    ui.assignMsg = { kind, text: parts.join(' ') };
    renderAll();
  }

  function pick(id, from) {
    ui.picked = ui.picked === id ? null : id;
    ui.pickedFrom = from;
    renderAll();
  }

  function onDeskClick(desk) {
    const p = ui.picked;
    if (ui.tab !== 'roles' && p) {
      if (ui.pickedFrom === 'list' && desk.studentId !== p) { Layout.placeStudent(p, desk.id); ui.picked = null; renderAll(); return; }
      if (ui.pickedFrom === 'desk' && !desk.studentId) { Layout.placeStudent(p, desk.id); ui.picked = null; renderAll(); return; }
    }
    if (desk.studentId) pick(desk.studentId, 'desk');
    else if (p) { ui.picked = null; renderAll(); }
  }

  function promptName(ph, cur) {
    const v = prompt(ph, cur);
    if (v === null) return null;
    const s = v.trim();
    return s || null;
  }

  const actions = {
    addDesk: () => Layout.addDesk(),
    addGroup4: () => Layout.addGroup(2, 2),
    addGroup6: () => Layout.addGroup(3, 2),
    duplicate: () => Layout.duplicate(),
    makeGroup: () => Layout.makeGroup(),
    ungroup: () => Layout.ungroup(),
    removeSel: () => Layout.removeSelected(),
    selectAll: () => Layout.selectAll(),
    clearLayout: () => Layout.clearLayout(),
    quickRows: () => Layout.quickRows(Math.max(1, Math.min(12, ui.rows | 0)), Math.max(1, Math.min(14, ui.cols | 0)), ui.pairs),
    selGroup: id => { ui.sel = new Set(Store.state.desks.filter(d => d.groupId === id).map(d => d.id)); Layout.refreshSelection(); },
    renameGroup: id => Layout.renameGroup(id),
    importAppend: () => doImport(false),
    importReplace: () => doImport(true),
    gender: id => Store.commit(st => { const s = st.students.find(x => x.id === id); if (s) s.gender = s.gender === '' ? 'M' : s.gender === 'M' ? 'F' : ''; }),
    renameStudent: id => {
      const s = studentById(id); if (!s) return;
      const v = promptName(t('renameStudentPh'), s.name);
      if (v) Store.commit(st => { st.students.find(x => x.id === id).name = v; });
    },
    delStudent: id => {
      const s = studentById(id); if (!s || !confirm(t('confirmDeleteStudent', { name: s.name }))) return;
      if (ui.picked === id) ui.picked = null;
      Store.commit(st => { st.students = st.students.filter(x => x.id !== id); });
    },
    clearRoster: () => { if (confirm(t('confirmClearRoster'))) { ui.picked = null; Store.commit(st => { st.students = []; }); } },
    assign: doAssign,
    clearSeats: () => { if (seatedSet().size && confirm(t('confirmClearSeats'))) { ui.assignMsg = null; Store.commit(st => st.desks.forEach(d => { d.studentId = null; })); } },
    addCons: () => {
      if (!ui.consA || !ui.consB || ui.consA === ui.consB) { ui.consMsg = { kind: 'warn', text: t('consSame') }; renderSide(); return; }
      ui.consMsg = null;
      Store.commit(st => {
        const dup = st.constraints.some(c => c.type === ui.consType && ((c.a === ui.consA && c.b === ui.consB) || (c.a === ui.consB && c.b === ui.consA)));
        if (!dup) st.constraints.push({ id: Store.uid('c'), a: ui.consA, b: ui.consB, type: ui.consType });
      });
      ui.consA = ''; ui.consB = '';
      renderSide();
    },
    delCons: id => Store.commit(st => { st.constraints = st.constraints.filter(c => c.id !== id); }),
    renameRole: id => {
      const r = Store.state.roles.find(x => x.id === id); if (!r) return;
      const v = promptName(t('renameRolePh'), roleName(r));
      if (v) Store.commit(st => { const rr = st.roles.find(x => x.id === id); rr.name = (rr.key && v === t('role_' + rr.key)) ? '' : v; });
    },
    delRole: id => {
      const r = Store.state.roles.find(x => x.id === id); if (!r) return;
      if (confirm(t('confirmDeleteRole', { name: roleName(r) }))) Store.commit(st => { st.roles = st.roles.filter(x => x.id !== id); });
    },
    toggleRole: id => {
      const sid = ui.picked; if (!sid) return;
      Store.commit(st => {
        const s = st.students.find(x => x.id === sid); if (!s) return;
        s.roles = s.roles.includes(id) ? s.roles.filter(r => r !== id) : s.roles.concat(id);
      });
    }
  };

  side.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const fn = actions[b.dataset.act];
    if (fn) fn(b.dataset.id);
  });
  side.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.dataset.form;
    if (f === 'addStudent') {
      const v = $('#addName').value.trim();
      if (!v) return;
      const parsed = window.Roster.parseText(v)[0] || { name: v, gender: '' };
      Store.commit(st => st.students.push({ id: Store.uid('s'), name: parsed.name, gender: parsed.gender, roles: [] }));
      setTimeout(() => { const i = $('#addName'); if (i) i.focus(); }, 0);
    } else if (f === 'addRole') {
      const v = $('#newRole').value.trim();
      if (!v) return;
      Store.commit(st => st.roles.push({ id: Store.uid('r'), key: '', name: v }));
    }
  });
  side.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'importText') ui.importText = e.target.value;
    else if (id === 'qRows') ui.rows = +e.target.value;
    else if (id === 'qCols') ui.cols = +e.target.value;
  });
  side.addEventListener('change', e => {
    const el = e.target;
    if (el.name === 'qArr') ui.pairs = el.value === 'pairs';
    else if (el.name === 'method') { ui.method = el.value; saveUi(); }
    else if (el.id === 'fillOnly') ui.fillOnly = el.checked;
    else if (el.id === 'consA') ui.consA = el.value;
    else if (el.id === 'consB') ui.consB = el.value;
    else if (el.id === 'consType') ui.consType = el.value;
    else if (el.id === 'importFile' && el.files[0]) importFile(el.files[0]);
  });
  // drag or click names in the sidebar
  side.addEventListener('pointerdown', e => {
    const c = e.target.closest('.chip[data-student]');
    if (!c || ui.tab === 'layout') return;
    e.preventDefault();
    const id = c.dataset.student;
    Layout.startNameDrag(e, id, () => pick(id, ui.tab === 'roles' ? 'desk' : 'list'));
  });

  /* ---------- header events ---------- */
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    ui.tab = b.dataset.tab;
    if (ui.tab !== 'layout') ui.sel = new Set();
    saveUi();
    renderAll();
  }));
  $('#langSel').addEventListener('change', e => { window.I18n.setLang(e.target.value); renderAll(); });
  $('#classTitle').addEventListener('change', e => Store.commit(st => { st.title = e.target.value.trim(); }));
  $('#btnUndo').addEventListener('click', () => Store.undo());
  $('#btnRedo').addEventListener('click', () => Store.redo());
  $('#btnNew').addEventListener('click', () => {
    if (!confirm(t('confirmNew'))) return;
    ui.sel = new Set(); ui.picked = null; ui.assignMsg = null; ui.importMsg = null;
    Store.replace(Store.blank());
  });
  $('#btnSave').addEventListener('click', () => {
    const st = Store.state;
    const blob = new Blob([JSON.stringify(st, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.href = URL.createObjectURL(blob);
    a.download = `${(st.title || '排排坐').replace(/[\\/:*?"<>|]/g, '_')}-${stamp}.ppz.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#btnOpen').addEventListener('click', () => $('#openFile').click());
  $('#openFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.app !== 'paipaizuo') throw new Error('bad');
      ui.sel = new Set(); ui.picked = null;
      Store.replace(data);
      setTimeout(() => Layout.fit(), 0);
    } catch (err) { alert(t('fileError')); }
  });
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#zoomIn').addEventListener('click', () => Layout.setZoom(ui.zoom * 1.15));
  $('#zoomOut').addEventListener('click', () => Layout.setZoom(ui.zoom / 1.15));
  $('#zoomFit').addEventListener('click', () => Layout.fit());

  // print: fit the classroom onto one landscape page
  let preZoom = null;
  window.addEventListener('beforeprint', () => {
    const desks = Store.state.desks;
    if (!desks.length) return;
    preZoom = ui.zoom;
    const x2 = Math.max(...desks.map(d => d.x + Layout.W)) + 20, y2 = Math.max(...desks.map(d => d.y + Layout.H)) + 20;
    ui.zoom = Math.min(1000 / x2, 640 / y2, 1.3);
    const tab = ui.tab; ui.tab = 'print'; Layout.render(); ui.tab = tab;
    $('#sizer').style.width = x2 * ui.zoom + 'px';
    $('#sizer').style.height = y2 * ui.zoom + 'px';
  });
  window.addEventListener('afterprint', () => { if (preZoom !== null) { ui.zoom = preZoom; preZoom = null; } renderAll(); });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? Store.redo() : Store.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); Store.redo(); return; }
    if (typing) return;
    if (e.key === 'Escape') { ui.sel = new Set(); ui.picked = null; renderAll(); return; }
    if (ui.tab !== 'layout') return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); Layout.duplicate(); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); Layout.selectAll(); }
    else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); Layout.makeGroup(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); Layout.removeSelected(); }
    else if (e.key.startsWith('Arrow') && ui.sel.size) {
      e.preventDefault();
      const s = e.shiftKey ? 50 : 10;
      Layout.nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
    }
  });

  /* ---------- wiring ---------- */
  function renderAll() {
    // drop selections that no longer exist
    const st = Store.state;
    const ids = new Set(st.desks.map(d => d.id));
    ui.sel = new Set([...ui.sel].filter(id => ids.has(id)));
    if (ui.picked && !st.students.some(s => s.id === ui.picked)) ui.picked = null;
    document.body.dataset.tab = ui.tab;
    renderHeader();
    Layout.render();
    renderSide();
  }

  Layout.init({
    board, stage: $('#stage'), sizer: $('#sizer'), ui,
    onSelectionChange: () => { if (ui.tab === 'layout') renderSide(); },
    onDeskClick,
    onPick: renderAll,
    onZoom: renderHeader
  });
  Store.subscribe(renderAll);
  renderAll();
  requestAnimationFrame(() => { if (Store.state.desks.length) Layout.fit(); });
})();
