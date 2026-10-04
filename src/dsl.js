// Structurizr DSL (subset) -> Mermaid flowchart text. Pure.
export const TL={person:'Person',softwaresystem:'Software System',container:'Container',component:'Component'};
export function parseDsl(text){
  const els=[],ids={},rels=[],warns=[],stack=[{k:'m'}]; let hier=false;
  const toks=l=>[...l.matchAll(/"([^"]*)"|(->|[{}=])|([^\s"{}=]+)/g)].map(m=>m[1]!==undefined?{s:m[1],q:1}:{s:m[2]||m[3]});
  text.replace(/\/\*[\s\S]*?\*\//g,'').split('\n').forEach(raw=>{
    let t=toks(raw.replace(/(^|\s)(\/\/|#).*$/,'')); if(!t.length) return;
    const top=stack[stack.length-1];
    if(t[0].s==='}'&&!t[0].q){if(stack.length>1) stack.pop(); return;}
    const op=t[t.length-1].s==='{'&&!t[t.length-1].q; if(op) t.pop();
    let id=null; if(t[1]&&t[1].s==='='&&!t[1].q){id=t[0].s;t=t.slice(2);}
    const kw=t[0]&&!t[0].q?t[0].s.toLowerCase():'', a=t.slice(1).filter(x=>x.q).map(x=>x.s); let next={k:'o'};
    if(top.k!=='o'){
      if(/^(person|softwaresystem|container|component)$/.test(kw)){
        const tc=kw==='container'||kw==='component', n=els.length;
        const el={n,type:kw,name:a[0]||id||kw,desc:a[1]||'',tech:tc?a[2]||'':'',tags:(tc?a[3]:a[2])||'',parent:top.k==='e'?top.el:null,kids:[]};
        const key=id||'_e'+n; el.path=hier&&el.parent?el.parent.path+'.'+key:key;
        ids[el.path]=el; if(!ids[key]) ids[key]=el;
        els.push(el); if(el.parent) el.parent.kids.push(el); if(op) next={k:'e',el};
      }else if(kw==='group'||kw==='enterprise') next={...top};
      else if(kw==='workspace'||kw==='model') next={k:'m'};
      else if(top.k==='e'&&kw==='tags') top.el.tags+=','+a.join(',');
      else if(top.k==='e'&&kw==='description') top.el.desc=a[0]||'';
      else if(top.k==='e'&&kw==='technology') top.el.tech=a[0]||'';
      else if(t.some(x=>x.s==='->'&&!x.q)){
        const i=t.findIndex(x=>x.s==='->'&&!x.q), b=t.slice(i+2).filter(x=>x.q).map(x=>x.s);
        rels.push({L:i?t[0].s:'this',R:(t[i+1]||{}).s,ctx:top.el,desc:b[0]||'',tech:b[1]||''});
      }else if(kw==='!identifiers'&&/hier/i.test((t[1]||{}).s||'')) hier=true;
    }
    if(op) stack.push(next);
  });
  rels.forEach(r=>{const f=n=>n==='this'?r.ctx:ids[n]; r.a=f(r.L); r.b=f(r.R); if(!r.a||!r.b) warns.push('unresolved relationship '+r.L+' -> '+r.R);});
  return {els,ids,rels:rels.filter(r=>r.a&&r.b),warns};
}
export function buildViews(m){
  const v=[{label:'All (nested)',all:1},{label:'System context'}];
  m.els.filter(e=>e.kids.length&&e.type==='softwaresystem').forEach(e=>v.push({label:'Containers: '+e.name,scope:e}));
  m.els.filter(e=>e.kids.length&&e.type==='container').forEach(e=>v.push({label:'Components: '+e.name,scope:e}));
  return v;
}
export function toMermaid(m,v,dir){
  const anc=e=>e.parent?[...anc(e.parent),e]:[e], chain=v.scope?anc(v.scope):[];
  // representative = highest ancestor that sits just outside the scope chain (Structurizr-style roll-up)
  const rep=e=>{if(v.all) return e; for(const a of anc(e)) if(!chain.includes(a)&&(!a.parent||chain.includes(a.parent))) return a; return null;};
  const vis=new Set(), box=new Set(), E=new Map(), ids=new Map();
  m.rels.forEach(r=>{const a=rep(r.a),b=rep(r.b); if(!a||!b||a===b||(v.all&&(a.kids.length||b.kids.length))) return;
    const lb=[r.desc,r.tech&&'['+r.tech+']'].filter(Boolean).join('<br/>'), k=[a.n,b.n,lb].join('|');
    if(!E.has(k)){E.set(k,{a,b,lb});vis.add(a);vis.add(b);}});
  if(v.all){m.els.forEach(e=>{vis.add(e);if(e.kids.length) box.add(e);});}
  else if(v.scope){vis.add(v.scope);v.scope.kids.forEach(k=>vis.add(k));box.add(v.scope);}
  else m.els.filter(e=>!e.parent).forEach(e=>vis.add(e));
  const mid=e=>{if(!ids.has(e)){let s=e.path.replace(/\W/g,'_'); if(/^(end|graph|subgraph|flowchart|style|class|click|default|call|href|direction)$/i.test(s)) s+='_';
      let u=s,i=2; while([...ids.values()].includes(u)) u=s+i++; ids.set(e,u);} return ids.get(e);};
  const q=s=>s.replace(/"/g,'#quot;'), ty=e=>'['+TL[e.type]+(e.tech?': '+e.tech:'')+']';
  const L=['flowchart '+dir];
  const emit=(e,p)=>{
    if(box.has(e)){L.push(p+`subgraph ${mid(e)}["${q(e.name+' '+ty(e))}"]`);e.kids.filter(k=>vis.has(k)).forEach(k=>emit(k,p+'  '));L.push(p+'end');return;}
    const ext=/external|existing/i.test(e.tags), db=/database/i.test(e.tags), cls=ext?'ext':db?'db':({person:'person',container:'container',component:'component'})[e.type];
    const t=q([e.name,ty(e),e.desc].filter(Boolean).join('<br/>'));
    L.push(p+mid(e)+(db?`[("${t}")]`:`["${t}"]`)+(cls?':::'+cls:''));};
  [...vis].filter(e=>!box.has(e.parent)).forEach(e=>emit(e,'  '));
  E.forEach(x=>L.push(`  ${mid(x.a)} -.->${x.lb?`|"${q(x.lb)}"|`:''} ${mid(x.b)}`));
  return L.join('\n');
}

export const dslViews = text => buildViews(parseDsl(text)).map(v => v.label);
// view: index or label. Returns the Mermaid source plus the list of views, so a UI can offer a picker.
export function dslToMermaid(text, { view = -1, dir = 'TB' } = {}) {
  const m = parseDsl(text), V = buildViews(m);
  let i = typeof view === 'string' ? V.findIndex(v => v.label === view) : view;
  if (i < 0 || i >= V.length) i = Math.max(1, V.findIndex(v => /^Containers/.test(v.label)));
  return { mermaid: toMermaid(m, V[i], dir), views: V.map(v => v.label), index: i, warnings: m.warns };
}

