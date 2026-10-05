# AGENT.md: rules and design for mermaid-kiwi

Read this before changing anything. Open work is in `tasks.md`; usage is in `README.md`.

## What this is
A browser library that draws diagrams as SVG at page load, the same way Mermaid does (`<pre>` text in, `<svg>` out). Layout is ELK (starting positions) then Kiwi (constraints and manual pins), then an A* edge router. It runs inside a Python markdown viewer (Docker) and in hand-written static HTML. No server-side rendering. No headless browser, ever (no Playwright).

## The one rule: two front-ends, never mixed
They are separate features. They share the engine and nothing else. Do not let syntax, parsing, or write-back logic leak from one into the other.

| | Front-end 1: Mermaid fences | Front-end 2: view fences |
|---|---|---|
| Fence | `mermaid` (flowchart/graph only) | `view <name>` |
| Parser | Mermaid's own (`getDiagramFromText`), injected | our own small line-based view language (`view.js`) |
| Constraints | `%% constrain: ...` comments | plain lines, no prefix |
| Edge routing | `%% option: edges=routed\|straight` | `edges routed\|straight` |
| Pins saved as | `%% @layout` marker + `%% constrain: pin` lines | `layout` line + `pin` lines |
| Styles | fixed class names (`:::person` etc.) | `style <selector> k=v` cascade |
| Needs Mermaid | yes (tested with 11.15.0) | no |
| Opt-in | only if it has `%% constrain:` or `%% @layout`; otherwise left to `mermaid.run()` | always ours (`pre.view`) |

Both end in the same structure: a graph `{items, list, edges, dir}` plus `cons` and `pins`, handed to `finish()` in `core.js`.

## Pipeline
```
front-end -> graph + cons + pins -> elkLayout (start positions) -> solveLayout (Kiwi) -> routeEdges (A*) -> drawSvg -> string
```
Graph items: leaf `{id, lines, style, w, h, parent?}`, boundary `{id, box:true, title, tw, style, parent?}`. Edge `{a, b, lines, open}`. Solved items gain `px py pw ph`; `g.routes` holds polylines.

## Modules (src/)
- `constraints.js` (front-end 1): parse `%%` constraints, `serializeConstraints`, `contentHash`, `fnv1a`. Pure.
- `graph.js` (front-end 1): Mermaid text to graph. Mermaid is a parameter, never imported.
- `view.js` (front-end 2): `parseView`, `viewGraph` (model + view to graph, with relationship roll-up), `serializeView`, `viewHash`, `layoutBlock`. Pure.
- `dsl.js` (model): element/relationship syntax (`person`, `softwareSystem`, `container`, `component`, `a -> b "desc" "tech"`). Exports `parseDsl`, `toMermaid` (used for Mermaid export and the playground), `dslToMermaid`. Line-based: `{` must end its line.
- `shapes.js` (shared): `BASE` style, `kindStyle`, `nodeSize`, `textTop`.
- `layout.js` (shared): `elkLayout`, `solveLayout`.
- `route.js` (shared): `routeEdges`, `straight`, `clip`. Pure.
- `render.js` (shared): `drawSvg`. Pure; returns a self-contained SVG string.
- `core.js`: `build` (front-end 1), `buildView` (front-end 2), `render`, shared `finish`. No DOM writes.
- `interact.js`: `mount` (paint, drag, write-back payload). Browser only. One mount, with a `FRONT` table for the two front-ends.
- `run.js`: `run` (page scan, like `mermaid.run`). Browser only.

## Rules
1. **Pure core.** Everything except `interact.js` and `run.js` must work without a page. Text measurement is injected (`measure(text, font)`); `defaultMeasure` falls back to a character-count estimate when there is no canvas.
2. **Mermaid is injected**, never imported or bundled, so the host controls its version. Pinned/tested: 11.15.0. We rely on the internal `mermaid.mermaidAPI.getDiagramFromText` and `db.getVertices/getSubGraphs/getEdges/getDirection`; vertices may be a `Map` (v11) or object (v10). If this breaks, fix `graph.js` only.
3. **Never store generated Mermaid for view fences.** Views are generated and run in memory. `toMermaid` exists only for export and the playground.
4. **Layout is part of the source.** Hand-written text stays where the user put it; everything generated sits under one marker (`%% @layout` / `layout`), sorted by id, coordinates snapped to a 10px grid, so diffs are small and stable.
5. **Hashes cover only the hand-written part**, so dragging never changes them. Algorithm: FNV-1a, 32-bit, over UTF-8, lowercase 8-char hex.
   - Mermaid fence: remove every `constrain: pin` line and the `%% @layout` line, right-trim.
   - View fence: everything above the `layout` line, right-trimmed.
   The Python implementations in `README.md` must stay byte-identical to these.
