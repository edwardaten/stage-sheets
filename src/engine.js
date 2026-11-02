/* Stage Sheets engine: parsing, music theory, layout, SVG + PDF rendering.
   Pure functions; no DOM except where noted. */
'use strict';

const SS = {};

/* ---------------- Music ---------------- */
const SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const MAJOR_NAMES = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const MINOR_NAMES = ['Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','G#m','Am','Bbm','Bm'];
const FLAT_KEYS = new Set(['F','Bb','Eb','Ab','Db','Gb','Dm','Gm','Cm','Fm','Bbm','Ebm']);

function noteIndex(n) {
  let i = SHARPS.indexOf(n); if (i >= 0) return i;
  i = FLATS.indexOf(n); if (i >= 0) return i;
  const alt = { 'Cb': 11, 'Fb': 4, 'E#': 5, 'B#': 0 }[n];
  return alt === undefined ? -1 : alt;
}

const CHORD_RE = /^(\()?([A-G])([#b]?)((?:maj|min|dim|aug|sus|add|no|m|M|°|ø|\+|-|\d|[#b](?=\d)|\(|\))*)(?:\/([A-G])([#b]?))?(\))?\*?$/;
const AUX_RE = /^(\(?[xX×]\d+\)?|\d+[xX×]|N\.?C\.?|\|+:?|:?\|+|[-–—]+|\/+|\.{2,}|%|\*|\(|\))$/;

function parseChord(tok) {
  const m = CHORD_RE.exec(tok);
  if (!m) return null;
  return { open: m[1] || '', root: m[2] + m[3], rest: m[4] || '', bass: m[5] ? m[5] + (m[6] || '') : '', close: m[7] || '' };
}
function isChord(tok) { return !!parseChord(tok); }
function isMinor(rest) { return /^(m(?!aj)|min|-(?!\d))/.test(rest); }

function shiftNote(n, semis, flats) {
  const i = noteIndex(n); if (i < 0) return n;
  const j = ((i + semis) % 12 + 12) % 12;
  return (flats ? FLATS : SHARPS)[j];
}
function transposeChord(tok, semis, flats) {
  const c = parseChord(tok); if (!c || !semis) return tok;
  return c.open + shiftNote(c.root, semis, flats) + c.rest + (c.bass ? '/' + shiftNote(c.bass, semis, flats) : '') + c.close;
}

/* key name helpers: key = { tonic: 0-11, minor: bool } */
function keyName(k) { return k ? (k.minor ? MINOR_NAMES : MAJOR_NAMES)[((k.tonic % 12) + 12) % 12] : '?'; }
function parseKey(s) {
  if (!s) return null;
  const m = /^\s*([A-Ga-g])([#b♭♯]?)\s*(m|min|minor|maj|major)?\s*$/.exec(s);
  if (!m) return null;
  const n = m[1].toUpperCase() + (m[2] === '♭' ? 'b' : m[2] === '♯' ? '#' : m[2]);
  const t = noteIndex(n); if (t < 0) return null;
  return { tonic: t, minor: !!(m[3] && /^m(in|inor)?$/.test(m[3])) };
}
function shiftKey(k, semis) { return k ? { tonic: ((k.tonic + semis) % 12 + 12) % 12, minor: k.minor } : null; }
function prefersFlats(k) { return !!k && FLAT_KEYS.has(keyName(k)); }

function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let chords = 0;
  for (const t of toks) {
    if (isChord(t)) chords++;
    else if (!AUX_RE.test(t)) return false;
  }
  return chords > 0;
}

function transposeLine(line, semis, flats) {
  if (!semis) return line;
  let out = '';
  line.replace(/\S+/g, (tok, idx) => {
    const t = isChord(tok) ? transposeChord(tok, semis, flats) : tok;
    const pos = out.length === 0 ? idx : Math.max(idx, out.length + 1);
    out = out.padEnd(pos, ' ') + t;
    return tok;
  });
  return out;
}

/* ---------------- Parsing ---------------- */
function sectionKind(name) {
  const n = name.toLowerCase();
  if (/key\s*change|modulat/.test(n)) return 'callout';
  if (/pre[\s-]?chorus|^pre\b|build/.test(n)) return 'pre';
  if (/post[\s-]?chorus/.test(n)) return 'refrain';
  if (/chorus|hook/.test(n)) return 'chorus';
  if (/refrain/.test(n)) return 'refrain';
  if (/verse/.test(n)) return 'verse';
  if (/bridge|middle\s*8/.test(n)) return 'bridge';
  if (/intro/.test(n)) return 'intro';
  if (/outro|coda|ending|^end\b/.test(n)) return 'outro';
  if (/solo|instrumental|interlude|break|riff|inst\b/.test(n)) return 'inst';
  return 'other';
}
function shortLabel(name) {
  let n = name.replace(/\s*\d+\s*$/, '').trim();
  if (/^pre[\s-]?chorus$/i.test(n)) n = 'Pre';
  if (/^post[\s-]?chorus$/i.test(n)) n = 'Post';
  if (/^instrumental$/i.test(n)) n = 'Inst';
  return n || 'Song';
}

const META_RES = [
  ['title', /^\s*title\s*:\s*(.+)$/i],
  ['artist', /^\s*artist\s*:\s*(.+)$/i],
  ['capo', /^\s*capo\s*:?\s*(?:on\s*)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*fret)?\s*$/i],
  ['capoNone', /^\s*capo\s*:?\s*(no\s*capo|none|0)\s*$/i],
  ['key', /^\s*key\s*:\s*([A-G][#b♭♯]?\s*(?:m|min|minor|maj|major)?)\s*$/i],
  ['tuning', /^\s*tuning\s*:\s*(.+)$/i],
  ['bpm', /^\s*(?:bpm|tempo)\s*:\s*(\d{2,3})/i],
  ['time', /^\s*time(?:\s*sig(?:nature)?)?\s*:\s*(\d+\/\d+)\s*$/i],
  ['strum', /^\s*strum(?:ming)?(?:\s*pattern)?\s*:\s*(.+)$/i],
  ['shape', /^\s*shape\s*:\s*(.+)$/i],
];

/* Parse raw UG-style text. Returns { meta, sections }.
   sections: [{ name, kind, lines: [ {type:'pair'|'chords'|'lyric'|'callout'|'blank', chords?, text?} ] }] */
function parse(raw) {
  const meta = {};
  const src = (raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\[\/?(ch|tab)\]/gi, '')
    .replace(/\t/g, '    ')
    .replace(/[   ]/g, ' ')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''));

  const sections = [];
  let cur = { name: '', kind: 'other', rawLines: [] };
  const push = () => { if (cur.name || cur.rawLines.some(l => l.trim())) sections.push(cur); };

  for (const line of src) {
    let matched = false;
    for (const [k, re] of META_RES) {
      const m = re.exec(line);
      if (m) {
        if (k === 'capoNone') meta.capo = 0;
        else if (k === 'shape') (meta.shapes = meta.shapes || []).push(m[1].trim());
        else meta[k] = k === 'capo' ? parseInt(m[1], 10) : m[1].trim();
        matched = true; break;
      }
    }
    if (matched) continue;
    const h = /^\s*\[([^\]]{1,40})\]\s*(.*)$/.exec(line);
    if (h) {
      push();
      cur = { name: h[1].trim(), kind: sectionKind(h[1]), rawLines: [] };
      if (h[2].trim()) cur.rawLines.push(h[2]);
      continue;
    }
    cur.rawLines.push(line);
  }
  push();

  for (const s of sections) {
    const L = s.rawLines;
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const line = L[i];
      if (!line.trim()) { if (out.length && out[out.length - 1].type !== 'blank') out.push({ type: 'blank' }); continue; }
      if (/^\s*!/.test(line)) { out.push({ type: 'callout', text: line.replace(/^\s*!\s*/, '') }); continue; }
      if (isChordLine(line)) {
        const nx = L[i + 1];
        if (nx !== undefined && nx.trim() && !isChordLine(nx) && !/^\s*!/.test(nx) && !/^\s*\[[^\]]+\]/.test(nx)) {
          out.push({ type: 'pair', chords: line, text: nx }); i++;
        } else {
          out.push({ type: 'chords', chords: line });
        }
        continue;
      }
      out.push({ type: 'lyric', text: line });
    }
    while (out.length && out[out.length - 1].type === 'blank') out.pop();
    while (out.length && out[0].type === 'blank') out.shift();
    s.lines = out;
    delete s.rawLines;
  }
  return { meta, sections };
}

function sectionChords(sec) {
  const seq = [];
  for (const l of sec.lines) {
    if (!l.chords) continue;
    for (const t of l.chords.trim().split(/\s+/)) {
      const c = parseChord(t);
      if (c) seq.push(c.root + c.rest + (c.bass ? '/' + c.bass : ''));
    }
  }
  return seq;
}

function detectKey(parsed) {
  const all = []; const firstOf = []; let last = null;
  for (const s of parsed.sections) {
    const seq = sectionChords(s).map(parseChord).filter(Boolean);
    if (!seq.length) continue;
    all.push(...seq);
    if (s.kind === 'chorus') firstOf.unshift(seq[0]); else if (s.kind === 'verse') firstOf.push(seq[0]);
    last = seq[seq.length - 1];
  }
  if (!all.length) return null;
  const first = firstOf[0] || all[0];
  const DIA = { 0: 'M', 2: 'm', 4: 'm', 5: 'M', 7: 'M', 9: 'm', 11: 'd' };
  let best = null;
  for (let t = 0; t < 12; t++) {
    let sc = 0;
    for (const c of all) {
      const d = ((noteIndex(c.root) - t) % 12 + 12) % 12;
      const q = /dim|°/.test(c.rest) ? 'd' : isMinor(c.rest) ? 'm' : 'M';
      if (DIA[d] === q) sc += 1; else if (DIA[d]) sc += 0.3; else sc -= 0.4;
      if (d === 0 && q === 'M') sc += 0.35;
    }
    const ri = c => ((noteIndex(c.root) - t) % 12 + 12) % 12;
    if (ri(first) === 0) sc += 1.5; if (last && ri(last) === 0) sc += 1;
    if (!best || sc > best.sc) best = { sc, t };
  }
  const t = best.t; const rel = (t + 9) % 12;
  const ev = (c, tonic, minor) => c && noteIndex(c.root) === tonic && isMinor(c.rest) === minor ? 1 : 0;
  const minorEv = ev(first, rel, true) + ev(last, rel, true);
  const majorEv = ev(first, t, false) + ev(last, t, false);
  return minorEv > majorEv ? { tonic: rel, minor: true } : { tonic: t, minor: false };
}

function compressLoop(seq) {
  const d = [];
  for (const c of seq) if (d[d.length - 1] !== c) d.push(c);
  for (let p = 1; p <= d.length; p++) {
    let ok = true;
    for (let i = p; i < d.length; i++) if (d[i] !== d[i % p]) { ok = false; break; }
    if (ok) {
      // a loop whose start repeats at the seam (G..G) would be shown twice
      const loop = d.slice(0, p);
      return loop;
    }
  }
  return d;
}

/* Chord summary rows: [{labels:[{text,kind}], chords:[...]}] */
function chordSummary(parsed) {
  const byBase = new Map();
  for (const s of parsed.sections) {
    if (s.kind === 'callout') continue;
    const seq = sectionChords(s); if (!seq.length) continue;
    const label = shortLabel(s.name || 'Song');
    if (!byBase.has(label)) byBase.set(label, { label, kind: s.kind, prog: compressLoop(seq) });
  }
  const rows = [];
  for (const b of byBase.values()) {
    const key = b.prog.join(' ');
    const r = rows.find(x => x.key === key);
    if (r) r.labels.push({ text: b.label, kind: b.kind });
    else rows.push({ key, chords: b.prog.slice(0, 12), more: b.prog.length > 12, labels: [{ text: b.label, kind: b.kind }] });
  }
  if (rows.length === 1) rows[0].labels = [{ text: 'Whole song', kind: 'other' }];
  return rows;
}

/* Apply transpose to a parsed song (returns new parsed). */
function transposeParsed(parsed, semis, flats) {
  if (!semis) return parsed;
  return {
    meta: parsed.meta,
    sections: parsed.sections.map(s => ({
      ...s,
      lines: s.lines.map(l => l.chords ? { ...l, chords: transposeLine(l.chords, semis, flats) } : l),
    })),
  };
}

/* Derived musical info for a song record. */
function songInfo(song) {
  const parsed = parse(song.raw);
  const written = parseKey(song.shapeKey) || (parsed.meta.key && parseKey(parsed.meta.key)) || detectKey(parsed);
  const transpose = song.transpose || 0;
  const capo = song.capo || 0;
  const play = shiftKey(written, transpose);
  const sounds = shiftKey(play, capo);
  const flats = play ? prefersFlats(play) : false;
  const shown = transposeParsed(parsed, transpose, flats);
  return { parsed: shown, written, play, sounds, capo, transpose, detected: detectKey(parsed), meta: parsed.meta };
}

/* ---------------- Chord shapes ---------------- */
/* "Cadd9 x32033", "Cadd9 = x 3 2 0 3 3", "Bm7 x-2-4-2-3-2", "D/F# 200232" -> {name, frets:[-1|n x6]} */
function parseShape(line) {
  const m = /^\s*(\S+)\s*[=:]?\s*(.+?)\s*$/.exec(line || '');
  if (!m) return null;
  let spec = m[2].trim().toLowerCase();
  let parts;
  if (/[\s,-]/.test(spec)) parts = spec.split(/[\s,-]+/).filter(Boolean);
  else parts = spec.split('');
  if (parts.length !== 6) return null;
  const frets = parts.map(p => (p === 'x' ? -1 : /^\d{1,2}$/.test(p) ? parseInt(p, 10) : NaN));
  if (frets.some(f => Number.isNaN(f) || f > 24)) return null;
  return { name: m[1], frets };
}
function songShapes(song, meta, transpose, flats) {
  const lines = String(song.shapes || '').split('\n').concat(meta.shapes || []);
  const out = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    const sh = parseShape(l); if (!sh) continue;
    if (transpose) {
      const f2 = sh.frets.map(f => (f < 0 ? f : f + transpose));
      if (f2.some(f => f > 24) || f2.some(f => f !== -1 && f < 0)) continue;
      out.push({ name: isChord(sh.name) ? transposeChord(sh.name, transpose, flats) : sh.name, frets: f2 });
    } else out.push(sh);
  }
  return out;
}
const DIAG = { w: 44, h: 64 };
function shapeOps(sh, x, y, theme, measure) {
  const ops = [];
  const sx = 6.6, fy = 9, nFrets = 4, gx = x + (DIAG.w - sx * 5) / 2 + 3, gy = y + 20;
  const pos = sh.frets.filter(f => f > 0);
  const max = pos.length ? Math.max(...pos) : 0, min = pos.length ? Math.min(...pos) : 0;
  const base = max <= nFrets ? 1 : min;
  const nw = measure(sh.name, 'CondBold', 11);
  ops.push({ t: 'text', x: x + DIAG.w / 2 - nw / 2 + 3, y: y + 9, str: sh.name, font: 'CondBold', size: 11, color: theme.chord });
  for (let i = 0; i <= nFrets; i++) ops.push({ t: 'rect', x: gx, y: gy + i * fy - (i === 0 && base === 1 ? 1.2 : 0.35), w: sx * 5, h: i === 0 && base === 1 ? 2.4 : 0.7, r: 0, fill: theme.ink });
  for (let j = 0; j < 6; j++) ops.push({ t: 'rect', x: gx + j * sx - 0.35, y: gy, w: 0.7, h: fy * nFrets, r: 0, fill: theme.ink });
  if (base > 1) ops.push({ t: 'text', x: gx - 3 - measure(base + 'fr', 'CondMed', 7), y: gy + fy * 0.75, str: base + 'fr', font: 'CondMed', size: 7, color: theme.muted });
  sh.frets.forEach((f, j) => {
    const cx = gx + j * sx;
    if (f < 0) ops.push({ t: 'text', x: cx - 2, y: gy - 2.5, str: 'x', font: 'CondMed', size: 7, color: theme.muted });
    else if (f === 0) ops.push({ t: 'circle', x: cx, y: gy - 4.5, r: 1.8, stroke: theme.ink });
    else { const row = f - base; if (row >= 0 && row < nFrets) ops.push({ t: 'circle', x: cx, y: gy + (row + 0.5) * fy, r: 2.6, fill: theme.chord }); }
  });
  return ops;
}

