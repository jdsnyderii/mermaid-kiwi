// FRONT-END 1 (Mermaid fences): Mermaid text -> nodes / boundaries / edges, using Mermaid's own parser. Mermaid is injected, never imported.
import { kindStyle, nodeSize } from './shapes.js';
export function defaultMeasure() {
  let ctx = null;
  try { ctx = document.createElement('canvas').getContext('2d'); } catch (e) {}
  return (text, font) => {
    if (ctx) { ctx.font = font; return ctx.measureText(text).width; }
    return text.length * (/bold/.test(font) ? 7.2 : 6.2);        // headless fallback
  };
}

export async function readGraph(src, mermaid, measure = defaultMeasure()) {
  const db = (await mermaid.mermaidAPI.getDiagramFromText(src)).db;
  const vs = db.getVertices(), vl = vs instanceof Map ? [...vs.values()] : Object.values(vs), sgs = db.getSubGraphs(), items = {};
  vl.forEach(v => {
    if (sgs.some(s => s.id === v.id)) return;
    const lines = String(v.text || v.id).split(/<br\s*\/?>/i).map(s => s.replace(/<[^>]+>/g, '').trim());
    const cls = [].concat(v.classes || []).join(' ');
    const kind = { person: /person/.test(cls), ext: /ext/.test(cls), comp: /component/.test(cls), cont: /container/.test(cls), db: /\bdb\b/.test(cls) || v.type === 'cylinder' };
    const style = kindStyle(kind);
    items[v.id] = { id: v.id, lines, style, ...nodeSize(lines, style, measure) };
  });
  sgs.forEach(s => { const title = String(s.title || s.id).replace(/<[^>]+>/g, ''); items[s.id] = { id: s.id, box: true, title, style: {}, tw: measure(title, 'bold 12px system-ui,sans-serif') + 28 }; });
  sgs.forEach(s => s.nodes.forEach(n => { if (items[n]) items[n].parent = s.id; }));
  const edges = db.getEdges().filter(e => items[e.start] && items[e.end] && !items[e.start].box && !items[e.end].box)
    .map(e => ({ a: e.start, b: e.end, lines: String(e.text || '').split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean), open: /open/.test(e.type || '') }));
  return { items, list: Object.values(items), edges, dir: ({ TB: 'DOWN', TD: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' })[db.getDirection?.() || 'TB'] || 'DOWN' };
}
