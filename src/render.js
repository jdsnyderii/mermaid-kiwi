// Solved layout -> one self-contained <svg> string (embedded <style>, CSS-variable fallbacks), safe to inline or save as .svg.
import { straight } from './route.js';
import { textTop } from './shapes.js';

const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const at = v => esc(String(v)).replace(/"/g, '&quot;');
const LIGHT = '--bg:var(--mk-bg,#ffffff);--fg:var(--mk-fg,#1c1917);--mut:var(--mk-mut,#78716c)';
const DARK = '--bg:var(--mk-bg,#1c1917);--fg:var(--mk-fg,#fafaf9);--mut:var(--mk-mut,#a8a29e)';
const css = theme => `.mk{${theme === 'dark' ? DARK : LIGHT}}` + (theme === 'auto' ? `@media (prefers-color-scheme:dark){.mk{${DARK}}}` : '') +
  '.mk text{fill:var(--fg);font:12px system-ui,-apple-system,"Segoe UI",sans-serif}.mk .bx{fill:none;stroke:var(--mut);stroke-width:1.3;stroke-dasharray:7 4}' +
  '.mk .bt{font-weight:600;fill:var(--mut)}.mk .e{stroke:var(--mut);stroke-width:1.4;fill:none}.mk .lbl{stroke:var(--bg);stroke-width:5;paint-order:stroke;font-size:11px}' +
  '.mk-edit [data-id]{cursor:grab;touch-action:none}';

function node(n) {
  const { px: x, py: y, pw: w, ph: h } = n, k = n.style, cx = x + w / 2;
  const top = y + (k.shape === 'diamond' || k.shape === 'circle' ? (h - (n.lines.length * 15 + 20)) / 2 : textTop(k));   // centre text in shapes with no flat top
  const st = `fill="${at(k.fill)}" stroke="${at(k.stroke)}" stroke-width="${at(k['stroke-width'])}"` + (k['stroke-dasharray'] ? ` stroke-dasharray="${at(k['stroke-dasharray'])}"` : '');
  let s = `<g data-id="${at(n.id)}">`;
  switch (k.shape) {
    case 'person': s += `<circle cx="${cx}" cy="${y + 16}" r="15" ${st}/><rect x="${x}" y="${y + 30}" width="${w}" height="${h - 30}" rx="14" ${st}/>`; break;
    case 'cylinder': s += `<path d="M${x},${y + 8}a${w / 2},8 0 0 1 ${w},0v${h - 16}a${w / 2},8 0 0 1 -${w},0z" ${st}/><path d="M${x},${y + 8}a${w / 2},8 0 0 0 ${w},0" fill="none" stroke="${at(k.stroke)}"/>`; break;
    case 'circle': s += `<ellipse cx="${cx}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${st}/>`; break;
    case 'hexagon': s += `<polygon points="${x + 18},${y} ${x + w - 18},${y} ${x + w},${y + h / 2} ${x + w - 18},${y + h} ${x + 18},${y + h} ${x},${y + h / 2}" ${st}/>`; break;
    case 'diamond': s += `<polygon points="${cx},${y} ${x + w},${y + h / 2} ${cx},${y + h} ${x},${y + h / 2}" ${st}/>`; break;
    case 'rounded': s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" ${st}/>`; break;
    default: s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" ${st}/>`;
  }
  n.lines.forEach((l, i) => { s += `<text x="${cx}" y="${top + 20 + i * 15}" text-anchor="middle" style="fill:${at(k.color)};${i ? 'font-size:11px' : 'font-weight:700'}">${esc(l)}</text>`; });
  return s + '</g>';
}

export function drawSvg(g, { editable = false, theme = 'auto', margin = 24, origin = null } = {}) {   // origin: keep the top-left fixed (used while dragging)
  const L = g.list, m = margin, RP = (g.routes || []).filter(Boolean).flat();
  const minX = origin ? origin[0] : Math.min(...L.map(i => i.px), ...RP.map(p => p[0])) - m, minY = origin ? origin[1] : Math.min(...L.map(i => i.py), ...RP.map(p => p[1])) - m;
  const W = Math.max(...L.map(i => i.px + i.pw), ...RP.map(p => p[0])) + m - minX, H = Math.max(...L.map(i => i.py + i.ph), ...RP.map(p => p[1])) + m - minY;
  const depth = i => i.parent ? 1 + depth(g.items[i.parent]) : 0;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="mk${editable ? ' mk-edit' : ''}" viewBox="${minX} ${minY} ${W} ${H}" width="${W}" height="${H}" style="max-width:none;display:block"><style>${css(theme)}</style>` +
    `<defs><marker id="mk-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--mut)"/></marker></defs>`;
  L.filter(i => i.box).sort((a, b) => depth(a) - depth(b)).forEach(b => {
    const bs = b.style || {};
    s += `<rect class="bx" x="${b.px}" y="${b.py}" width="${b.pw}" height="${b.ph}" rx="10"${bs.stroke ? ` style="stroke:${at(bs.stroke)}"` : ''}${bs.fill ? ` fill="${at(bs.fill)}"` : ''}/><text class="bt" x="${b.px + 14}" y="${b.py + 24}"${bs.color ? ` style="fill:${at(bs.color)}"` : ''}>${esc(b.title)}</text>` +
      `<rect data-id="${at(b.id)}" x="${b.px}" y="${b.py}" width="${b.pw}" height="32" fill="transparent"/>`; });
  g.edges.forEach((e, k) => {
    const A = g.items[e.a], B = g.items[e.b]; if (A === B) return;
    const P = (g.routes && g.routes[k]) || straight(A, B);
    s += `<polyline class="e" points="${P.map(p => p[0] + ',' + p[1]).join(' ')}" stroke-dasharray="6 4" stroke-linejoin="round"${e.open ? '' : ' marker-end="url(#mk-ar)"'}/>`;
    let bi = 0, bl = -1; for (let i = 0; i < P.length - 1; i++) { const l = Math.abs(P[i + 1][0] - P[i][0]) + Math.abs(P[i + 1][1] - P[i][1]); if (l > bl) { bl = l; bi = i; } }
    const mx = (P[bi][0] + P[bi + 1][0]) / 2, my = (P[bi][1] + P[bi + 1][1]) / 2;
    e.lines.forEach((l, i) => { s += `<text class="lbl" x="${mx}" y="${my + (i - (e.lines.length - 1) / 2) * 13 + 4}" text-anchor="middle">${esc(l)}</text>`; });
  });
  L.filter(i => !i.box).forEach(n => { s += node(n); });
  return s + '</svg>';
}