/* ---------------- forScore metadata ---------------- */
const KEYSF_MAJOR = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };
function forScoreKeywords(song, info) {
  const kw = (song.tags || []).map(t => t.replace(/,/g, ' ').trim()).filter(Boolean);
  if (info.sounds) {
    const relMajor = info.sounds.minor ? (info.sounds.tonic + 3) % 12 : info.sounds.tonic;
    kw.push('keysf:' + KEYSF_MAJOR[relMajor], 'keymi:' + (info.sounds.minor ? 1 : 0));
  }
  return kw.join(', ');
}

/* ---------------- Theme ---------------- */
const PAPER = {
  light: {
    bg: '#FFFFFF', ink: '#14161B', muted: '#6A717D', faint: '#D9DDE3', chord: '#1A4FD6', aux: '#8A919C',
    chorusTint: '#FFF3E8', capoFill: '#F4B400', capoInk: '#1D1702', keyFill: '#14161B', keyInk: '#FFFFFF',
    noteTint: '#FFF8E0', noteBar: '#E0A100', noteLabel: '#8A6200', boxBg: '#F6F7F9', callout: '#D92D20', calloutInk: '#FFFFFF',
    kind: { verse: '#4B5B76', pre: '#7A3FD1', chorus: '#E25A0E', refrain: '#0E8C80', bridge: '#2E8A3A', intro: '#6A717D', outro: '#6A717D', inst: '#6A717D', other: '#8C6D1F', callout: '#D92D20' },
    labelInk: '#FFFFFF',
  },
  dark: {
    bg: '#101214', ink: '#ECEEF1', muted: '#9AA2AE', faint: '#2B3036', chord: '#7FB0FF', aux: '#7D8590',
    chorusTint: '#24190F', capoFill: '#F4B400', capoInk: '#1D1702', keyFill: '#ECEEF1', keyInk: '#101214',
    noteTint: '#221D0C', noteBar: '#E0A100', noteLabel: '#F0C64A', boxBg: '#191C20', callout: '#F04438', calloutInk: '#FFFFFF',
    kind: { verse: '#8FA3C4', pre: '#B48CF2', chorus: '#FF8A3D', refrain: '#3CC9B8', bridge: '#62C26F', intro: '#9AA2AE', outro: '#9AA2AE', inst: '#9AA2AE', other: '#D6B25A', callout: '#F04438' },
    labelInk: '#101214',
  },
};