6. **Write-back is optimistic.** The client sends `{name, baseHash, ...}`; the server finds the fence by name, returns 409 if its hash differs, else replaces only the generated block. A view with no name still renders but must not save, and the page warns.
7. **Escape everything that reaches SVG.** Text via `esc`, attribute values (including user `style` values) via `at`. The `<pre>` source is HTML-escaped by the server and read back with `textContent`.
8. **SVG is self-contained**: embedded `<style>`, CSS variables with fallbacks (`--mk-bg/--mk-fg/--mk-mut`), `theme: auto|light|dark`. It must work inline, in `<img>`, and saved to disk.
9. **Output is deterministic** for the same input and versions.
10a. **Arrowheads never sit on a bend.** `route.js` makes every edge leave and enter its shape along a straight lead-in (24px source / 32px target, shrinking to 10px when shapes are close), reserves those lanes for the edge, and tries other sides before falling back to a straight line. `test/headless.mjs` asserts the final segment is axis-aligned and at least 10px.
10b. **Non-overlap is built in** (`layout.js`). Kiwi cannot state "must not overlap" (a disjunction), so `solveLayout` solves, finds shapes closer than 20px (shape/shape, shape/foreign boundary, boundary/boundary; a shape may sit inside its own boundaries), picks ONE separating side per pair from the geometry, adds it as a *required* constraint, and solves again (up to 8 rounds). Pins are only `strong`, so a dragged shape pushes others (and boundaries) out of the way instead of overlapping. Rules that keep it consistent: if a boundary around either shape is already too close to the other shape, only the boundary pair gets a rule (independent rules for the contents can contradict it); the chosen side is remembered in `g.ord` while the pair stays close (no flipping sides mid-drag); a rule that cannot be satisfied is dropped and the overlap is reported. On drop, shapes that were pushed are pinned where they ended up, so the saved layout reproduces what was on screen.
10c. **Drag maths uses client-pixel deltas** divided by the scale at drag start, and the picture's top-left (`origin`) is frozen while dragging. Mapping the pointer through the live SVG transform feeds back when the picture's bounds change (e.g. dragging the top-most shape up) and makes shapes accelerate away from the pointer. Do not go back to that.
10d. **Options live in the fence; the host option is only a default.** `edges` (routed|straight) is parsed by `parseOptions` (Mermaid, `%% option: key=value`, not a constraint) and `parseView` (view). `finish()` in `core.js` resolves it: fence value, else host `route`, else routed. Option lines are hand-written, so they are kept by write-back and included in the hashes. Unknown option keys/values produce warnings, not errors.
10. **Dragging uses straight edges** (fast); routing runs on drop and on load. Changing spacing re-runs ELK and drops pins.
11. **Constraints.** Defaults: user constraints `strong`, ELK stay-put `medium`, boundary shrink `weak`, containment and minimum title width `required`. Kiwi cannot express "no overlap"; `solveLayout` only warns about overlaps. Unknown ids and ops are warnings, not exceptions.

## Gotchas already paid for
- Mermaid discards `%%` comments before its parser sees them (even the preprocessed text). Front-end 1 therefore reads constraints itself with a regex; do not try to recover them from Mermaid's db.
- Kiwi throws "the objective is unbounded" if any stay value is `NaN`/`undefined` (e.g. ELK returned no position for an id). Check ids first.
- ELK positions of children are relative to their parent; `elkLayout` accumulates them to absolute.
- The router needs shapes to be real obstacles: ports are snapped to a 10px grid and stubs leave each shape perpendicular.
- In view files `#` starts a comment only when followed by whitespace, so `#08427b` stays a colour.
- `elkjs/lib/elk.bundled.js` is the only entry that works without a worker file.

## Build and test
`npm run build` makes `dist/mermaid-kiwi.iife.min.js` (global `MermaidKiwi`), `.esm.js`, `.core.js`. `npm test` builds, then runs the real Mermaid parser under jsdom against the bundles and exercises both front-ends, write-back, hashes and `run()`. Add a test with every behaviour change. Visual checks: render the SVG, replace `var(--...)` with literals, convert with cairosvg.

## Style of change
Small, boring, readable. No new dependencies without a reason. Keep README, this file, and tasks.md in step with the code. Say plainly what has not been tested.
