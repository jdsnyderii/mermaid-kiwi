// Pure pipeline: source text -> SVG string. No DOM writes, no page assumptions. Mermaid is passed in.
import { readGraph, defaultMeasure } from './graph.js';
import { parseDsl } from './dsl.js';
import { parseView, viewGraph } from './view.js';
import { elkLayout, solveLayout } from './layout.js';
import { routeEdges } from './route.js';
import { drawSvg } from './render.js';
import { parseConstraints, parseOptions } from './constraints.js';
export * from './constraints.js';
export * from './dsl.js';
export * from './view.js';
export { defaultMeasure } from './graph.js';

// Both front-ends end up here: a graph + constraints + pins. build() keeps the solved graph so drag handling can re-solve cheaply.
// `edges` comes from the fence ('routed' | 'straight'); when the fence says nothing, the host option `route` decides (default: routed).
function finish(g, cons, pins, o, extra = [], edges = null) {
  const routed = edges ? edges === 'routed' : o.route !== false;
  const d = { g, cons, pins, routed, warnings: [],
    solve(route = true) { d.warnings = [...extra, ...solveLayout(g, cons, d.pins)]; g.routes = route && routed ? routeEdges(g) : null; return d; },
    svg(opts = {}) { return drawSvg(g, { theme: o.theme, ...opts }); } };
  return d.solve();
}

// Front-end 1: a Mermaid flowchart with %% constrain comments.
export async function build(src, o = {}) {
  const mermaid = o.mermaid || globalThis.mermaid;
  if (!mermaid) throw Error('MermaidKiwi: pass {mermaid} or load mermaid first');
  const g = await readGraph(src, mermaid, o.measure);
  await elkLayout(g, o.spacing ?? 1);
  const pins = {}, cons = [];
  parseConstraints(src).forEach(c => c.op === 'pin' ? pins[c.args[0]] = { x: c.opts.x, y: c.opts.y } : cons.push(c));
  const { opts, warnings } = parseOptions(src);
  return finish(g, cons, pins, o, warnings, opts.edges);
}

// Front-end 2: a view fence. The model comes from o.models[path] or o.loadModel(path); Mermaid is not used.
const fetchModel = async p => { const r = await fetch(p); if (!r.ok) throw Error(`model ${p}: HTTP ${r.status}`); return r.text(); };
export async function buildView(text, o = {}) {
  const v = parseView(text); if (!v.model) throw Error('view: missing "model <path>" line');
  const mt = o.models && o.models[v.model] !== undefined ? o.models[v.model] : await (o.loadModel || fetchModel)(v.model);
  const { g, cons, pins, warnings } = viewGraph(parseDsl(mt), v, o.measure || defaultMeasure());
  await elkLayout(g, o.spacing ?? 1);
  return finish(g, cons, pins, o, [...v.warnings, ...warnings], v.edges);
}

export async function render(src, o = {}) {
  const d = await (o.kind === 'view' ? buildView : build)(src, o);
  return { svg: d.svg(), pins: d.pins, warnings: d.warnings };
}
