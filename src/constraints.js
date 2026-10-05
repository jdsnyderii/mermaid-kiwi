// Constraint comments: pure text in, data out. Mermaid discards %% comments, so we read them ourselves.
export const MARK = '%% @layout';
const PIN = /^\s*%%\s*constrain:\s*pin\b/i;

export function parseConstraints(src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*%%\s*constrain:\s*(.+)$/i); if (!m) return;
    const t = m[1].trim().split(/\s+/), op = t.shift(), args = [], opts = {};
    t.forEach(x => { const kv = x.match(/^(\w+)=(.+)$/); if (kv) opts[kv[1]] = isNaN(kv[2]) ? kv[2] : +kv[2]; else args.push(x); });
    out.push({ op, args, opts, line: i + 1 });
  });
  return out;
}

// Only flowcharts that opt in (constraints or a generated layout block) are taken over; everything else is left to Mermaid.
export const isConstrained = src =>
  /^\s*(flowchart|graph)\b/m.test(src) && /^\s*%%\s*(constrain:|option:|@layout)/m.test(src);

// Options are not constraints: `%% option: edges=routed|straight`. A fence with only an option line is still ours.
export const edgeMode = v => /^(routed|orthogonal|on|true)$/i.test(v) ? 'routed' : /^(straight|off|false|none)$/i.test(v) ? 'straight' : null;
const OPT = /^\s*%%\s*option:\s*(.+)$/i;
export function parseOptions(src) {
  const opts = {}, warnings = [];
  src.split('\n').forEach((line, i) => { const m = line.match(OPT); if (!m) return;
    m[1].trim().split(/\s+/).forEach(t => {
      const kv = t.match(/^(\w+)=(.+)$/); if (!kv) { warnings.push(`line ${i + 1}: option "${t}" needs key=value`); return; }
      if (kv[1] === 'edges') { const v = edgeMode(kv[2]); if (v) opts.edges = v; else warnings.push(`line ${i + 1}: edges must be routed or straight`); }
      else warnings.push(`line ${i + 1}: unknown option "${kv[1]}"`); }); });
  return { opts, warnings };
}
// Replace the option line for `key`, or insert one under the flowchart/graph header.
export function setMermaidOption(src, key, value) {
  const L = src.split('\n'), line = `  %% option: ${key}=${value}`, i = L.findIndex(l => OPT.test(l) && new RegExp('\\b' + key + '=').test(l));
  if (i >= 0) L[i] = line; else L.splice(L.findIndex(l => /^\s*(flowchart|graph)\b/.test(l)) + 1, 0, line);
  return L.join('\n');
}

export const stripLayout = src =>
  src.split('\n').filter(l => !PIN.test(l) && !l.trim().startsWith(MARK)).join('\n').replace(/\s+$/, '');

// Hash of the hand-written part only, so dragging (which rewrites pins) does not change it. FNV-1a over UTF-8.
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const contentHash = src => fnv1a(stripLayout(src));

// Rewrites the generated block: all pins, sorted by id, snapped to the grid, under one marker line.
export function serializeConstraints(src, pins, grid = 10) {
  const r = v => Math.round(v / grid) * grid;
  const lines = Object.keys(pins).sort().map(id => {
    const p = pins[id];
    return `  %% constrain: pin ${id}` + (p.x !== undefined ? ` x=${r(p.x)}` : '') + (p.y !== undefined ? ` y=${r(p.y)}` : '');
  });
  return stripLayout(src) + (lines.length ? `\n${MARK} (generated; safe to delete)\n${lines.join('\n')}` : '') + '\n';
}
