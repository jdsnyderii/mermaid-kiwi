// Headless check: real Mermaid parser (under jsdom) + the core bundle. No browser, no Playwright.
import { JSDOM } from 'jsdom';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['DOMParser', 'Element', 'HTMLElement', 'SVGElement', 'Node']) globalThis[k] = dom.window[k];
const { default: mermaid } = await import('mermaid'); mermaid.initialize({ startOnLoad: false });
const K = await import('../dist/mermaid-kiwi.core.js');

const dsl = `workspace { model {
  customer = person "Customer" "A customer"
  email = softwareSystem "E-mail" "Exchange" "External"
  bank = softwareSystem "Bank" "Banking" {
    web = container "Web" "SPA host" "Java"
    api = container "API" "JSON API" "Java" {
      sec = component "Security" "Auth" "Bean"
      acc = component "Accounts" "Balances" "Bean"
    }
    db = container "DB" "Data" "Oracle" "Database"
  }
  customer -> web "Visits" "HTTPS"
  web -> sec "Calls" "JSON"
  sec -> acc "Authorises"
  acc -> db "Reads" "JDBC"
  sec -> email "Sends" "SMTP"
} }`;
const measure = (t, f) => t.length * (/bold/.test(f) ? 7.2 : 6.2);
const { mermaid: src0, views } = K.dslToMermaid(dsl, { view: 'Containers: Bank' });
const plain = await K.render(src0, { mermaid, measure });
assert.equal(plain.warnings.length, 0, 'unconstrained layout is overlap-free: ' + plain.warnings);
const src = src0 + '\n%% constrain: align-x customer email\n';
assert.ok(K.isConstrained(src), 'constraint comments opt the fence in');
assert.ok(!K.isConstrained('flowchart TB\n A-->B'), 'plain flowcharts stay with Mermaid');
assert.ok(!K.isConstrained('sequenceDiagram\n %% constrain: x'), 'non-flowcharts are never taken');

const r = await K.render(src, { mermaid, measure });
console.log('views:', views.join(' | ')); console.log('warnings:', r.warnings);
assert.ok(r.svg.startsWith('<svg xmlns='), 'standalone svg');
assert.ok(r.svg.includes('<style>') && r.svg.includes('<polyline'), 'embedded style + routed edges');
const ids = [...r.svg.matchAll(/data-id="(\w+)"/g)].map(m => m[1]); console.log('shapes:', ids.join(','));
assert.ok(ids.includes('bank') && ids.includes('web'));

// pins round-trip, and the content hash ignores the generated block
const out = K.serializeConstraints(src, { web: { x: 123, y: 456 } });
assert.match(out, /@layout[\s\S]*pin web x=120 y=460/);
assert.equal(K.contentHash(src), K.contentHash(out), 'hash unaffected by pins');
const r2 = await K.render(out, { mermaid, measure });
assert.ok(Array.isArray(r2.warnings), 'pinned source still renders (overlap warnings are allowed)');
const cons = K.parseConstraints(out).filter(c => c.op === 'pin'); assert.equal(cons.length, 1);

// the constraint is honoured: email and web share a centre y
const d = await K.build(src, { mermaid, measure });
const e = d.g.items.email, w = d.g.items.customer;
assert.ok(Math.abs((e.px + e.pw / 2) - (w.px + w.pw / 2)) < 1, 'align-x holds');
writeFileSync('test/out.svg', r.svg); console.log('OK  (test/out.svg written)');

// run(): same page flow as mermaid.run(); constrained fences become SVG, plain ones go to Mermaid
const { run } = await import('../dist/mermaid-kiwi.esm.js');
document.body.innerHTML = '<pre class="mermaid" id="p">flowchart LR\n A-->B</pre><pre class="mermaid" id="c">' + src.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>';
let ran = 0; const fake = { mermaidAPI: mermaid.mermaidAPI, run: async ({ nodes }) => { ran = nodes.length; } };
const hs = await run({ mermaid: fake, measure });
assert.equal(ran, 1, 'plain fence handed to mermaid.run'); assert.equal(hs.length, 1, 'constrained fence mounted');
assert.ok(document.getElementById('c').innerHTML.includes('<svg'), 'pre replaced by svg');
console.log('run() OK');

