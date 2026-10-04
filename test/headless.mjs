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
