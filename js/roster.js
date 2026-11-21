/* 排排坐 · 导入名单（纯文本 / CSV / Excel），名字可以是任何语言 */
(function () {
  const MALE = ['m', 'male', 'boy', 'b', '男', '男生', '♂', 'l', 'lelaki', 'laki-laki', 'ஆண்', 'ஆ', 'மாணவன்'];
  const FEMALE = ['f', 'female', 'girl', 'g', '女', '女生', '♀', 'p', 'perempuan', 'பெண்', 'பெ', 'மாணவி'];
  // Tokens that can safely be read as gender even without a separator ("陈小明 男")
  const SAFE_TRAILING = ['男', '女', '男生', '女生', '♂', '♀', 'boy', 'girl', 'male', 'female', 'lelaki', 'perempuan', 'ஆண்', 'பெண்'];
  const HEADER = /^(names?|student( name)?s?|姓名|名字|学生|學生|nama( murid| pelajar)?|பெயர்|மாணவர்( பெயர்)?)$/i;
  const GENDER_HEADER = /^(gender|sex|性别|性別|jantina|பாலினம்)$/i;

  function gender(token) {
    const s = String(token || '').trim().toLowerCase().replace(/[.。]$/, '');
    if (!s) return null;
    if (MALE.includes(s)) return 'M';
    if (FEMALE.includes(s)) return 'F';
    return null;
  }

  function cleanName(s) {
    return String(s || '')
      .replace(/^﻿/, '')
      .replace(/^\s*\d+\s*[.)、．:]\s*/, '') // "1. Tan Wei Ming" / "1、陈小明"
      .replace(/\s+/g, ' ')
      .trim();
  }

  // cells: the cells of one row (already split); returns {name, gender} or null
  function fromCells(cells, joinRest) {
    let c = cells.map(x => String(x == null ? '' : x).trim()).filter(x => x !== '');
    if (!c.length) return null;
    // drop a leading index column ("1", "2." …)
    if (c.length > 1 && /^\d+[.)]?$/.test(c[0])) c = c.slice(1);
    let g = '';
    // gender can be in any later column
    for (let i = c.length - 1; i >= 1; i--) {
      const gg = gender(c[i]);
      if (gg) { g = gg; c.splice(i, 1); break; }
    }
    let name = cleanName(joinRest ? c.join(', ') : c[0]);
    if (!g) {
      // "陈小明（男）" / "Tan Wei Ming (M)"
      const m = name.match(/^(.*?)\s*[(（[【]\s*([^)）\]】]+?)\s*[)）\]】]$/);
      if (m && gender(m[2])) { name = m[1].trim(); g = gender(m[2]); }
    }
    if (!g) {
      const m = name.match(/^(.*\S)\s+(\S+)$/);
      if (m && SAFE_TRAILING.includes(m[2].toLowerCase())) { name = m[1].trim(); g = gender(m[2]); }
    }
    if (!name) return null;
    return { name, gender: g };
  }

  function fromRows(rows, joinRest) {
    const out = [];
    rows.forEach((cells, idx) => {
      if (idx === 0 && cells.length && HEADER.test(String(cells[0] || '').trim())) return;
      if (idx === 0 && cells.length > 1 && /^(no\.?|#|序号|bil\.?|எண்)$/i.test(String(cells[0] || '').trim())) return;
      if (cells.length === 1 && GENDER_HEADER.test(String(cells[0]).trim())) return;
      const r = fromCells(cells, joinRest);
      if (r) out.push(r);
    });
    return out;
  }

  function parseText(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const rows = lines.map(line => {
      if (line.includes('\t')) return line.split('\t');
      // split on commas / Chinese commas / semicolons only if they are separators
      if (/[,，;；]/.test(line)) return line.split(/\s*[,，;；]\s*/);
      return [line];
    });
    return fromRows(rows, true);
  }

  // SheetJS is bundled in js/vendor (works offline); the CDN is only a fallback.
  const XLSX_SOURCES = ['js/vendor/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
  let xlsxPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('xlsx')));
      s.onerror = () => { s.remove(); reject(new Error('xlsx')); };
      document.head.appendChild(s);
    });
  }
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxPromise) {
      xlsxPromise = XLSX_SOURCES.reduce((p, src) => p.catch(() => loadScript(src)), Promise.reject(new Error('start')))
        .catch(e => { xlsxPromise = null; throw e; });
    }
    return xlsxPromise;
  }

  async function parseFile(file) {
    const name = file.name.toLowerCase();
    if (/\.(xlsx|xlsm|xls|ods)$/.test(name)) {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, blankrows: false });
      return fromRows(rows);
    }
    // text / csv: try UTF-8, fall back to UTF-16 if it looks like it
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let text;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(buf);
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(buf);
    else {
      text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('�')) {
        try { text = new TextDecoder('gb18030').decode(buf); } catch (e) { /* keep utf-8 */ }
      }
    }
    return parseText(text);
  }

  window.Roster = { parseText, parseFile, gender };
})();
