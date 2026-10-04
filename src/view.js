// FRONT-END 2 (view fences): a small view language over a model file. No Mermaid involved.
//   model model.dsl     of bank | all     dir TB     title "..."    include a, b    expand api    hide x
//   style <selector> shape=person fill=#08427b ...      align-y a b     above a b gap=60 ...
//   layout              <- generated below this line: pin id x=.. y=..
import { parseDsl, TL } from './dsl.js';
import { BASE, nodeSize, FONT } from './shapes.js';
import { fnv1a } from './constraints.js';

const OPS = new Set(['align-x', 'align-y', 'left-of', 'above', 'below', 'distribute-x', 'distribute-y']);
const DIRS = { TB: 'DOWN', TD: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' };
const tok = l => [...l.matchAll(/"([^"]*)"|\S+/g)].map(m => m[1] !== undefined ? m[1] : m[0]);
const list = ts => ts.join(' ').split(/[\s,]+/).filter(Boolean);
const kv = ts => { const o = {}, a = []; ts.forEach(x => { const m = x.match(/^([\w-]+)=(.+)$/); if (m) o[m[1]] = isNaN(m[2]) ? m[2] : +m[2]; else a.push(x); }); return { a, o }; };
const uncomment = raw => raw.replace(/(^|\s)(\/\/|#(?=\s|$)).*$/, '').trim();   // '#' only starts a comment when followed by space, so #08427b is a colour

export function parseView(text) {
  const v = { model: null, of: null, all: false, dir: 'TB', title: '', expand: [], include: [], hide: [], styles: [], cons: [], pins: {}, warnings: [] };
  let inLayout = false;
  text.split('\n').forEach((raw, i) => {
    const line = uncomment(raw); if (!line) return;
    const ts = tok(line), op = ts[0].toLowerCase(), rest = ts.slice(1), n = i + 1;
    if (op === 'layout') { inLayout = true; return; }
    if (op === 'pin') { const { a, o } = kv(rest); if (a[0]) v.pins[a[0]] = { x: o.x, y: o.y }; return; }
    if (inLayout) { v.warnings.push(`line ${n}: only pin lines belong under layout`); return; }
    switch (op) {
      case 'model': v.model = rest[0]; break;
      case 'of': v.of = rest[0]; break;
      case 'all': v.all = true; break;
      case 'dir': v.dir = (rest[0] || 'TB').toUpperCase(); break;
      case 'title': v.title = rest.join(' '); break;
      case 'include': case 'expand': case 'hide': v[op].push(...list(rest)); break;
      case 'style': v.styles.push({ sel: rest[0], props: kv(rest.slice(1)).o }); break;
      default:
        if (OPS.has(op)) { const { a, o } = kv(rest); v.cons.push({ op, args: a, opts: o, line: n }); }
        else v.warnings.push(`line ${n}: unknown statement "${ts[0]}"`);
    }
  });
  return v;
}

// Built-in styles; a view's own `style` lines are applied after these, most specific selector last.
const DEFAULT_RULES = [
  { sel: 'person', props: { shape: 'person', fill: '#08427b' } },
  { sel: 'container', props: { fill: '#438dd5' } },
  { sel: 'component', props: { fill: '#85bbf0', color: '#0b2545' } },
  { sel: 'tag:external', props: { fill: '#999999' } }, { sel: 'tag:existing', props: { fill: '#999999' } },
  { sel: 'tag:database', props: { shape: 'cylinder' } },
];

// Model + view -> the same graph structure the Mermaid front-end produces.
export function viewGraph(m, v, measure) {
  const warn = [], anc = e => e.parent ? [...anc(e.parent), e] : [e];
  const look = (names, what) => names.map(x => { const e = m.ids[x]; if (!e) warn.push(`${what}: unknown element "${x}"`); return e; }).filter(Boolean);
  const scope = v.of ? m.ids[v.of] : null; if (v.of && !scope) warn.push(`of: unknown element "${v.of}"`);
  const boxes = new Set(), open = new Set();                       // boxes are drawn as boundaries; open = path we descend through
  const addBox = e => { if (e.kids.length) boxes.add(e); anc(e).forEach(a => open.add(a)); };
  if (v.all) m.els.forEach(e => { if (e.kids.length) { boxes.add(e); open.add(e); } });
  if (scope) addBox(scope); look(v.expand, 'expand').forEach(addBox);
  const hidden = new Set(look(v.hide, 'hide')), isHidden = e => anc(e).some(a => hidden.has(a));
  // roll a relationship endpoint up to the highest element that is not "open" (Structurizr-style aggregation)
  const rep = e => { for (const a of anc(e)) if (!open.has(a)) return a; return null; };
  const vis = new Set(), E = new Map();
  m.rels.forEach(r => {
    const a = rep(r.a), b = rep(r.b); if (!a || !b || a === b || isHidden(a) || isHidden(b)) return;
    const lines = [r.desc, r.tech && '[' + r.tech + ']'].filter(Boolean), k = [a.n, b.n, lines.join('|')].join('>');
    if (!E.has(k)) { E.set(k, { a, b, lines }); vis.add(a); vis.add(b); }
  });
  boxes.forEach(b => { vis.add(b); b.kids.forEach(k => vis.add(k)); });
  if (!scope && !v.all) m.els.filter(e => !e.parent).forEach(e => vis.add(e));
  look(v.include, 'include').forEach(e => { const r = rep(e); if (r) vis.add(r); });
  [...vis].forEach(e => { if (isHidden(e)) vis.delete(e); });

  const spec = s => s === '*' ? 0 : /^tag:/i.test(s) ? 2 : /^id:/i.test(s) ? 3 : 1;
  const hit = (sel, e) => { const t = sel.toLowerCase(); if (t === '*') return true;
    if (t.startsWith('tag:')) return (e.tags || '').toLowerCase().split(/[,\s]+/).includes(t.slice(4));
    if (t.startsWith('id:')) return m.ids[sel.slice(3)] === e; return e.type === ({ system: 'softwaresystem' })[t] || e.type === t; };
  const styleOf = (e, rules, init) => { const s = { ...init }; rules.map((r, i) => ({ r, i })).filter(x => hit(x.r.sel, e))
    .sort((a, b) => spec(a.r.sel) - spec(b.r.sel) || a.i - b.i).forEach(x => Object.assign(s, x.r.props)); return s; };
  const ty = e => '[' + TL[e.type] + (e.tech ? ': ' + e.tech : '') + ']';
  const items = {};
  vis.forEach(e => {
    const parent = boxes.has(e.parent) && vis.has(e.parent) ? e.parent.path : undefined;
    if (boxes.has(e)) { const title = e.name + ' ' + ty(e); items[e.path] = { id: e.path, box: true, title, tw: measure(title, FONT.b) + 28, style: styleOf(e, v.styles, {}), parent }; return; }
    const lines = [e.name, ty(e), e.desc].filter(Boolean), style = styleOf(e, [...DEFAULT_RULES, ...v.styles], BASE);
    items[e.path] = { id: e.path, lines, style, parent, ...nodeSize(lines, style, measure) };
  });
  const map = x => m.ids[x] ? m.ids[x].path : x;                    // users write model ids; graph ids are element paths
  const edges = [...E.values()].filter(x => items[x.a.path] && items[x.b.path]).map(x => ({ a: x.a.path, b: x.b.path, lines: x.lines, open: false }));
  return { g: { items, list: Object.values(items), edges, dir: DIRS[v.dir] || 'DOWN', title: v.title },
    cons: v.cons.map(c => ({ ...c, args: c.args.map(map) })),
    pins: Object.fromEntries(Object.entries(v.pins).map(([k, p]) => [map(k), p])), warnings: warn };
}

// Everything above the `layout` line is hand-written; below it is generated. The hash covers only the hand-written part.
const cut = text => { const L = text.split('\n'), i = L.findIndex(l => uncomment(l).toLowerCase() === 'layout');
  return { head: (i < 0 ? L : L.slice(0, i)).join('\n').replace(/\s+$/, ''), i, L }; };
export const viewHash = text => fnv1a(cut(text).head);
export const layoutBlock = text => { const c = cut(text); return c.i < 0 ? '' : c.L.slice(c.i).join('\n'); };
export function serializeView(text, pins, grid = 10) {
  const r = n => Math.round(n / grid) * grid;
  const lines = Object.keys(pins).sort().map(id => `  pin ${id}` + (pins[id].x !== undefined ? ` x=${r(pins[id].x)}` : '') + (pins[id].y !== undefined ? ` y=${r(pins[id].y)}` : ''));
  return cut(text).head + (lines.length ? `\nlayout\n${lines.join('\n')}` : '') + '\n';
}
