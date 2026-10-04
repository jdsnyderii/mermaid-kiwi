// Same page flow as mermaid.run(): find the fences, replace their text with an SVG.
//   pre.mermaid  -> constrained flowcharts only (front-end 1); every other Mermaid fence goes to mermaid.run() untouched
//   pre.view     -> view fences (front-end 2), named by data-name
import { mount } from './interact.js';
import { isConstrained, contentHash } from './constraints.js';
import { viewHash } from './view.js';

async function mountAll(els, kind, o, mm, hashOf) {
  const handles = [];
  for (const el of els) {
    const src = el.textContent, name = el.dataset.name; el.dataset.mkDone = '1'; if (!el.dataset.hash) el.dataset.hash = hashOf(src);
    try {
      el.style.whiteSpace = 'normal';
      handles.push(await mount(el, src, { ...o, kind, mermaid: mm,
        onWarnings: w => o.onWarnings && o.onWarnings(kind === 'view' && !name ? [...w, 'unnamed view: layout changes cannot be saved'] : w),
        onChange: ch => o.onChange && o.onChange({ ...ch, kind, name, baseHash: el.dataset.hash, element: el }) }));
    } catch (e) { el.textContent = src; el.classList.add('mk-error'); el.title = String(e.message || e); console.error('MermaidKiwi:', e); }
  }
  return handles;
}

export async function run(o = {}) {
  const mm = o.mermaid || globalThis.mermaid, root = o.root || document, q = s => [...root.querySelectorAll(s + ':not([data-mk-done])')];
  const nodes = q(o.selector || 'pre.mermaid'), mine = nodes.filter(n => isConstrained(n.textContent)), rest = nodes.filter(n => !mine.includes(n));
  if (rest.length && mm) await mm.run({ nodes: rest });
  return [...await mountAll(mine, 'mermaid', o, mm, contentHash), ...await mountAll(q(o.viewSelector || 'pre.view'), 'view', o, mm, viewHash)];
}
