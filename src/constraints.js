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
  /^\s*(flowchart|graph)\b/m.test(src) && /^\s*%%\s*(constrain:|@layout)/m.test(src);

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
