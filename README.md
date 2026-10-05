# mermaid-kiwi

Two front-ends, one shared engine. They are separate features and never share syntax.

| | Front-end 1: Mermaid fences | Front-end 2: view fences |
|---|---|---|
| Fence | ```` ```mermaid ```` (flowchart / graph) | ```` ```view bank-containers ```` |
| Input | Mermaid text, parsed by Mermaid's own parser | A small view language over a model file |
| Constraints | `%% constrain: align-y A B` comments | plain lines: `align-y A B` |
| Styles | `:::person` classes (fixed set) | `style tag:external fill=#999 shape=hexagon` |
| Layout saved as | `%% @layout` block of `%% constrain: pin` lines | a `layout` line followed by `pin` lines |
| Edge routing | `%% option: edges=routed\|straight` | `edges routed\|straight` |
| Needs Mermaid | yes (injected, tested with 11.15.0) | no |

Shared engine: ELK start layout -> Kiwi constraints/pins -> A* edge routing -> self-contained SVG -> drag-to-pin.
Same page flow as Mermaid: the browser turns `<pre>` text into SVG at load. No server rendering, no headless browser.

## Source layout
```
shared    layout.js route.js render.js shapes.js core.js interact.js run.js
front 1   graph.js (Mermaid parser) constraints.js (%% comments, write-back, hash)
front 2   view.js  (view language, model -> graph, write-back, hash)
model     dsl.js   (element/relationship syntax; also exports toMermaid for "Export Mermaid")
```
Bundles (`npm run build`): `dist/mermaid-kiwi.iife.min.js` (global `MermaidKiwi`), `.esm.js`, `.core.js` (Node, no interaction).

## Front-end 1: Mermaid fences
```html
<script src="mermaid.min.js"></script><script src="mermaid-kiwi.iife.min.js"></script>
<script>mermaid.initialize({startOnLoad:false}); MermaidKiwi.run({mermaid, editable:true, onChange});</script>
```
Only flowcharts containing `%% constrain:` or `%% @layout` are taken; every other fence goes to `mermaid.run()`.
Options (not constraints): `%% option: edges=routed|straight` (default routed). A fence containing only an option line is still taken over by MermaidKiwi.
Ops: `align-x/align-y ids`, `left-of/above/below ids gap=N`, `distribute-x/distribute-y ids [gap=N]`, `pin id x= y=`; any op accepts `strength=required|strong|medium|weak`.

## Front-end 2: view fences
```
model model.dsl          // path, resolved by the loader
of bank | all            // zoom into one element (its children inside a boundary), or show everything nested
expand api               // also open these as boundaries
include a, b   hide c    // force-show / remove elements
dir TB|LR|BT|RL    title "Internet Banking"
edges routed|straight    // orthogonal routed edges (default) or straight lines
style <selector> shape=person|box|rounded|cylinder|circle|hexagon fill= stroke= color= stroke-width= stroke-dasharray= width= height=
align-y email mainframe  // any constraint op, no prefix
layout                   // generated below this line
  pin web x=120 y=340
```
Comments: `//`, or `#` followed by a space (so `#08427b` is a colour). Selectors: `*`, an element type (`person`, `softwareSystem`, `container`, `component`), `tag:name`, `id:name`.
Cascade: built-in defaults, then your `style` lines, least to most specific (`*` < type < tag < id), later wins within a level. Relationships between nested elements roll up to whatever is visible.
Model files use the existing element/relationship syntax (`person`, `softwareSystem`, `container`, `component`, `a -> b "desc" "tech"`), with `{` at the end of a line.

Edge routing: the fence decides (`edges` / `%% option: edges=`); the host option `route` passed to `run`/`mount` is only the default for fences that say nothing. `setViewStatement(text,'edges','straight')` and `setMermaidOption(src,'edges','straight')` edit the line for UIs.

Model loading: `run({models:{path:text}})` or `run({loadModel: async path => text})`; the default fetches `path`. Fence markup from the server: `<pre class="view" data-name="bank-containers" data-hash="...">escaped source</pre>`.

## Write-back (both front-ends)
`onChange` fires on drop. View fences: `{kind:'view', name, baseHash, source, layout, pins}`. The server finds the fence named `name`, returns 409 if its hash differs from `baseHash`, otherwise replaces the lines from `layout` down (or the whole fence body with `source`).
Hash = FNV-1a (32-bit, UTF-8, lowercase hex) of the hand-written part: Mermaid fences strip pin lines and the `%% @layout` marker; view fences take everything above the `layout` line, right-trimmed.
```python
import re
def fnv1a(s):
    h = 0x811c9dc5
    for b in s.encode(): h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return f'{h:08x}'
PIN = re.compile(r'^\s*%%\s*constrain:\s*pin\b', re.I)
def mermaid_hash(src):
    return fnv1a('\n'.join(l for l in src.split('\n') if not PIN.match(l) and not l.strip().startswith('%% @layout')).rstrip())
def view_hash(src):
    lines = src.split('\n')
    i = next((k for k, l in enumerate(lines) if re.sub(r'(^|\s)(//|#(?=\s|$)).*$', '', l).strip().lower() == 'layout'), len(lines))
    return fnv1a('\n'.join(lines[:i]).rstrip())
```
An unnamed view still renders but cannot be saved; the page warns.

## Test
`npm test` builds, then runs the real Mermaid parser under jsdom against the bundles (front-end 1) and exercises view fences, styles, constraints, write-back and `run()` (front-end 2).