/* ---------------- Layout ---------------- */
const PAGE = { W: 540, H: 720, M: 30, TOP: 28, FOOT: 22 };
const CW = 0.6; // mono advance per pt

/* measure(text, font, size) must be provided (jsPDF-backed). */
function splitPair(ch, ly, maxC) {
  const out = [];
  let first = true;
  while (Math.max(ch.length, ly.length) > maxC) {
    let b = -1;
    for (let k = maxC; k >= Math.floor(maxC * 0.45); k--) {
      const lyOk = k >= ly.length || ly[k] === ' ';
      const chOk = !(ch[k - 1] && ch[k - 1] !== ' ' && ch[k] && ch[k] !== ' ');
      if (lyOk && chOk) { b = k; break; }
    }
    if (b < 0) b = maxC;
    out.push({ chords: ch.slice(0, b).replace(/\s+$/, ''), text: ly.slice(0, b).replace(/\s+$/, ''), cont: !first });
    first = false;
    ch = ch.slice(b); ly = ly.slice(b);
    if (ly[0] === ' ' && (ch[0] === ' ' || !ch.length)) { ly = ly.slice(1); ch = ch.slice(1); }
    ch = '  ' + ch; ly = '  ' + ly;
  }
  out.push({ chords: ch, text: ly, cont: !first });
  return out;
}
function wrapPlain(text, maxC) {
  const out = []; let t = text;
  while (t.length > maxC) {
    let b = t.lastIndexOf(' ', maxC); if (b < maxC * 0.45) b = maxC;
    out.push(t.slice(0, b).replace(/\s+$/, '')); t = '  ' + t.slice(b).replace(/^\s/, '');
  }
  out.push(t); return out;
}
function respaceChords(line) {
  const toks = line.trim().split(/\s+/);
  let out = '';
  toks.forEach((t, i) => { out += (i ? (repeatCount(t) ? '  ' : '   ') : '') + t; });
  return out;
}

