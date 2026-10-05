# tasks.md: open items

Status key: [ ] open, [~] partly done. Nothing below has been verified in a real browser unless stated.

## Needs verifying first
- [ ] Open `demo/playground.html` (also published standalone), `demo/static.html`, `demo/views.html`, `demo/playground.html` in a real browser (desktop and phone). Only the Node/jsdom tests have run. Drag, pointer capture on touch, and `getScreenCTM` conversion are untested.
- [ ] Add a headless test that loads the IIFE bundle (`dist/mermaid-kiwi.iife.min.js`); tests currently cover core and esm only.
- [ ] Confirm the CDN-free setup: vendor `mermaid.min.js` (11.15.0) into the Docker image and serve it as a static asset.

- [ ] Playground's "compare with plain Mermaid" toggle failed under jsdom (no `getBBox`); confirm it works in a real browser. Print via Ctrl/Cmd+P is wired (light palette swap on `beforeprint`) but untested.

- [ ] Verify in a real browser: dragging inside and out of boundaries (speed now 1:1 with the pointer; tested only with simulated events in jsdom), and the new push-away behaviour on touch devices.
- [ ] Push-away is greedy: one separating side per pair, up to 8 rounds. Dense diagrams can still end with a reported overlap; consider a smarter pass (or letting the user lock a shape so it is never pushed).
- [ ] Frozen frame while dragging clips shapes dragged past the top/left of the original picture until drop; consider padding the frame.

- [ ] Edge options beyond routing: `edges` is the only option today; candidates are per-view `spacing`, `theme`, and arrowhead/line style. Keep Mermaid `%% option:` and view statements in step.

## Viewer integration (Python / Docker)
- [ ] Write-back endpoint. Contract is in `README.md`. Framework still undecided (FastAPI/Flask/Starlette/stdlib).
  - [ ] Find the fence by name (view) or hash (mermaid); 409 on hash mismatch; replace only the generated block.
  - [ ] Atomic write, preserve file mode; bind-mount the directory (not the single file); run as the file owner's UID.
  - [ ] Confine writes to the docs root (reject `..`, absolute paths, symlinks out).
  - [ ] Decide how the endpoint learns the file path (`data-file` attribute from the include function?).
- [ ] Markdown fence formatters: `view` -> `<pre class="view" data-name data-hash>`; `mermaid` -> `<pre class="mermaid" data-hash>`; HTML-escape the source.
- [ ] Model loading in the viewer: server endpoint for `model <path>` (confined to the docs root) or pass `models`/`loadModel` from the include function.
- [ ] Glue script (~30 lines): call `run({editable:true, onChange})` and POST the payload.

## View language
- [ ] Validate and enforce view names (lowercase letters, digits, hyphens); detect duplicate names within a file and disable saving for both.
- [ ] Render `title` (currently parsed and stored in `g.title` but not drawn; add an SVG `<title>`/caption and drop the placeholder `|| true` assertion in `test/headless.mjs`).
- [ ] Warn about orphaned pins (ids no longer in the model). Today they are silently ignored.
- [ ] More scoping: `include neighbors(x)`, per-view label overrides, `collapse`.
- [ ] Relationship styles (colour, dash, thickness, per-pair) and a per-view `route straight|orthogonal` option.
- [ ] Style presets (`theme structurizr`) and more properties (`font-size`, `opacity`).
- [ ] "Export Mermaid" for view fences (build Mermaid text from `viewGraph`; `toMermaid` currently only works from the model + old view picker).
- [ ] Tests for `all`, `hide`, `include`, `!identifiers hierarchical` with view ids, and conflicting constraints.
- [ ] Model syntax may be redesigned later; keep it behind `parseDsl`.

## Mermaid front-end
- [ ] Emit `classDef` lines from the translator so plain-Mermaid renderers (GitHub) get colours; document that the person shape is lost there.
- [ ] Optional own parser for the flowchart subset to drop the dependency on Mermaid internals and the DOM.
- [ ] Re-check against each new Mermaid release (bump process: change pin, run `npm test`).

## Rendering and routing
- [ ] Print: `@media print` forces the light palette, scales SVG to page width, `break-inside: avoid`. Not tested in a browser.
- [~] Arrowheads on bends: edges now leave and enter every shape along a straight lead-in (24/32px, shrinking to 10px when shapes are close), the router tries other sides when a lead is blocked, and lead lanes are reserved. Still open: where shapes are only ~20px apart (e.g. stacked containers) the lead is short, and in the Components view the Security shape gets a small loop where two edges share a crowded side (no per-side port reservation across edges yet).
- [ ] Parallel edges between the same pair draw on top of each other; label collisions.
- [ ] Edges can cross boundary titles; boundaries are transparent to the router.
- [ ] Router performance on large graphs (A* is capped at 200k iterations per edge, then falls back to a straight line).
- [ ] Overlap handling after pinning: only a warning today. Consider an optional push-apart pass.
- [ ] Accessibility: `role="img"`, `<title>`/`<desc>`, keyboard-movable shapes.
- [ ] Touch: dragging a shape vs scrolling the page.

## Housekeeping
- [ ] Keep the Python hash functions in `README.md` byte-identical to `contentHash`/`viewHash`; add a cross-language test vector.
- [ ] Publish the three bundles as release artifacts; consider minifying the core bundle.
