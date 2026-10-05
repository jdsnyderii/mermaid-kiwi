// ELK supplies the starting layout; Kiwi then bends it to the constraints and pins.
import ELK from 'elkjs/lib/elk.bundled.js';
import { Solver, Variable, Expression as E, Constraint as C, Operator as O, Strength as S } from 'kiwi.js';

// ELK takes spacing from the node whose children it is laying out. Options given only on the root leave the inside of every
// boundary at ELK's 20px defaults (edges there become tiny or invisible), so each boundary gets the full set, scaled by `inner`.
const elkOpts = (g, k) => ({ 'elk.algorithm': 'layered', 'elk.direction': g.dir, 'elk.spacing.nodeNode': String(80 * k), 'elk.layered.spacing.nodeNodeBetweenLayers': String(120 * k),
  'elk.spacing.edgeNode': String(30 * k), 'elk.layered.spacing.edgeNodeBetweenLayers': String(30 * k), 'elk.spacing.componentComponent': String(80 * k) });
export async function elkLayout(g, sp = 1, inner = 0.85) {
  const kids = p => g.list.filter(i => i.parent === p).map(i => i.box
    ? { id: i.id, layoutOptions: { 'elk.padding': '[top=52,left=34,bottom=34,right=34]', ...elkOpts(g, sp * inner) }, children: kids(i.id) }
    : { id: i.id, width: i.w, height: i.h });
  const r = await new ELK().layout({ id: 'root', layoutOptions: { ...elkOpts(g, sp), 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: kids(undefined), edges: g.edges.map((e, i) => ({ id: 'e' + i, sources: [e.a], targets: [e.b] })) });
  (function walk(c, ox, oy) { (c.children || []).forEach(k => { g.items[k.id].x0 = ox + k.x; g.items[k.id].y0 = oy + k.y; walk(k, ox + k.x, oy + k.y); }); })(r, 0, 0);
}

function solveOnce(g, cons, pins, seps) {
  const sv = new Solver(), errs = [], add = (l, o, r, st = S.required) => sv.addConstraint(new C(l, o, r, st));
  g.list.forEach(i => {
    i.x = new Variable(); i.y = new Variable();
    if (i.box) { i.wv = new Variable(); i.hv = new Variable(); add(i.wv, O.Ge, i.tw); add(i.wv, O.Eq, 0, S.weak); add(i.hv, O.Eq, 0, S.weak); } // shrink-wrap boundaries
    else { add(i.x, O.Eq, i.x0, S.medium); add(i.y, O.Eq, i.y0, S.medium); }                                                                       // stay near ELK
  });
  const W = n => n.box ? n.wv : n.w, H = n => n.box ? n.hv : n.h, half = (p, s) => typeof s === 'number' ? new E(p, s / 2) : new E(p, [.5, s]);
  const cx = n => half(n.x, W(n)), cy = n => half(n.y, H(n));
  g.list.forEach(c => { const p = g.items[c.parent]; if (!p) return;                                            // containment
    add(new E(p.x, 34), O.Le, c.x); add(new E(c.x, W(c), 34), O.Le, new E(p.x, p.wv));
    add(new E(p.y, 52), O.Le, c.y); add(new E(c.y, H(c), 34), O.Le, new E(p.y, p.hv)); });
  for (const c of cons) {
    try {
      const st = S[c.opts.strength] ?? S.strong, a = (l, o, r) => add(l, o, r, st), gap = c.opts.gap ?? 50;
      const ns = c.args.map(id => { if (!g.items[id]) throw Error('unknown id ' + id); return g.items[id]; });
      const ch = f => { for (let i = 0; i < ns.length - 1; i++) f(ns[i], ns[i + 1]); };
      switch (c.op) {
        case 'align-x': ns.slice(1).forEach(n => a(cx(n), O.Eq, cx(ns[0]))); break;
        case 'align-y': ns.slice(1).forEach(n => a(cy(n), O.Eq, cy(ns[0]))); break;
        case 'left-of': ch((p, q) => a(new E(p.x, W(p), gap), O.Le, q.x)); break;
        case 'above': case 'below': ch((p, q) => a(new E(p.y, H(p), gap), O.Le, q.y)); break;
        case 'distribute-x': case 'distribute-y': { const X = c.op === 'distribute-x', P = n => X ? n.x : n.y, Z = n => X ? W(n) : H(n), gv = c.opts.gap ?? new Variable();
          ch((p, q) => a(new E(P(p), Z(p), gv), O.Eq, P(q))); break; }
        default: throw Error('unknown constraint "' + c.op + '"');
      }
    } catch (e) { errs.push(`line ${c.line}: ${e.message}`); }
  }
  for (const id in pins) { const n = g.items[id]; if (!n) continue;                                              // manual layout = strong pins
    if (pins[id].x !== undefined) add(cx(n), O.Eq, pins[id].x, S.strong);
    if (pins[id].y !== undefined) add(cy(n), O.Eq, pins[id].y, S.strong); }
  for (const q of seps) {                                                                                         // chosen "keep apart" constraints
    try { if (q.axis === 'x') add(new E(q.lo.x, W(q.lo), GAP), O.Le, q.hi.x); else add(new E(q.lo.y, H(q.lo), GAP), O.Le, q.hi.y); } catch (e) { /* cannot be satisfied: leave the overlap, it is reported */ }
  }
  sv.updateVariables();
  g.list.forEach(i => { i.px = i.x.value(); i.py = i.y.value(); i.pw = i.box ? i.wv.value() : i.w; i.ph = i.box ? i.hv.value() : i.h; });
  return errs;
}

// ---- built-in non-overlap ----
// Kiwi is linear, so "A and B must not overlap" (a disjunction) cannot be stated directly. Instead: solve, find shapes that are
// too close, pick ONE separating side per pair from the geometry, add it as a required constraint, and solve again.
// Applies to shape/shape, shape/foreign boundary and boundary/boundary pairs (a shape is allowed inside its own boundaries).
// The chosen side is remembered (g.ord) while the pair stays close, so a shape being dragged past another pushes it
// instead of making it jump to the other side.
const GAP = 20;
const isAnc = (g, a, n) => { for (let c = g.items[n.parent]; c; c = g.items[c.parent]) if (c === a) return true; return false; };
const gap2 = (p, q, m) => ({ ox: Math.min(p.px + p.pw, q.px + q.pw) - Math.max(p.px, q.px) + m, oy: Math.min(p.py + p.ph, q.py + q.ph) - Math.max(p.py, q.py) + m });
function* pairs(g) {
  const L = g.list;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (!isAnc(g, L[i], L[j]) && !isAnc(g, L[j], L[i])) yield [L[i], L[j]];
}

export function solveLayout(g, cons, pins) {
  g.ord = g.ord || new Map(); let seps = [], errs = [];
  for (let k = 0; k < 8; k++) {
    errs = solveOnce(g, cons, pins, seps);
    const more = [], near = (a, b) => { if (a === b || isAnc(g, a, b) || isAnc(g, b, a)) return false; const { ox, oy } = gap2(a, b, GAP); return ox > 0 && oy > 0; };
    const chain = n => { const c = [n]; for (let a = g.items[n.parent]; a; a = g.items[a.parent]) c.push(a); return c; };
    for (const [p, q] of pairs(g)) {
      if (!near(p, q)) continue;                                                                                  // far enough apart
      // if a boundary around either shape is already too close to the other, separating the boundaries separates everything inside;
      // adding a second, independently chosen rule for the contents can contradict it
      if (chain(p).some(a => chain(q).some(b => (a !== p || b !== q) && near(a, b)))) continue;
      if (seps.some(s => (s.lo === p && s.hi === q) || (s.lo === q && s.hi === p))) continue;
      const { ox, oy } = gap2(p, q, GAP);
      const key = p.id + '|' + q.id; let o = g.ord.get(key);
      if (!o) { const axis = ox < oy ? 'x' : 'y', c = n => axis === 'x' ? n.px + n.pw / 2 : n.py + n.ph / 2; o = { axis, lo: c(p) <= c(q) ? p : q, p, q }; g.ord.set(key, o); }
      more.push({ axis: o.axis, lo: o.lo, hi: o.lo === p ? q : p });
    }
    if (!more.length) break; seps = seps.concat(more);
  }
  for (const [key, o] of g.ord) { const { ox, oy } = gap2(o.p, o.q, GAP); if (ox < -2 * GAP || oy < -2 * GAP) g.ord.delete(key); }  // forget pairs that moved apart
  g.sepActive = seps.length > 0;
  let ov = 0; for (const [p, q] of pairs(g)) { const { ox, oy } = gap2(p, q, 0); if (ox > 0 && oy > 0) ov++; }
  if (ov) errs.push(`${ov} overlapping shape pair(s): drag one apart or add a constraint`);
  return errs;
}