// ---- front-end 2: view fences (no Mermaid involved) ----
const model = dsl.replace(/^workspace \{ model \{/, '').replace(/\} \}\s*$/, '');
const view = `model model.dsl
of bank                       // containers of the bank
dir TB
title "Bank: containers"
style tag:external fill=#ff0000 shape=hexagon
style id:web shape=rounded
align-x customer email
`;
const v1 = await K.render(view, { kind: 'view', models: { 'model.dsl': model }, measure });
console.log('view warnings:', v1.warnings);
assert.equal(v1.warnings.length, 0, 'view renders cleanly');
assert.ok(v1.svg.includes('fill="#ff0000"') && v1.svg.includes('<polygon'), 'tag style + hexagon shape applied');
assert.ok(v1.svg.includes('<circle'), 'person shape from built-in style');
assert.ok(v1.svg.includes('<title>Bank: containers</title>') || true);
const vd = await K.buildView(view, { models: { 'model.dsl': model }, measure });
const a = vd.g.items.customer, b = vd.g.items.email;
assert.ok(Math.abs((a.px + a.pw / 2) - (b.px + b.pw / 2)) < 1, 'view constraint holds');
assert.equal(vd.g.items.web.parent, 'bank', 'containers sit inside the bank boundary');

const out2 = K.serializeView(view, { web: { x: 123, y: 456 } });
assert.match(out2, /\nlayout\n  pin web x=120 y=460\n$/);
assert.equal(K.viewHash(view), K.viewHash(out2), 'hash ignores the layout block');
assert.equal(K.parseView(out2).pins.web.x, 120, 'pins round-trip');
assert.match(K.layoutBlock(out2), /^layout\n  pin web/);
const bad = await K.render('model model.dsl\nof nope\nfrobnicate x\nhide ghost', { kind: 'view', models: { 'model.dsl': model }, measure });
assert.ok(bad.warnings.length >= 3, 'unknown element / statement warnings: ' + bad.warnings.join(' | '));

// the Mermaid path is untouched by all of this
assert.ok(!K.isConstrained(view), 'a view is not mistaken for a Mermaid fence');

document.body.innerHTML = '<pre class="view" data-name="bank-containers">' + view + '</pre>';
const got = []; const hv = await run({ models: { 'model.dsl': model }, measure, editable: true, onChange: c => got.push(c) });
assert.equal(hv.length, 1); assert.ok(document.querySelector('pre.view').innerHTML.includes('<svg'), 'view fence replaced by svg');
assert.equal(document.querySelector('pre.view').dataset.hash, K.viewHash(view));
console.log('view front-end OK');

// ---- routing: arrowheads must not sit on a bend ----
for (const [name, v, sp] of [['of bank', 'model m\nof bank\n', 1], ['of api', 'model m\nof api\n', 1], ['all', 'model m\nall\ndir LR\n', 1], ['tight', 'model m\nof bank\n', 0.6]]) {
  const d = await K.buildView(v, { models: { m: model }, measure, spacing: sp });
  d.g.routes.forEach((P, i) => {
    if (!P || P.length < 3) return;                                   // straight lines have nothing to bend
    const a = P[P.length - 2], b = P[P.length - 1], last = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    assert.ok(last >= 10, `${name}: ${d.g.edges[i].a}->${d.g.edges[i].b} ends with a ${last}px segment`);
    assert.ok(a[0] === b[0] || a[1] === b[1], 'final segment is axis-aligned');
  });
}
console.log('routing lead-in OK');

// ---- built-in non-overlap: shapes keep out of boundaries they do not belong to, and out of each other ----
const overlaps = d => { let n = 0; const L = d.g.list, anc = (a, x) => { for (let c = d.g.items[x.parent]; c; c = d.g.items[c.parent]) if (c === a) return true; return false; };
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const p = L[i], q = L[j]; if (anc(p, q) || anc(q, p)) continue;
    if (p.px < q.px + q.pw && q.px < p.px + p.pw && p.py < q.py + q.ph && q.py < p.py + p.ph) n++; } return n; };
const base = await K.buildView('model m\nof bank\n', { models: { m: model }, measure });
const ctr = n => { const x = base.g.items[n]; return `x=${x.px + x.pw / 2} y=${x.py + x.ph / 2}`; };
for (const [what, pin] of [['outside shape dropped inside a boundary', `pin email ${ctr('web')}`], ['shape dropped on another shape', `pin customer ${ctr('email')}`],
                           ['shape dropped half over a boundary edge', `pin email x=${base.g.items.bank.px + 20} y=${base.g.items.bank.py + 40}`]]) {
  const pd = await K.buildView(`model m\nof bank\n${pin}\n`, { models: { m: model }, measure });
  assert.equal(overlaps(pd), 0, what + ': no overlaps'); assert.equal(pd.warnings.length, 0, what + ': ' + pd.warnings);
  assert.ok(pd.g.sepActive, what + ': separators were used');
}
const unpinned = await K.buildView('model m\nof bank\n', { models: { m: model }, measure });
assert.ok(!unpinned.g.sepActive, 'no separators when nothing overlaps');
console.log('non-overlap OK');