/* Exact repeating period of a token list, e.g. [Am F C G Am F C G] -> {loop:[Am F C G], times:2} */
function exactLoop(toks) {
  for (let p = 1; p <= toks.length; p++) {
    if (toks.length % p) continue;
    let ok = true;
    for (let i = p; i < toks.length; i++) if (toks[i] !== toks[i - p]) { ok = false; break; }
    if (ok) return { loop: toks.slice(0, p), times: toks.length / p };
  }
  return { loop: toks, times: 1 };
}
function repeatCount(tok) {
  const m = /^\(?[xX×](\d+)\)?$|^\(?(\d+)[xX×]\)?$/.exec(tok);
  return m ? parseInt(m[1] || m[2], 10) : 0;
}
/* Collapse chord-only lines: "Am F C G Am F C G" -> "Am F C G ×2", and identical lines in a row add up. */
function condenseChordLines(lines) {
  const out = [];
  for (const l of lines) {
    if (l.type !== 'chords') { out.push(l); continue; }
    const toks = l.chords.trim().split(/\s+/);
    const chords = toks.filter(isChord);
    let mult = 1; for (const t of toks) { const n = repeatCount(t); if (n) mult = n; }
    const { loop, times } = exactLoop(chords);
    const key = loop.join(' ');
    const prev = out[out.length - 1];
    if (prev && prev.type === 'chords' && prev.loopKey === key) { prev.times += times * mult; continue; }
    out.push({ type: 'chords', loopKey: key, times: times * mult });
  }
  for (const l of out) if (l.loopKey !== undefined) l.chords = l.loopKey + (l.times > 1 ? ' ×' + l.times : '');
  return out;
}
/* Does the whole section run on one short chord loop? */
function sectionLoop(sec) {
  if (!sec.lines.some(l => l.type === 'pair')) return null;
  const seq = sectionChords(sec);
  if (seq.length < 2) return null;
  const d = []; for (const c of seq) if (d[d.length - 1] !== c) d.push(c);
  const loop = compressLoop(d);
  const distinct = new Set(d).size;
  if (loop.length <= 6 && (d.length >= loop.length * 2 || distinct <= 2)) {
    return { loop, times: Math.max(1, Math.round(d.length / loop.length)) };
  }
  return null;
}
function chordSig(sec) { return shortLabel(sec.name) + '|' + sec.lines.filter(l => l.chords).map(l => l.chords.trim()).join('/'); }

