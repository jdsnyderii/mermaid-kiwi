// Shared by both front-ends: what a node looks like (style) and how big it is.
export const FONT = { b: 'bold 12px system-ui,sans-serif', n: '11px system-ui,sans-serif' };
const EXTRA = { person: 30, cylinder: 14, hexagon: 8 };
export const BASE = { shape: 'box', fill: '#1168bd', stroke: 'rgba(0,0,0,.35)', color: '#ffffff', 'stroke-width': '1.5' };

// Mermaid front-end: class names (person/ext/container/component/db) map to a style.
const MERMAID_SHAPES = { diamond: 'diamond', circle: 'circle', doublecircle: 'circle', stadium: 'rounded', round: 'rounded', hexagon: 'hexagon' };
export function kindStyle(k, type) {
  return { ...BASE, shape: k.person ? 'person' : k.db ? 'cylinder' : MERMAID_SHAPES[type] || 'box',
    fill: k.ext ? '#999999' : k.person ? '#08427b' : k.comp ? '#85bbf0' : (k.cont || k.db) ? '#438dd5' : '#1168bd', color: k.comp ? '#0b2545' : '#ffffff' };
}
export function nodeSize(lines, style, measure) {
  const tw = Math.max(...lines.map((l, i) => measure(l, i ? FONT.n : FONT.b)));
  let w = Math.max(+style.width || 170, Math.round(tw + 26)), h = Math.max(+style.height || 0, lines.length * 15 + 20 + (EXTRA[style.shape] || 0));
  if (style.shape === 'diamond') { w = Math.round(w * 1.5); h = Math.round(h * 1.7); }          // room for text inside the points
  if (style.shape === 'circle') w = h = Math.max(w, h);
  return { w, h };
}
export const textTop = s => s.shape === 'person' ? 30 : s.shape === 'cylinder' ? 12 : 0;