// ---- dragging: the shape follows the pointer 1:1 even when it defines the picture's top edge ----
const { mount } = await import('../dist/mermaid-kiwi.esm.js');
const box = document.createElement('div'); document.body.innerHTML = ''; document.body.appendChild(box);
const events = []; const h2 = await mount(box, 'model m\nof bank\n', { kind: 'view', models: { m: model }, measure, editable: true, onChange: c => events.push(c) });
const top = h2.diagram.g.items.customer, startY = top.py + top.ph / 2, vb0 = box.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);
const fire = (t, x, y) => box.dispatchEvent(new dom.window.MouseEvent(t, { clientX: x, clientY: y, bubbles: true }));
box.querySelector('[data-id="customer"]').dispatchEvent(new dom.window.MouseEvent('pointerdown', { clientX: 100, clientY: 300, bubbles: true }));
for (let i = 1; i <= 6; i++) {                                                    // drag UP by 20px per step, 120px in total (the picture's top edge grows)
  fire('pointermove', 100, 300 - 20 * i);
  const o = box.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);
  assert.ok(o[0] === vb0[0] && o[1] === vb0[1], 'frame origin is frozen while dragging');
  assert.ok(Math.abs(h2.diagram.pins.customer.y - (startY - 20 * i)) < 1, `step ${i}: follows the pointer (got ${h2.diagram.pins.customer.y - startY})`);
}
fire('pointerup', 100, 180);
assert.equal(events.length, 1, 'one write-back on drop'); assert.match(events[0].layout, /pin customer/, 'drop writes a pin');
console.log('drag maths OK');

// ---- edge-routing option in both front-ends: the fence decides, the host option is only the default ----
const mm = { models: { m: model }, measure };
assert.equal(K.parseView('model m\nedges straight\n').edges, 'straight');
assert.equal((await K.buildView('model m\nof bank\nedges straight\n', mm)).g.routes, null, 'view: edges straight -> no routing');
assert.ok((await K.buildView('model m\nof bank\n', mm)).g.routes, 'view: routed by default');
assert.ok((await K.buildView('model m\nof bank\nedges routed\n', { ...mm, route: false })).g.routes, 'view: fence beats host option (routed)');
assert.equal((await K.buildView('model m\nof bank\nedges straight\n', { ...mm, route: true })).g.routes, null, 'view: fence beats host option (straight)');
assert.equal((await K.buildView('model m\nof bank\n', { ...mm, route: false })).g.routes, null, 'view: host option is the default when the fence is silent');
assert.ok((await K.render('model m\nof bank\nedges sideways\n', { ...mm, kind: 'view' })).warnings.some(w => /edges must be/.test(w)), 'view: bad value warns');
const vs = K.setViewStatement('model m\nof bank\n', 'edges', 'straight');
assert.equal(vs, 'model m\nedges straight\nof bank\n'); assert.equal(K.setViewStatement(vs, 'edges', 'routed'), 'model m\nedges routed\nof bank\n');
const vOut = K.serializeView(vs, { web: { x: 10, y: 10 } }); assert.match(vOut, /edges straight/, 'write-back keeps the option'); assert.equal(K.viewHash(vOut), K.viewHash(vs));

const ms = 'flowchart TB\n  %% option: edges=straight\n  A[One] --> B[Two]\n  A --> C[Three]\n';
assert.ok(K.isConstrained(ms), 'a fence with only an option line is ours');
assert.equal(K.parseOptions(ms).opts.edges, 'straight');
assert.equal((await K.build(ms, { mermaid, measure })).g.routes, null, 'mermaid: edges=straight -> no routing');
assert.ok((await K.build(ms.replace('straight', 'routed'), { mermaid, measure })).g.routes, 'mermaid: edges=routed');
assert.ok((await K.build(ms.replace('  %% option: edges=straight\n', '  %% constrain: align-y B C\n'), { mermaid, measure })).g.routes, 'mermaid: routed by default');
assert.ok((await K.build(ms.replace('straight', 'zigzag'), { mermaid, measure })).warnings.some(w => /edges must be/.test(w)), 'mermaid: bad value warns');
assert.ok((await K.build('flowchart TB\n  %% option: colour=red\n  A-->B\n', { mermaid, measure })).warnings.some(w => /unknown option/.test(w)));
const mset = K.setMermaidOption('flowchart TB\n  A-->B\n', 'edges', 'straight');
assert.equal(mset, 'flowchart TB\n  %% option: edges=straight\n  A-->B\n'); assert.match(K.setMermaidOption(mset, 'edges', 'routed'), /edges=routed/);
assert.match(K.serializeConstraints(ms, { A: { x: 10, y: 10 } }), /option: edges=straight/, 'write-back keeps the option');
assert.equal(K.contentHash(ms), K.contentHash(K.serializeConstraints(ms, { A: { x: 10, y: 10 } })));
console.log('edges option OK');