/* Build visual rows for a section at size s. mode: full | loop | lyrics | collapsed */
function sectionRows(sec, s, maxC, mode, loopInfo) {
  const rows = [];
  const R = {
    head: s * 1.4, chord: s * 1.05, lyric: s * 1.27, chordsOnly: s * 1.38, blank: s * 0.42, callout: s * 1.85,
  };
  if (sec.kind === 'callout' && !sec.lines.length) {
    rows.push({ t: 'callout', text: sec.name, h: R.callout });
    return { rows, R };
  }
  const head = { t: 'head', h: R.head };
  if (mode === 'loop' && loopInfo) { head.loop = loopInfo.loop.join('  '); head.times = loopInfo.times; }
  if (mode === 'lyrics') head.note = 'chords as above';
  if (mode === 'collapsed') head.note = 'same as before';
  rows.push(head);
  if (mode === 'collapsed') return { rows, R };
  const lines = condenseChordLines(sec.lines);
  if (mode === 'loop' || mode === 'lyrics') {
    for (const l of lines) {
      if (l.type === 'blank') rows.push({ t: 'blank', h: R.blank });
      else if (l.type === 'callout') rows.push({ t: 'callout', text: l.text, h: R.callout });
      else if (l.type === 'chords') { if (mode === 'lyrics') rows.push({ t: 'chords', chords: respaceChords(l.chords), h: R.chordsOnly }); }
      else for (const w of wrapPlain(l.text.replace(/^\s+/, ''), maxC)) rows.push({ t: 'lyric', text: w, h: R.lyric });
    }
    return { rows, R };
  }
  // single chord at the very start of a line: put it in a left gutter beside the lyric (saves a row)
  const isInline = l => l.type === 'pair' && /^\S+$/.test(l.chords) && isChord(l.chords);
  let gutter = 0;
  for (const l of lines) if (isInline(l)) gutter = Math.max(gutter, l.chords.length + 2);
  if (gutter) gutter = Math.max(gutter, 4);
  for (const l of lines) {
    if (isInline(l)) {
      const txt = l.text.replace(/^\s+/, '');
      wrapPlain(txt, maxC - gutter).forEach((w, i) => rows.push({ t: 'inline', chord: i ? '' : l.chords, text: w, gutter, h: R.lyric * 1.06 }));
    } else if (l.type === 'blank') rows.push({ t: 'blank', h: R.blank });
    else if (l.type === 'callout') rows.push({ t: 'callout', text: l.text, h: R.callout });
    else if (l.type === 'pair') {
      for (const p of splitPair(l.chords, l.text, maxC)) rows.push({ t: 'pair', chords: p.chords, text: p.text, h: R.chord + R.lyric });
    } else if (l.type === 'chords') {
      for (const w of wrapPlain(respaceChords(l.chords), maxC)) rows.push({ t: 'chords', chords: w, h: R.chordsOnly });
    } else {
      for (const w of wrapPlain(l.text, maxC)) rows.push({ t: 'lyric', text: w, h: R.lyric });
    }
  }
  return { rows, R };
}

function wrapWords(text, maxW, font, size, measure) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (measure(t, font, size) <= maxW || !line) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

