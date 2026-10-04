// ELK supplies the starting layout; Kiwi then bends it to the constraints and pins.
import ELK from 'elkjs/lib/elk.bundled.js';
import { Solver, Variable, Expression as E, Constraint as C, Operator as O, Strength as S } from 'kiwi.js';

export async function elkLayout(g, sp = 1) {
  const kids = p => g.list.filter(i => i.parent === p).map(i => i.box
    ? { id: i.id, layoutOptions: { 'elk.padding': '[top=52,left=34,bottom=34,right=34]' }, children: kids(i.id) }
    : { id: i.id, width: i.w, height: i.h });
  const r = await new ELK().layout({ id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': g.dir, 'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': String(80 * sp), 'elk.layered.spacing.nodeNodeBetweenLayers': String(120 * sp), 'elk.spacing.edgeNode': String(30 * sp),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(30 * sp), 'elk.spacing.componentComponent': String(80 * sp) },
    children: kids(undefined), edges: g.edges.map((e, i) => ({ id: 'e' + i, sources: [e.a], targets: [e.b] })) });
  (function walk(c, ox, oy) { (c.children || []).forEach(k => { g.items[k.id].x0 = ox + k.x; g.items[k.id].y0 = oy + k.y; walk(k, ox + k.x, oy + k.y); }); })(r, 0, 0);
}

export function solveLayout(g, cons, pins) {
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
  sv.updateVariables();
  g.list.forEach(i => { i.px = i.x.value(); i.py = i.y.value(); i.pw = i.box ? i.wv.value() : i.w; i.ph = i.box ? i.hv.value() : i.h; });
  const L = g.list.filter(i => !i.box); let ov = 0;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const p = L[i], q = L[j];
    if (p.px < q.px + q.pw - 2 && q.px < p.px + p.pw - 2 && p.py < q.py + q.ph - 2 && q.py < p.py + p.ph - 2) ov++; }
  if (ov) errs.push(`${ov} overlapping shape pair(s): drag one apart or add a constraint`);
  return errs;
}
