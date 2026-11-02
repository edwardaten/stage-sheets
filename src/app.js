/* Stage Sheets app shell: library, editor, preview, export. */
'use strict';
(function () {
  const SS = window.SS;
  const FONTS = window.SS_FONTS;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  let measure = null;

  /* ---------- storage (IndexedDB with memory fallback) ---------- */
  const store = (() => {
    let dbp = null; const mem = new Map();
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res) => {
        try {
          const rq = indexedDB.open('stage-sheets', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('songs', { keyPath: 'id' });
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => res(null);
          rq.onblocked = () => res(null);
        } catch (e) { res(null); }
      });
      return dbp;
    }
    async function tx(mode, fn) {
      const db = await open();
      if (!db) return fn(null);
      return new Promise((res, rej) => {
        try {
          const t = db.transaction('songs', mode); const os = t.objectStore('songs');
          const r = fn(os);
          t.oncomplete = () => res(r && r.result !== undefined ? r.result : r);
          t.onerror = () => rej(t.error);
        } catch (e) { rej(e); }
      });
    }
    return {
      async all() {
        try {
          const db = await open(); if (!db) return Array.from(mem.values());
          return await new Promise((res) => { const r = db.transaction('songs').objectStore('songs').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
        } catch (e) { return Array.from(mem.values()); }
      },
      async put(song) { mem.set(song.id, song); try { await tx('readwrite', os => os && os.put(song)); } catch (e) { /* keep in memory */ } },
      async del(id) { mem.delete(id); try { await tx('readwrite', os => os && os.delete(id)); } catch (e) { } },
    };
  })();

  const prefs = {
    get(k, d) { try { const v = localStorage.getItem('ss.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ss.' + k, JSON.stringify(v)); } catch (e) { } },
  };

  /* ---------- state ---------- */
  const S = { songs: [], current: null, paper: prefs.get('paper', 'light'), query: '', dirty: false, view: 'edit', layout: null, page: 0 };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const blankSong = () => ({ id: uid(), title: '', artist: '', raw: '', shapeKey: '', capo: 0, transpose: 0, lockSound: true, bpm: '', tuning: '', notes: '', shapes: '', tags: [], condense: true, collapse: false, fontSize: 'auto', updated: Date.now(), created: Date.now() });

  /* ---------- environment: artifact viewer vs installed app ---------- */
  let downloads = null;
  async function initEnv() {
    if (window.claude && typeof window.claude.use === 'function') {
      try { downloads = await window.claude.use('downloads'); } catch (e) { downloads = null; }
    }
    if (!window.claude && 'serviceWorker' in navigator && location.protocol === 'https:') {
      try { navigator.serviceWorker.register('sw.js'); } catch (e) { }
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  }

  async function saveFile(filename, blob) {
    if (downloads) {
      try { await downloads.save({ filename, data: blob }); toast('Saved ' + filename); return; }
      catch (e) { if (e && e.code === 'declined') return; toast('Could not save the file here.'); return; }
    }
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------- library ---------- */
  function sortSongs() { S.songs.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })); }

  function songChip(song) {
    try {
      const info = SS.songInfo(song);
      const k = info.sounds ? SS.keyName(info.sounds) : '';
      return k + (song.capo ? ' · capo ' + song.capo : '');
    } catch (e) { return ''; }
  }

  function renderLibrary() {
    const q = S.query.trim().toLowerCase();
    const list = $('#songList'); list.innerHTML = '';
    const items = S.songs.filter(s => (!q || (s.title + ' ' + s.artist).toLowerCase().includes(q)) && (!S.tagFilter || (s.tags || []).includes(S.tagFilter)));
    $('#libCount').textContent = S.songs.length + (S.songs.length === 1 ? ' song' : ' songs');
    if (!items.length) {
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = S.songs.length ? 'No songs match this search or tag.' : 'No songs yet. Tap New song and paste a chord sheet.';
      list.appendChild(li); return;
    }
    for (const s of items) {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'song' + (S.current && S.current.id === s.id ? ' active' : '');
      b.innerHTML = '<span class="st"></span><span class="sa"></span><span class="sk"></span>';
      $('.st', b).textContent = s.title || 'Untitled';
      $('.sa', b).textContent = (s.artist || 'Unknown artist') + ((s.tags || []).length ? ' · ' + s.tags.join(', ') : '') + (s.example ? ' · example' : '');
      $('.sk', b).textContent = songChip(s);
      b.addEventListener('click', () => { openSong(s.id); document.body.classList.remove('lib-open'); });
      li.appendChild(b); list.appendChild(li);
    }
  }

  /* ---------- editor ---------- */
  const FIELDS = ['title', 'artist', 'bpm', 'tuning', 'notes', 'shapes', 'raw'];
  const TAGS = ['Campfire', 'Bar', 'Jam', 'Blues'];
  function fillEditor() {
    const s = S.current; const has = !!s;
    $('#editor').hidden = !has; $('#noSong').hidden = has;
    if (!has) return;
    for (const f of FIELDS) $('#f_' + f).value = s[f] || '';
    $('#f_collapse').checked = !!s.collapse;
    $('#f_condense').checked = s.condense !== false;
    renderTagChips();
    $('#f_lock').checked = s.lockSound !== false;
    $('#f_font').value = s.fontSize || 'auto';
    $('#delConfirm').hidden = true; $('#btnDelete').hidden = false;
    fillKeySelect(); refreshKeyReadout();
  }

  function fillKeySelect() {
    const s = S.current; const sel = $('#f_shapeKey');
    const p = SS.parse(s.raw); const det = SS.detectKey(p);
    const detName = det ? SS.keyName(det) : '';
    sel.innerHTML = '';
    const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Auto' + (detName ? ' (' + detName + ')' : ''); sel.appendChild(auto);
    for (const k of SS.MAJOR_NAMES.concat(SS.MINOR_NAMES)) { const o = document.createElement('option'); o.value = k; o.textContent = k; sel.appendChild(o); }
    sel.value = s.shapeKey || '';
  }

  function refreshKeyReadout() {
    const s = S.current; if (!s) return;
    const info = SS.songInfo(s);
    $('#capoVal').textContent = s.capo || 0;
    $('#trVal').textContent = (s.transpose > 0 ? '+' : '') + (s.transpose || 0);
    const pretty = k => k ? SS.keyName(k).replace(/b(?=m?$)/, '♭').replace('#', '♯') : '?';
    $('#readSounds').textContent = pretty(info.sounds);
    $('#readPlay').textContent = pretty(info.play);
    $('#readCapo').textContent = s.capo ? 'capo ' + s.capo : 'no capo';
  }

  let saveT = null, renderT = null;
  function touch(immediateRender) {
    S.current.updated = Date.now(); S.dirty = true;
    clearTimeout(saveT); saveT = setTimeout(persistCurrent, 500);
    clearTimeout(renderT); renderT = setTimeout(() => { renderPreview(); renderLibrary(); }, immediateRender ? 0 : 280);
  }
  async function persistCurrent() {
    if (!S.current) return;
    const c = S.current; if (c.example && S.dirty) delete c.example;
    await store.put(JSON.parse(JSON.stringify(c))); S.dirty = false;
  }

  function bindEditor() {
    for (const f of FIELDS) {
      $('#f_' + f).addEventListener('input', e => {
        S.current[f] = e.target.value;
        if (f === 'raw') { absorbMeta(); fillKeySelect(); refreshKeyReadout(); }
        touch();
      });
    }
    $('#f_shapeKey').addEventListener('change', e => { S.current.shapeKey = e.target.value; refreshKeyReadout(); touch(true); });
    $('#f_collapse').addEventListener('change', e => { S.current.collapse = e.target.checked; touch(true); });
    $('#f_condense').addEventListener('change', e => { S.current.condense = e.target.checked; touch(true); });
    $('#f_tagsOther').addEventListener('change', e => {
      const fixed = (S.current.tags || []).filter(t => TAGS.includes(t));
      const extra = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
      S.current.tags = Array.from(new Set(fixed.concat(extra))); touch(true); renderFilterChips();
    });
    $('#f_lock').addEventListener('change', e => { S.current.lockSound = e.target.checked; touch(true); });
    $('#f_font').addEventListener('change', e => { S.current.fontSize = e.target.value; touch(true); });
    const step = (field, d) => {
      const s = S.current;
      if (field === 'capo') {
        const nv = Math.max(0, Math.min(12, (s.capo || 0) + d)); const delta = nv - (s.capo || 0);
        if (!delta) return; s.capo = nv;
        if (s.lockSound !== false) s.transpose = normT((s.transpose || 0) - delta);
      } else {
        s.transpose = normT((s.transpose || 0) + d);
      }
      refreshKeyReadout(); touch(true);
    };
    $('#capoDown').addEventListener('click', () => step('capo', -1));
    $('#capoUp').addEventListener('click', () => step('capo', 1));
    $('#trDown').addEventListener('click', () => step('tr', -1));
    $('#trUp').addEventListener('click', () => step('tr', 1));
    $('#btnDelete').addEventListener('click', () => { $('#delConfirm').hidden = false; $('#btnDelete').hidden = true; });
    $('#delNo').addEventListener('click', () => { $('#delConfirm').hidden = true; $('#btnDelete').hidden = false; });
    $('#delYes').addEventListener('click', async () => {
      const id = S.current.id; await store.del(id);
      S.songs = S.songs.filter(s => s.id !== id); S.current = null;
      fillEditor(); renderLibrary(); renderPreview(); toast('Song deleted');
      if (S.songs[0]) openSong(S.songs[0].id);
    });
  }
  const normT = t => { let x = ((t % 12) + 12) % 12; if (x > 6) x -= 12; return x; };

  function renderTagChips() {
    const box = $('#tagChips'); box.innerHTML = '';
    const tags = S.current.tags || (S.current.tags = []);
    for (const t of TAGS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t;
      b.setAttribute('aria-pressed', String(tags.includes(t)));
      b.addEventListener('click', () => {
        const i = tags.indexOf(t); if (i >= 0) tags.splice(i, 1); else tags.push(t);
        b.setAttribute('aria-pressed', String(tags.includes(t))); touch(true); renderFilterChips();
      });
      box.appendChild(b);
    }
    $('#f_tagsOther').value = tags.filter(t => !TAGS.includes(t)).join(', ');
  }
  function renderFilterChips() {
    const box = $('#filterChips'); box.innerHTML = '';
    const all = new Set(TAGS); for (const s of S.songs) for (const t of s.tags || []) all.add(t);
    for (const t of all) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip small'; b.textContent = t;
      b.setAttribute('aria-pressed', String(S.tagFilter === t));
      b.addEventListener('click', () => { S.tagFilter = S.tagFilter === t ? null : t; renderFilterChips(); renderLibrary(); });
      box.appendChild(b);
    }
  }

  /* When pasted text carries Capo/Title/etc lines, pull them into fields once. */
  function absorbMeta() {
    const s = S.current; const m = SS.parse(s.raw).meta;
    if (m.title && !s.title) { s.title = m.title; $('#f_title').value = s.title; }
    if (m.artist && !s.artist) { s.artist = m.artist; $('#f_artist').value = s.artist; }
    if (m.capo !== undefined && !s._capoTaken) { s.capo = m.capo; s._capoTaken = true; }
    if (m.tuning && !s.tuning) { s.tuning = m.tuning; $('#f_tuning').value = s.tuning; }
    if (m.bpm && !s.bpm) { s.bpm = m.bpm; $('#f_bpm').value = s.bpm; }
  }

  /* ---------- preview ---------- */
  function renderPreview() {
    const host = $('#pages'); host.innerHTML = '';
    if (!S.current) { $('#pageInfo').textContent = ''; return; }
    let L;
    try { L = SS.layout(S.current, { paper: S.paper, collapse: S.current.collapse, condense: S.current.condense, fontSize: S.current.fontSize }, measure); }
    catch (e) { console.error(e); host.textContent = 'This sheet could not be laid out: ' + e.message; return; }
    S.layout = L;
    L.pages.forEach((ops, i) => {
      const wrap = document.createElement('figure'); wrap.className = 'page';
      wrap.innerHTML = SS.toSVG(ops, measure);
      const cap = document.createElement('figcaption'); cap.textContent = 'Page ' + (i + 1) + ' of ' + L.pages.length;
      wrap.appendChild(cap); host.appendChild(wrap);
    });
    const n = L.pages.length;
    $('#pageInfo').textContent = (n === 1 ? 'Fits on 1 page' : n + ' pages') + ' · lyrics ' + L.size + ' pt';
    $('#pageInfo').dataset.state = n === 1 ? 'ok' : 'warn';
  }

  /* ---------- export ---------- */
  const safeName = s => (s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  const pdfName = s => safeName((s.artist ? s.artist + ' - ' : '') + (s.title || 'Untitled')) + '.pdf';

  function buildPDF(song) {
    const L = SS.layout(song, { paper: S.paper, collapse: song.collapse, condense: song.condense, fontSize: song.fontSize }, measure);
    const info = L.info;
    const doc = SS.toPDF(window.jspdf.jsPDF, FONTS, L.pages, { title: song.title, artist: song.artist, keywords: SS.forScoreKeywords(song, info) });
    return doc.output('blob');
  }

  async function exportCurrent() {
    if (!S.current) return;
    await persistCurrent();
    try { await saveFile(pdfName(S.current), buildPDF(S.current)); }
    catch (e) { console.error(e); toast('PDF export failed: ' + e.message); }
  }

  async function exportAll() {
    if (!S.songs.length) return;
    if (!window.JSZip) { toast('Zip library did not load. Export songs one at a time.'); return; }
    const btn = $('#btnExportAll'); btn.disabled = true;
    try {
      const zip = new window.JSZip(); const used = new Set();
      for (let i = 0; i < S.songs.length; i++) {
        btn.textContent = 'Building ' + (i + 1) + ' / ' + S.songs.length;
        let n = pdfName(S.songs[i]); while (used.has(n)) n = n.replace(/\.pdf$/, ' (2).pdf'); used.add(n);
        zip.file(n, buildPDF(S.songs[i]));
        if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      await saveFile('Stage Sheets PDFs (' + (S.paper === 'dark' ? 'dark' : 'light') + ').zip', blob);
    } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Export all PDFs';
  }

  async function shareSong() {
    if (!S.current) return;
    await persistCurrent();
    const payload = { format: 'stage-sheets', version: 1, songs: [cleanSong(S.current)] };
    await saveFile(safeName(S.current.title || 'Untitled') + '.stagesheet.json', new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }));
  }
  async function backupAll() {
    const payload = { format: 'stage-sheets', version: 1, exported: new Date().toISOString(), songs: S.songs.map(cleanSong) };
    const d = new Date(); const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    await saveFile('Stage Sheets backup ' + stamp + '.json', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  }
  function cleanSong(s) { const c = JSON.parse(JSON.stringify(s)); delete c._capoTaken; delete c.example; return c; }

  /* ---------- import ---------- */
  async function importFiles(files) {
    let added = 0, updated = 0; let lastId = null;
    for (const f of files) {
      const text = await f.text();
      if (/\.json$/i.test(f.name)) {
        let data; try { data = JSON.parse(text); } catch (e) { toast(f.name + ' is not a valid song file.'); continue; }
        const songs = Array.isArray(data) ? data : data.songs || [];
        for (const raw of songs) {
          if (!raw || typeof raw.raw !== 'string') continue;
          const s = Object.assign(blankSong(), raw);
          const ex = S.songs.find(x => x.id === s.id);
          if (ex) { if ((s.updated || 0) >= (ex.updated || 0)) { Object.assign(ex, s); await store.put(ex); updated++; } }
          else { S.songs.push(s); await store.put(s); added++; }
          lastId = s.id;
        }
      } else {
        const s = blankSong(); s.raw = text;
        const base = f.name.replace(/\.[^.]+$/, '');
        const m = /^(.+?)\s+-\s+(.+)$/.exec(base);
        if (m) { s.artist = m[1].trim(); s.title = m[2].trim(); } else s.title = base;
        const meta = SS.parse(text).meta;
        if (meta.title) s.title = meta.title; if (meta.artist) s.artist = meta.artist;
        if (meta.capo !== undefined) { s.capo = meta.capo; s._capoTaken = true; }
        if (meta.tuning) s.tuning = meta.tuning; if (meta.bpm) s.bpm = meta.bpm;
        S.songs.push(s); await store.put(s); added++; lastId = s.id;
      }
    }
    sortSongs(); renderFilterChips(); renderLibrary();
    if (lastId) openSong(lastId);
    toast((added ? added + ' added' : '') + (added && updated ? ', ' : '') + (updated ? updated + ' updated' : '') || 'Nothing imported');
  }

  /* ---------- navigation ---------- */
  function openSong(id) {
    if (S.current && S.dirty) persistCurrent();
    S.current = S.songs.find(s => s.id === id) || null;
    fillEditor(); renderLibrary(); renderPreview();
    prefs.set('last', id);
  }
  async function newSong() {
    const s = blankSong(); S.songs.push(s); await store.put(s); sortSongs();
    openSong(s.id); setView('edit'); setTimeout(() => $('#f_title').focus(), 30);
  }
  function setView(v) {
    S.view = v; document.body.dataset.view = v;
    $$('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  }
  function setPaper(p) {
    S.paper = p; prefs.set('paper', p);
    $$('#paperToggle button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.paper === p)));
    renderPreview();
  }

  /* ---------- boot ---------- */
  async function boot() {
    measure = SS.makeMeasurer(window.jspdf.jsPDF, FONTS);
    await initEnv();
    if (!downloads && window.claude) { $('#envNote').hidden = false; }
    bindEditor();
    $('#q').addEventListener('input', e => { S.query = e.target.value; renderLibrary(); });
    $('#btnNew').addEventListener('click', newSong);
    $('#btnNew2').addEventListener('click', newSong);
    $('#btnExport').addEventListener('click', exportCurrent);
    $('#btnShare').addEventListener('click', shareSong);
    $('#btnExportAll').addEventListener('click', exportAll);
    $('#btnBackup').addEventListener('click', backupAll);
    $('#btnImport').addEventListener('click', () => $('#fileIn').click());
    $('#fileIn').addEventListener('change', e => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) importFiles(fs); });
    $('#btnLib').addEventListener('click', () => document.body.classList.toggle('lib-open'));
    $('#scrim').addEventListener('click', () => document.body.classList.remove('lib-open'));
    $$('.seg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $$('#paperToggle button').forEach(b => b.addEventListener('click', () => setPaper(b.dataset.paper)));
    $('#btnHelp').addEventListener('click', () => { const h = $('#help'); h.hidden = !h.hidden; });
    $('#helpClose').addEventListener('click', () => { $('#help').hidden = true; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) persistCurrent(); });

    S.songs = await store.all();
    // add example songs once per example set (only titles not already present)
    if (prefs.get('seededV', 0) < 2) {
      const fresh = !S.songs.length || !prefs.get('seeded', false);
      for (const ex of window.SS_EXAMPLES || []) {
        if (!fresh && S.songs.some(x => x.title === ex.title)) continue;
        if (!fresh && ex.title !== 'Morning Train') continue;
        const s = Object.assign(blankSong(), ex, { id: uid(), example: true }); S.songs.push(s); await store.put(s);
      }
      prefs.set('seeded', true); prefs.set('seededV', 2);
    }
    sortSongs(); renderFilterChips();
    setPaper(S.paper); setView('edit');
    const last = prefs.get('last', null);
    const first = S.songs.find(s => s.id === last) || S.songs[0];
    if (first) openSong(first.id); else { fillEditor(); renderLibrary(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
