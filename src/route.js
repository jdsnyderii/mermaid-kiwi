// Orthogonal edge router: Kiwi-fixed shapes become obstacles; A* finds the paths.
export function clip(n,dx,dy){return Math.min(dx?n.pw/2/Math.abs(dx):1e9,dy?n.ph/2/Math.abs(dy):1e9);}
export function straight(A,B){
  const ax=A.px+A.pw/2,ay=A.py+A.ph/2,bx=B.px+B.pw/2,by=B.py+B.ph/2,dx=bx-ax,dy=by-ay,t1=clip(A,dx,dy),t2=clip(B,-dx,-dy);
  return [[ax+dx*t1,ay+dy*t1],[bx-dx*t2,by-dy*t2]];
}
export function routeEdges(g){
  const G=10,HL=8,N=g.list.filter(i=>!i.box),idx={}; N.forEach((n,i)=>idx[n.id]=i);
  const x0=Math.min(...N.map(n=>n.px)),y0=Math.min(...N.map(n=>n.py)),x1=Math.max(...N.map(n=>n.px+n.pw)),y1=Math.max(...N.map(n=>n.py+n.ph));
  const I0=Math.floor(x0/G)-8,J0=Math.floor(y0/G)-8,NX=Math.ceil(x1/G)+8-I0+1,NY=Math.ceil(y1/G)+8-J0+1,T=NX*NY;
  const core=new Int16Array(T),halo=new Int16Array(T);              // shape cells / keep-clear halo (value = node index+1)
  N.forEach((n,k)=>{for(let j=Math.floor((n.py-HL)/G);j<=Math.ceil((n.py+n.ph+HL)/G);j++)for(let i=Math.floor((n.px-HL)/G);i<=Math.ceil((n.px+n.pw+HL)/G);i++){
    const X=i*G,Y=j*G; if(X<n.px-HL||X>n.px+n.pw+HL||Y<n.py-HL||Y>n.py+n.ph+HL) continue;
    const c=(j-J0)*NX+(i-I0); halo[c]=k+1; if(X>=n.px&&X<=n.px+n.pw&&Y>=n.py&&Y<=n.py+n.ph) core[c]=k+1;}});
  const E=g.edges.map((e,k)=>({k,A:g.items[e.a],B:g.items[e.b]})).filter(e=>e.A!==e.B), grp={};
  const side=(n,m)=>{const dx=m.px+m.pw/2-n.px-n.pw/2,dy=m.py+m.ph/2-n.py-n.ph/2;return Math.abs(dy)*n.pw>Math.abs(dx)*n.ph?(dy<0?0:2):(dx>0?1:3);}; // 0 top,1 right,2 bottom,3 left
  E.forEach(e=>{[['a',e.A,e.B],['b',e.B,e.A]].forEach(([end,n,o])=>{const s=side(n,o);(grp[n.id+':'+s]=grp[n.id+':'+s]||[]).push({e,end,n,s,o});});});
  Object.values(grp).forEach(L=>{                                    // spread ports along each side, snapped to the grid
    const {n,s}=L[0],V=s%2===0,lo=(V?n.px:n.py)+8,hi=(V?n.px+n.pw:n.py+n.ph)-8,mid=q=>V?q.o.px+q.o.pw/2:q.o.py+q.o.ph/2, taken=new Set();
    L.sort((p,q)=>mid(p)-mid(q));
    L.forEach((p,i)=>{
      let v=Math.round((lo+(hi-lo)*(i+1)/(L.length+1))/G)*G; if(v<lo) v=Math.ceil(lo/G)*G; if(v>hi) v=Math.floor(hi/G)*G; if(lo>hi) v=Math.round((lo+hi)/2/G)*G;
      for(let t=0;taken.has(v)&&t<30;t++) v+=G; taken.add(v);
      p.e[p.end]=s===0?{x:v,y:n.py,s}:s===2?{x:v,y:n.py+n.ph,s}:s===1?{x:n.px+n.pw,y:v,s}:{x:n.px,y:v,s};});});
  const cell=(x,y)=>(Math.round(y/G)-J0)*NX+(Math.round(x/G)-I0), used=new Uint8Array(T), DIR=[[0,-1],[1,0],[0,1],[-1,0]], routes=new Array(g.edges.length).fill(null), hp=[];
  const push=(f,s)=>{hp.push([f,s]);let i=hp.length-1;while(i){const p=(i-1)>>1;if(hp[p][0]<=hp[i][0])break;[hp[p],hp[i]]=[hp[i],hp[p]];i=p;}};
  const pop=()=>{const t=hp[0],l=hp.pop();if(hp.length){hp[0]=l;let i=0;for(;;){const a=2*i+1,b=a+1;let m=i;if(a<hp.length&&hp[a][0]<hp[m][0])m=a;if(b<hp.length&&hp[b][0]<hp[m][0])m=b;if(m===i)break;[hp[m],hp[i]]=[hp[i],hp[m]];i=m;}}return t;};
  const len=e=>Math.abs(e.A.px+e.A.pw/2-e.B.px-e.B.pw/2)+Math.abs(e.A.py+e.A.ph/2-e.B.py-e.B.ph/2);
  // Every edge leaves and enters its shape along a straight "lead" (so arrowheads never sit on a bend). If the lead is blocked, try shorter ones.
  const stubOf=(q,lead)=>q.s===0?[q.x,Math.floor((q.y-lead)/G)*G]:q.s===2?[q.x,Math.ceil((q.y+lead)/G)*G]:q.s===1?[Math.ceil((q.x+lead)/G)*G,q.y]:[Math.floor((q.x-lead)/G)*G,q.y];
  const lane=(q,st)=>{const cs=[]; if(q.s%2===0){const lo=Math.min(q.y,st[1]),hi=Math.max(q.y,st[1]);for(let y=Math.ceil(lo/G)*G;y<=hi;y+=G)cs.push(cell(q.x,y));}
    else{const lo=Math.min(q.x,st[0]),hi=Math.max(q.x,st[0]);for(let x=Math.ceil(lo/G)*G;x<=hi;x+=G)cs.push(cell(x,q.y));} return cs;};
  const free=(cs,ia,ib)=>cs.every(c=>(!core[c]||core[c]===ia||core[c]===ib)&&(!halo[c]||halo[c]===ia||halo[c]===ib));
  const find=(e,ia,ib,la,lb)=>{
    const sa=stubOf(e.a,la),sb=stubOf(e.b,lb),ca=lane(e.a,sa),cb=lane(e.b,sb); if(!free(ca,ia,ib)||!free(cb,ia,ib)) return null;
    const sc=cell(sa[0],sa[1]),gc=cell(sb[0],sb[1]),gx=gc%NX,gy=(gc/NX)|0,h=c=>Math.abs(c%NX-gx)+Math.abs(((c/NX)|0)-gy);
    const ban=new Set([...ca,...cb].filter(c=>c!==sc&&c!==gc));   // the lead-in lanes belong to this edge: the path may only join them at the stub, never run along them
    const gs=new Float32Array(T*5).fill(Infinity),from=new Int32Array(T*5).fill(-1); hp.length=0; push(h(sc),sc*5+4); gs[sc*5+4]=0; let end=-1,it=0;
    while(hp.length&&it++<200000){
      const [f,st]=pop(),c=(st/5)|0,d=st%5; if(f>gs[st]+h(c)+1e-3) continue; if(c===gc){end=st;break;}
      for(let nd=0;nd<4;nd++){
        if(d<4&&nd===(d+2)%4) continue;
        const ci=c%NX+DIR[nd][0],cj=((c/NX)|0)+DIR[nd][1]; if(ci<0||cj<0||ci>=NX||cj>=NY) continue;
        const nc=cj*NX+ci; if(ban.has(nc)) continue; if(nc!==gc&&(core[nc]||(halo[nc]&&halo[nc]!==ia&&halo[nc]!==ib))) continue;
        const u=used[nc],same=nd%2?1:2,cost=1+(d<4&&d!==nd?8:0)+((u&same)?10:u?3:0),ns=nc*5+nd,ng=gs[st]+cost;   // bends, overlaps and crossings cost extra
        if(ng<gs[ns]){gs[ns]=ng;from[ns]=st;push(ng+h(nc),ns);}
      }
    }
    if(end<0) return null;
    const cs=[]; for(let q=end;q>=0;q=from[q]) cs.push((q/5)|0); return {cs:cs.reverse(),ca,cb};
  };
  const portAt=(n,s)=>{const gx=Math.round((n.px+n.pw/2)/G)*G,gy=Math.round((n.py+n.ph/2)/G)*G;   // centre of a side, on the grid
    return s===0?{x:gx,y:n.py,s}:s===2?{x:gx,y:n.py+n.ph,s}:s===1?{x:n.px+n.pw,y:gy,s}:{x:n.px,y:gy,s};};
  E.sort((p,q)=>len(p)-len(q)).forEach(e0=>{
    const ia=idx[e0.A.id]+1,ib=idx[e0.B.id]+1; let e=e0,r=null;
    for(const [la,lb] of [[24,32],[16,16],[10,10]]){ r=find(e,ia,ib,la,lb); if(r) break; }
    if(!r) outer: for(const end of ['b','a']) for(let s2=0;s2<4;s2++){        // blocked: leave / enter through a different side
      if(s2===e0[end].s) continue;
      const e2={...e0,[end]:portAt(end==='a'?e0.A:e0.B,s2)};
      for(const [la,lb] of [[16,24],[10,10]]){ r=find(e2,ia,ib,la,lb); if(r){e=e2;break outer;} }
    }
    if(!r){routes[e.k]=straight(e.A,e.B);return;}                    // no path at all: fall back to a straight line
    const {cs,ca,cb}=r;
    for(let i=1;i<cs.length;i++){const o=(cs[i-1]%NX===cs[i]%NX)?2:1; used[cs[i-1]]|=o; used[cs[i]]|=o;}
    ca.forEach(c=>used[c]|=(e.a.s%2?1:2)); cb.forEach(c=>used[c]|=(e.b.s%2?1:2));
    let P=[[e.a.x,e.a.y],...cs.map(c=>[(c%NX+I0)*G,(((c/NX)|0)+J0)*G]),[e.b.x,e.b.y]];
    P=P.filter((p,i)=>!i||p[0]!==P[i-1][0]||p[1]!==P[i-1][1]);
    routes[e.k]=P.filter((p,i)=>{if(!i||i===P.length-1)return true;const a=P[i-1],b=P[i+1];return !((a[0]===p[0]&&p[0]===b[0])||(a[1]===p[1]&&p[1]===b[1]));});
  });
  return routes;
}
