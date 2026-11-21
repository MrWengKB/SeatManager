/* 排排坐 · 数据与撤销 */
(function () {
  const KEY = 'paipaizuo:v1';
  const MAX_UNDO = 80;

  function defaultRoles() {
    return [{ id: 'r_leader', key: 'leader', name: '' }, { id: 'r_monitor', key: 'monitor', name: '' }];
  }
  function blank() {
    return { app: 'paipaizuo', version: 1, title: '', desks: [], groups: [], students: [], roles: defaultRoles(), constraints: [] };
  }

  // Bring any loaded / mutated state into a consistent shape and drop dangling references.
  function normalize(s) {
    const b = blank();
    if (!s || typeof s !== 'object') return b;
    b.title = typeof s.title === 'string' ? s.title : '';
    ['desks', 'groups', 'students', 'roles', 'constraints'].forEach(k => { if (Array.isArray(s[k])) b[k] = s[k]; });

    b.students = b.students.filter(st => st && st.id && typeof st.name === 'string');
    b.students.forEach(st => {
      if (st.gender !== 'M' && st.gender !== 'F') st.gender = '';
      if (!Array.isArray(st.roles)) st.roles = [];
    });
    const sid = new Set(b.students.map(x => x.id));

    b.desks = b.desks.filter(d => d && d.id && isFinite(d.x) && isFinite(d.y));
    const seen = new Set();
    b.desks.forEach(d => {
      if (d.studentId && (!sid.has(d.studentId) || seen.has(d.studentId))) d.studentId = null;
      if (d.studentId) seen.add(d.studentId);
    });

    const used = new Set(b.desks.map(d => d.groupId).filter(Boolean));
    b.groups = b.groups.filter(g => g && g.id && used.has(g.id));
    const gid = new Set(b.groups.map(g => g.id));
    b.desks.forEach(d => { if (!d.groupId || !gid.has(d.groupId)) d.groupId = null; });

    b.roles = b.roles.filter(r => r && r.id);
    const rid = new Set(b.roles.map(r => r.id));
    b.students.forEach(st => { st.roles = st.roles.filter((r, i, a) => rid.has(r) && a.indexOf(r) === i); });

    b.constraints = b.constraints.filter(c => c && sid.has(c.a) && sid.has(c.b) && c.a !== c.b && (c.type === 'adjacent' || c.type === 'group'));
    return b;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return blank();
  }

  let state = load();
  const undoStack = [];
  const redoStack = [];
  const listeners = [];

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function emit() { listeners.forEach(fn => fn(state)); }

  function commit(mutator) {
    const before = JSON.stringify(state);
    mutator(state);
    state = normalize(state);
    if (JSON.stringify(state) === before) return false;
    undoStack.push(before);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    save();
    emit();
    return true;
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(state));
    state = normalize(JSON.parse(undoStack.pop()));
    save(); emit();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(state));
    state = normalize(JSON.parse(redoStack.pop()));
    save(); emit();
  }
  function replace(next) {
    undoStack.push(JSON.stringify(state));
    redoStack.length = 0;
    state = normalize(next);
    save(); emit();
  }

  let counter = 0;
  function uid(prefix) {
    counter = (counter + 1) % 1296;
    return prefix + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  window.Store = {
    get state() { return state; },
    commit, undo, redo, replace, uid, blank, normalize,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    subscribe: fn => listeners.push(fn)
  };
})();
