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
  const paint = origin => { el.innerHTML = d.svg({ editable: !!o.editable, origin }); o.onWarnings && o.onWarnings(d.warnings); };
  const inside = id => d.g.list.filter(i => !i.box && (function a(n) { return n && (n.id === id || a(d.g.items[n.parent])); })(i));
  // Drag maths uses pointer movement in client pixels, divided by the scale at drag start, and the picture's top-left is frozen
  // while dragging. (Mapping the pointer through the live SVG transform feeds back when the picture's bounds change, which made
  // shapes accelerate away from the pointer.)
  const down = e => {
    const t = e.target.closest('[data-id]'); if (!t) return;
    const sv = el.querySelector('svg'), vb = (sv.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number), ctm = sv.getScreenCTM && sv.getScreenCTM();
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, k: ctm && ctm.a ? ctm.a : 1, origin: [vb[0], vb[1]], base: inside(t.dataset.id).map(n => ({ id: n.id, x: n.px + n.pw / 2, y: n.py + n.ph / 2 })) };
    e.preventDefault();
  };
  const move = e => {
    if (!drag) return; const dx = (e.clientX - drag.x) / drag.k, dy = (e.clientY - drag.y) / drag.k;
    drag.base.forEach(b => { d.pins[b.id] = { x: b.x + dx, y: b.y + dy }; });
    d.solve(false); paint(drag.origin);                       // straight edges while dragging keeps it fast
  };
  const up = () => {
    if (!drag) return; drag = null;
    // shapes that were pushed out of the way are pinned where they ended up, so the saved layout reproduces what was on screen
    if (d.g.sepActive) d.g.list.forEach(n => { if (!n.box && !d.pins[n.id] && Math.hypot(n.px - n.x0, n.py - n.y0) > 4) d.pins[n.id] = { x: n.px + n.pw / 2, y: n.py + n.ph / 2 }; });
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