/* Rich runs: split key names so accidentals use the symbol font */
function keyRuns(name, font, size, color) {
  if (!name) return [{ text: '?', font, size, color }];
  const m = /^([A-G])([#b]?)(.*)$/.exec(name);
  if (!m) return [{ text: name, font, size, color }];
  const runs = [{ text: m[1], font, size, color }];
  if (m[2]) runs.push({ text: m[2] === 'b' ? '♭' : '♯', font: 'Sym', size: size * 0.88, color, dy: 0 });
  if (m[3]) runs.push({ text: m[3], font, size, color });
  return runs;
}
function runsWidth(runs, measure) { return runs.reduce((a, r) => a + measure(r.text, r.font, r.size), 0); }

/* Main layout. Returns { pages: [ops[]], size, theme } */
function layout(song, opts, measure) {
  const theme = PAPER[opts.paper === 'dark' ? 'dark' : 'light'];
  const info = songInfo(song);
  const { W, H, M, TOP, FOOT } = PAGE;
  const title = song.title || 'Untitled';
  const artist = song.artist || '';
  const parsed = info.parsed;

  // ----- header (page 1) -----
  const summary = chordSummary(parsed);
  const head = [];
  const boxW = summary.length ? 196 : 0;
  const leftW = W - 2 * M - (boxW ? boxW + 16 : 0);
  let y = TOP;

  // title
  let tSize = 30, tLines = [title];
  for (let sz = 30; sz >= 17; sz -= 1) {
    tSize = sz; tLines = wrapWords(title, leftW, 'CondBold', sz, measure);
    if (tLines.length === 1 || (tLines.length === 2 && sz <= 24)) break;
  }
  tLines = tLines.slice(0, 2);
  for (const tl of tLines) { y += tSize * 0.95; head.push({ t: 'text', x: M, y, str: tl, font: 'CondBold', size: tSize, color: theme.ink }); y += tSize * 0.12; }
  if (artist) { y += 15; head.push({ t: 'text', x: M, y, str: artist, font: 'CondMed', size: 14, color: theme.muted }); }
  y += 12;

  // pills
  const pills = [];
  const soundsName = info.sounds ? keyName(info.sounds) : '';
  const playName = info.play ? keyName(info.play) : '';
  pills.push({ fill: theme.keyFill, runs: [{ text: 'KEY  ', font: 'CondMed', size: 10, color: theme.keyInk }, ...keyRuns(soundsName || '?', 'CondBold', 13, theme.keyInk)] });
  if (info.capo > 0) {
    pills.push({ fill: theme.capoFill, runs: [{ text: 'CAPO ' + info.capo, font: 'CondBold', size: 13, color: theme.capoInk }, { text: '   PLAY  ', font: 'CondMed', size: 10, color: theme.capoInk }, ...keyRuns(playName || '?', 'CondBold', 13, theme.capoInk), { text: ' shapes', font: 'CondMed', size: 10, color: theme.capoInk }] });
  } else {
    pills.push({ stroke: theme.faint, runs: [{ text: 'NO CAPO', font: 'CondBold', size: 11, color: theme.muted }] });
  }
  if (song.bpm) pills.push({ stroke: theme.faint, runs: [{ text: String(song.bpm), font: 'CondBold', size: 12, color: theme.ink }, { text: ' BPM', font: 'CondMed', size: 10, color: theme.muted }] });
  if (song.tuning && !/^\s*(standard|e\s*a\s*d\s*g\s*b\s*e)\s*$/i.test(song.tuning)) pills.push({ stroke: theme.callout, runs: [{ text: 'TUNING  ', font: 'CondMed', size: 10, color: theme.callout }, { text: song.tuning, font: 'CondBold', size: 12, color: theme.callout }] });
  const PH = 22, PP = 8;
  let px = M, py = y;
  for (const p of pills) {
    const w = runsWidth(p.runs, measure) + PP * 2;
    if (px + w > M + leftW && px > M) { px = M; py += PH + 6; }
    head.push({ t: 'rect', x: px, y: py, w, h: PH, r: 4, fill: p.fill, stroke: p.stroke });
    head.push({ t: 'runs', x: px + PP, y: py + PH * 0.68, runs: p.runs });
    px += w + 6;
  }
  y = py + PH;
  const shapes = songShapes(song, info.meta, info.transpose, info.play ? prefersFlats(info.play) : false);
  if (shapes.length) {
    y += 8;
    let sx0 = M;
    for (const sh of shapes) {
      if (sx0 + DIAG.w > M + leftW) { sx0 = M; y += DIAG.h + 4; }
      head.push(...shapeOps(sh, sx0, y, theme, measure)); sx0 += DIAG.w + 6;
    }
    y += DIAG.h - 6;
  }
  let leftBottom = y;

  // chord summary box
  let boxBottom = TOP;
  if (boxW) {
    const bx = W - M - boxW, by = TOP + 2, pad = 9;
    const ops = []; let yy = by + pad + 7;
    ops.push({ t: 'text', x: bx + pad, y: yy, str: 'CHORDS', font: 'CondBold', size: 8, color: theme.muted, spacing: 1 });
    yy += 4;
    const cs = summary.length > 6 ? 10.5 : 12;
    const maxCh = Math.floor((boxW - 2 * pad) / (cs * CW));
    for (const r of summary) {
      yy += 12;
      let lx = bx + pad;
      r.labels.forEach((lb, i) => {
        const txt = lb.text.toUpperCase() + (i < r.labels.length - 1 ? ' · ' : '');
        ops.push({ t: 'text', x: lx, y: yy, str: txt, font: 'CondBold', size: 8.5, color: theme.kind[lb.kind] || theme.muted });
        lx += measure(txt, 'CondBold', 8.5);
      });
      const chordStr = r.chords.join('  ') + (r.more ? '  …' : '');
      for (const w of wrapPlain(chordStr, maxCh)) { yy += cs * 1.18; ops.push({ t: 'text', x: bx + pad, y: yy, str: w.trim(), font: 'MonoSemi', size: cs, color: theme.chord }); }
      yy += 3;
    }
    const bh = yy - by + pad - 2;
    head.push({ t: 'rect', x: bx, y: by, w: boxW, h: bh, r: 6, fill: theme.boxBg, stroke: theme.faint });
    head.push(...ops);
    boxBottom = by + bh;
  }
  y = Math.max(leftBottom, boxBottom) + 12;

  // my changes
  if (song.notes && song.notes.trim()) {
    const nw = W - 2 * M, pad = 9;
    const lines = wrapWords(song.notes.trim(), nw - pad * 2 - 4, 'CondMed', 11.5, measure).slice(0, 8);
    const nh = pad + 10 + lines.length * 14.5 + pad - 3;
    head.push({ t: 'rect', x: M, y, w: nw, h: nh, r: 5, fill: theme.noteTint });
    head.push({ t: 'rect', x: M, y, w: 3.5, h: nh, r: 0, fill: theme.noteBar });
    let ny = y + pad + 7;
    head.push({ t: 'text', x: M + pad + 4, y: ny, str: 'MY CHANGES', font: 'CondBold', size: 8, color: theme.noteLabel, spacing: 1 });
    for (const l of lines) { ny += 14.5; head.push({ t: 'text', x: M + pad + 4, y: ny, str: l, font: 'CondMed', size: 11.5, color: theme.ink }); }
    y += nh + 10;
  }
  head.push({ t: 'rect', x: M, y, w: W - 2 * M, h: 0.8, r: 0, fill: theme.faint });
  const headerBottom = y + 6;

  // ----- body sizing -----
  const bodyX = M + 12, bodyW = W - M - bodyX - 2;
  const firstAvail = H - FOOT - 10 - headerBottom;
  const miniH = 34;
  const otherAvail = H - FOOT - 10 - (TOP + miniH);

  // collapse identical repeats if asked; find sections that run on one chord loop
  const seen = new Map();
  const condense = opts.condense !== false;
  const secs = parsed.sections.map(s => {
    const sig = shortLabel(s.name) + '|' + JSON.stringify(s.lines);
    const rep = seen.has(sig); seen.set(sig, true);
    return { sec: s, collapsed: !!opts.collapse && rep && s.lines.length > 0, loop: condense ? sectionLoop(s) : null, csig: chordSig(s) };
  });

  let maxLen = 0;
  for (const { sec } of secs) for (const l of sec.lines) maxLen = Math.max(maxLen, (l.chords || '').length, (l.text || '').length);
  const noWrap = maxLen ? bodyW / (CW * maxLen) : 99;

  function paginate(s) {
    const maxC = Math.floor(bodyW / (CW * s));
    const gap = s * 0.62;
    const mk = (x, pageSeen) => {
      let mode = 'full';
      if (x.collapsed) mode = 'collapsed';
      else if (x.loop) mode = 'loop';
      else if (condense && pageSeen.has(x.csig) && x.sec.lines.some(l => l.type === 'pair')) mode = 'lyrics';
      const { rows } = sectionRows(x.sec, s, maxC, mode, x.loop);
      return { sec: x.sec, collapsed: x.collapsed, mode, rows, csig: x.csig, h: rows.reduce((a, r) => a + r.h, 0) + s * 0.3 };
    };
    const pages = [[]]; let used = 0; let avail = firstAvail; let seenOnPage = new Set();
    const newPage = () => { pages.push([]); avail = otherAvail; used = 0; seenOnPage = new Set(); };
    for (const x of secs) {
      let b = mk(x, seenOnPage);
      const cur = pages[pages.length - 1];
      const need = (cur.length ? gap : 0) + b.h;
      if (used + need <= avail) { cur.push(b); used += need; if (b.mode === 'full') seenOnPage.add(b.csig); continue; }
      if (cur.length) { newPage(); b = mk(x, seenOnPage); }
      if (b.h > avail) {
        // only a section taller than a whole page is split
        let part = { ...b, rows: [], h: s * 0.3 };
        for (const r of b.rows) {
          if (part.h + r.h > avail && part.rows.length > 1) {
            pages[pages.length - 1].push(part); newPage();
            part = { ...b, rows: [{ ...b.rows[0], cont: true }], h: b.rows[0].h + s * 0.3, cont: true };
          }
          part.rows.push(r); part.h += r.h;
        }
        pages[pages.length - 1].push(part); used = part.h; continue;
      }
      pages[pages.length - 1].push(b); used += b.h; if (b.mode === 'full') seenOnPage.add(b.csig);
    }
    return { pages, maxC };
  }

  let size, result;
  if (opts.fontSize && opts.fontSize !== 'auto') {
    size = +opts.fontSize; result = paginate(size);
  } else {
    // One page if it fits at 11pt or larger; otherwise never below 11.5pt.
    const cap = Math.min(15, Math.max(noWrap, 12.5));
    const sizes = []; for (let s = Math.floor(cap * 2) / 2; s >= 11; s -= 0.5) sizes.push(s);
    for (const s of sizes) { const r = paginate(s); if (r.pages.length === 1) { size = s; result = r; break; } }
    if (!result) {
      const big = sizes.filter(s => s >= 11.5);
      const minPages = paginate(11.5).pages.length;
      for (const s of big) { const r = paginate(s); if (r.pages.length <= minPages) { size = s; result = r; break; } }
    }
  }
  const s = size;

  // ----- render pages -----
  const nPages = result.pages.length;
  const out = [];
  result.pages.forEach((blocks, pi) => {
    const ops = [{ t: 'rect', x: 0, y: 0, w: W, h: H, r: 0, fill: theme.bg }];
    let yy;
    if (pi === 0) { ops.push(...head); yy = headerBottom; }
    else {
      const my = TOP + 16;
      ops.push({ t: 'text', x: M, y: my, str: title, font: 'CondBold', size: 17, color: theme.ink });
      const tw = measure(title, 'CondBold', 17);
      if (artist) ops.push({ t: 'text', x: M + tw + 8, y: my, str: artist, font: 'CondMed', size: 11, color: theme.muted });
      const runs = [{ text: 'KEY ', font: 'CondMed', size: 9, color: theme.muted }, ...keyRuns(soundsName, 'CondBold', 11, theme.ink)];
      if (info.capo > 0) runs.push({ text: '   CAPO ' + info.capo + '   PLAY ', font: 'CondBold', size: 10, color: theme.muted }, ...keyRuns(playName, 'CondBold', 11, theme.ink));
      ops.push({ t: 'runs', x: W - M - runsWidth(runs, measure), y: my, runs });
      ops.push({ t: 'rect', x: M, y: my + 9, w: W - 2 * M, h: 0.8, r: 0, fill: theme.faint });
      yy = TOP + miniH;
    }
    blocks.forEach((b, bi) => {
      if (bi > 0 || pi > 0) yy += s * 0.62;
      const sec = b.sec; const col = theme.kind[sec.kind] || theme.muted;
      const bodyTop = yy + (b.rows[0] && b.rows[0].t === 'head' ? b.rows[0].h : 0) - s * 0.35;
      const bodyBottom = yy + b.h - s * 0.3;
      if (sec.kind === 'chorus' && !b.collapsed) ops.push({ t: 'rect', x: M - 2, y: bodyTop - s * 0.1, w: W - 2 * M + 4, h: bodyBottom - bodyTop + s * 0.35, r: 4, fill: theme.chorusTint });
      if (!b.collapsed && b.rows.length > 1) ops.push({ t: 'rect', x: M, y: bodyTop, w: 3, h: bodyBottom - bodyTop, r: 1.5, fill: col });
      for (const r of b.rows) {
        if (r.t === 'head') {
          const label = (sec.name || 'Song').toUpperCase() + (r.cont ? ' (cont.)' : '');
          const ls = s * 0.74;
          const lw = measure(label, 'CondBold', ls) + 12;
          const ph = s * 1.12, pyy = yy + (r.h - ph) / 2 - s * 0.12;
          ops.push({ t: 'rect', x: M, y: pyy, w: lw, h: ph, r: 3, fill: col });
          ops.push({ t: 'text', x: M + 6, y: pyy + ph * 0.72, str: label, font: 'CondBold', size: ls, color: theme.labelInk, spacing: 0.4 });
          const by2 = pyy + ph * 0.74;
          if (r.loop) {
            ops.push({ t: 'text', x: M + lw + 10, y: by2, str: r.loop, font: 'MonoBold', size: s, color: theme.chord });
            if (r.times > 1) ops.push({ t: 'text', x: M + lw + 10 + (r.loop.length + 2) * CW * s, y: by2, str: '×' + r.times, font: 'Mono', size: s, color: theme.aux });
          } else if (r.note) ops.push({ t: 'text', x: M + lw + 8, y: by2, str: r.note, font: 'CondMed', size: ls, color: theme.muted });
        } else if (r.t === 'pair') {
          const cy = yy + r.h * 0.40; const ly = yy + r.h * 0.86;
          pushChordRow(ops, r.chords, bodyX, cy, s, theme);
          if (r.text.trim()) ops.push({ t: 'text', x: bodyX, y: ly, str: r.text, font: 'Mono', size: s, color: theme.ink, pre: true });
        } else if (r.t === 'inline') {
          const by = yy + r.h * 0.74;
          if (r.chord) ops.push({ t: 'text', x: bodyX, y: by, str: r.chord, font: 'MonoBold', size: s, color: theme.chord });
          ops.push({ t: 'text', x: bodyX + r.gutter * CW * s, y: by, str: r.text, font: 'Mono', size: s, color: theme.ink, pre: true });
        } else if (r.t === 'chords') {
          pushChordRow(ops, r.chords, bodyX, yy + r.h * 0.72, s * 1.04, theme);
        } else if (r.t === 'lyric') {
          ops.push({ t: 'text', x: bodyX, y: yy + r.h * 0.74, str: r.text, font: 'Mono', size: s, color: theme.ink, pre: true });
        } else if (r.t === 'callout') {
          const bh = s * 1.45, by = yy + (r.h - bh) / 2;
          ops.push({ t: 'rect', x: M, y: by, w: W - 2 * M, h: bh, r: 4, fill: theme.callout });
          ops.push({ t: 'text', x: M + 10, y: by + bh * 0.7, str: r.text.toUpperCase(), font: 'CondBold', size: s * 0.88, color: theme.calloutInk, spacing: 0.3 });
        }
        yy += r.h;
      }
      yy += s * 0.3;
    });
    // footer
    const fy = H - 12;
    ops.push({ t: 'text', x: M, y: fy, str: title + (artist ? '  ·  ' + artist : ''), font: 'CondMed', size: 8, color: theme.muted });
    let right = nPages > 1 ? 'PAGE ' + (pi + 1) + ' OF ' + nPages : '';
    if (pi < nPages - 1) {
      const nb = result.pages[pi + 1][0];
      const nextName = nb ? (nb.sec.name || '').toUpperCase() + (nb.cont ? ' (CONT.)' : '') : '';
      const runs = [{ text: right + '   NEXT  ', font: 'CondMed', size: 8, color: theme.muted }, { text: nextName + ' →', font: 'CondBold', size: 9.5, color: nb ? (theme.kind[nb.sec.kind] || theme.ink) : theme.ink }];
      ops.push({ t: 'runs', x: W - M - runsWidth(runs, measure), y: fy, runs });
    } else if (right) {
      ops.push({ t: 'text', x: W - M - measure(right, 'CondMed', 8), y: fy, str: right, font: 'CondMed', size: 8, color: theme.muted });
    }
    out.push(ops);
  });
  return { pages: out, size: s, info, summary };
}

function pushChordRow(ops, line, x, y, s, theme) {
  line.replace(/\S+/g, (tok, idx) => {
    const chord = isChord(tok);
    ops.push({ t: 'text', x: x + idx * CW * s, y, str: tok, font: chord ? 'MonoBold' : 'Mono', size: s, color: chord ? theme.chord : theme.aux });
    return tok;
  });
}

/* ---------------- Renderers ---------------- */
const SVG_FONT = { Mono: 'SSMono', MonoSemi: 'SSMonoSemi', MonoBold: 'SSMonoBold', CondBold: 'SSCondBold', CondMed: 'SSCondMed', Sym: 'SSSym' };
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function toSVG(ops, measure) {
  const { W, H } = PAGE;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  for (const o of ops) {
    if (o.t === 'rect') {
      s += `<rect x="${o.x.toFixed(2)}" y="${o.y.toFixed(2)}" width="${o.w.toFixed(2)}" height="${Math.max(o.h, 0).toFixed(2)}" rx="${o.r || 0}" fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="1"` : ''}/>`;
    } else if (o.t === 'circle') {
      s += `<circle cx="${o.x.toFixed(2)}" cy="${o.y.toFixed(2)}" r="${o.r}" fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="0.8"` : ''}/>`;
    } else if (o.t === 'text') {
      s += textSVG(o.x, o.y, o.str, o.font, o.size, o.color, o.spacing);
    } else if (o.t === 'runs') {
      let x = o.x;
      for (const r of o.runs) { s += textSVG(x, o.y + (r.dy || 0), r.text, r.font, r.size, r.color); x += measure(r.text, r.font, r.size); }
    }
  }
  return s + '</svg>';
}
function textSVG(x, y, str, font, size, color, spacing) {
  return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${SVG_FONT[font]}" font-size="${size.toFixed(2)}" fill="${color}"${spacing ? ` letter-spacing="${spacing}"` : ''} xml:space="preserve" style="white-space:pre">${esc(str)}</text>`;
}

function toPDF(jsPDFCtor, fontData, pageOps, meta) {
  const { W, H } = PAGE;
  const doc = new jsPDFCtor({ unit: 'pt', format: [W, H], orientation: 'portrait', compress: true });
  registerFonts(doc, fontData);
  pageOps.forEach((ops, i) => {
    if (i > 0) doc.addPage([W, H], 'portrait');
    for (const o of ops) {
      if (o.t === 'rect') {
        if (o.h <= 0) continue;
        const style = o.fill && o.stroke ? 'FD' : o.fill ? 'F' : 'S';
        if (o.fill) doc.setFillColor(o.fill);
        if (o.stroke) { doc.setDrawColor(o.stroke); doc.setLineWidth(1); }
        if (o.r) doc.roundedRect(o.x, o.y, o.w, o.h, o.r, o.r, style); else doc.rect(o.x, o.y, o.w, o.h, style);
      } else if (o.t === 'circle') {
        if (o.fill) { doc.setFillColor(o.fill); doc.circle(o.x, o.y, o.r, 'F'); }
        else { doc.setDrawColor(o.stroke); doc.setLineWidth(0.8); doc.circle(o.x, o.y, o.r, 'S'); }
      } else if (o.t === 'text') {
        pdfText(doc, o.x, o.y, o.str, o.font, o.size, o.color, o.spacing);
      } else if (o.t === 'runs') {
        let x = o.x;
        for (const r of o.runs) { pdfText(doc, x, o.y + (r.dy || 0), r.text, r.font, r.size, r.color); doc.setFont(r.font, 'normal'); doc.setFontSize(r.size); x += doc.getTextWidth(r.text); }
      }
    }
  });
  doc.setProperties({ title: meta.title || '', author: meta.artist || '', subject: meta.genre || '', keywords: meta.keywords || '', creator: 'Stage Sheets' });
  return doc;
}
function pdfText(doc, x, y, str, font, size, color, spacing) {
  if (!str) return;
  doc.setFont(font, 'normal'); doc.setFontSize(size); doc.setTextColor(color);
  doc.text(str, x, y, spacing ? { charSpace: spacing } : undefined);
}
function registerFonts(doc, fontData) {
  for (const [name, b64] of Object.entries(fontData)) {
    doc.addFileToVFS(name + '.ttf', b64);
    doc.addFont(name + '.ttf', name, 'normal');
  }
}
function makeMeasurer(jsPDFCtor, fontData) {
  const doc = new jsPDFCtor({ unit: 'pt', format: [PAGE.W, PAGE.H] });
  registerFonts(doc, fontData);
  const cache = new Map();
  return (text, font, size) => {
    if (!text) return 0;
    if (font === 'Mono' || font === 'MonoSemi' || font === 'MonoBold') return text.length * CW * size;
    const k = font + '|' + text;
    let w = cache.get(k);
    if (w === undefined) { doc.setFont(font, 'normal'); doc.setFontSize(1000); w = doc.getTextWidth(text) / 1000; cache.set(k, w); }
    return w * size;
  };
}

Object.assign(SS, {
  parse, songInfo, detectKey, keyName, parseKey, shiftKey, chordSummary, transposeLine, isChordLine, isChord,
  layout, toSVG, toPDF, forScoreKeywords, parseShape, makeMeasurer, PAGE, PAPER, MAJOR_NAMES, MINOR_NAMES,
});
if (typeof module !== 'undefined') module.exports = SS;
if (typeof window !== 'undefined') window.SS = SS;
