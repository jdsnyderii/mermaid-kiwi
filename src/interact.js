// Browser only: paints an SVG into an element and (optionally) lets the user drag shapes / boundary titles.
import { build, buildView, viewHash, serializeView, layoutBlock } from './core.js';
import { serializeConstraints, contentHash } from './constraints.js';

// One mount for both front-ends; only build / write-back / hash differ.
const FRONT = {
  mermaid: { build, serialize: serializeConstraints, hash: contentHash },
  view: { build: buildView, serialize: serializeView, hash: viewHash, extra: s => ({ layout: layoutBlock(s) }) },
};

export async function mount(el, src, o = {}) {
  const F = FRONT[o.kind || 'mermaid']; let cur = src, d = await F.build(cur, o), drag = null;
  const paint = () => { el.innerHTML = d.svg({ editable: !!o.editable }); o.onWarnings && o.onWarnings(d.warnings); };
  const pt = e => new DOMPoint(e.clientX, e.clientY).matrixTransform(el.querySelector('svg').getScreenCTM().inverse());
  const inside = id => d.g.list.filter(i => !i.box && (function a(n) { return n && (n.id === id || a(d.g.items[n.parent])); })(i));
  const down = e => {
    const t = e.target.closest('[data-id]'); if (!t) return;
    el.setPointerCapture(e.pointerId);
    drag = { p: pt(e), base: inside(t.dataset.id).map(n => ({ id: n.id, x: n.px + n.pw / 2, y: n.py + n.ph / 2 })) };
    e.preventDefault();
  };
  const move = e => {
    if (!drag) return; const p = pt(e);
    drag.base.forEach(b => { d.pins[b.id] = { x: b.x + p.x - drag.p.x, y: b.y + p.y - drag.p.y }; });
    d.solve(false); paint();                                  // straight edges while dragging keeps it fast
  };
  const up = () => {
    if (!drag) return; drag = null;
    d.solve(true); paint(); cur = F.serialize(cur, d.pins);
    o.onChange && o.onChange({ source: cur, pins: d.pins, hash: F.hash(cur), ...(F.extra ? F.extra(cur) : {}) });
  };
  paint();
  if (o.editable) { el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); }
  return {
    get diagram() { return d; }, get source() { return cur; },
    async update(s) { cur = s; d = await F.build(cur, o); paint(); },
    async clearPins() { return this.update(F.serialize(cur, {})); },
    destroy() { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); },
  };
}
