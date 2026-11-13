(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.FloorPlateFEM=factory();
})(globalThis,function(){
  'use strict';
  const version='floor-plate.bfs.v1';
  const gauss=[[-.8611363115940526,.3478548451374538],[-.3399810435848563,.6521451548625461],[.3399810435848563,.6521451548625461],[.8611363115940526,.3478548451374538]];
  const buffer=n=>new Float64Array(n);
  function numeric(value,label,positive=false){
    if((typeof value!=='number' && (typeof value!=='string'||!value.trim())) || !Number.isFinite(Number(value)) || (positive && !(Number(value)>0)))throw Error(label+' 缺值或數值無效。');
    return Number(value);
  }
  function label(s,name){if(typeof s!=='string'||!s.trim())throw Error('請填'+name+'。');return s.trim();}
  const loadHeaders=['項次','x_m','y_m','接觸寬_m','接觸深_m','荷重_kN','動力係數','來源'];
  const pointHeaders=['觀察點','x_m','y_m'];
  function records(text,headers){
    const lines=String(text??'').replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/),first=lines.shift().split('\t');
    if(first.length!==headers.length||headers.some((h,i)=>first[i].trim()!==h))throw Error('請保留表頭：'+headers.join('、'));
    const ids=new Set();
    return lines.filter(s=>s.trim()).map((line,i)=>{
      const r=line.split('\t').map(v=>v.trim());
      if(r.length!==headers.length || !r[0] || ids.has(r[0]))throw Error(headers[0]+'第 '+(i+2)+' 列欄數不足、缺號或重號。');
      ids.add(r[0]);return r;
    });
  }
  function normalize(raw){
    const a={caseId:label(raw.caseId,'案件／板區識別'),basis:label(raw.basis,'材料、地基與邊界依據'),face:raw.face,joint:raw.joint};
    for(const k of ['width','depth','hMm','eMpa','kMNm3'])a[k]=numeric(raw[k],k,true);
    a.nu=numeric(raw.nu,'泊松比');if(!(a.nu>0&&a.nu<.5))throw Error('泊松比須介於 0 與 0.5。');
    a.angle=numeric(raw.angle,'應力方向');a.mesh=numeric(raw.mesh,'網格');
    if(![8,12,16,24].includes(a.mesh)||!['top','bottom'].includes(a.face))throw Error('請選取板面及網格。');
    if(!['none','free'].includes(a.joint))throw Error('請確認板界與接縫傳力模型。');
    function cuts(value,L){
      const s=String(value??'').trim();if(!s)return [];
      const coords=s.split(/[\s,，]+/).map(v=>numeric(v,'接縫位置',true)).sort((x,y)=>x-y);
      if(coords.some((x,i)=>x>=L||x===coords[i-1]))throw Error('接縫須在板內且不得重複。');
      return coords;
    }
    a.jointsX=cuts(raw.jointsX,a.width);a.jointsY=cuts(raw.jointsY,a.depth);
    if((a.joint==='none')!==(a.jointsX.length+a.jointsY.length===0))throw Error('接縫座標與選定的傳力假設不符。');
    a.loads=records(raw.loads,loadHeaders).map(([id,x,y,b,d,p,f,src])=>{
      x=numeric(x,id+' x');y=numeric(y,id+' y');b=numeric(b,id+' 接觸寬',true);d=numeric(d,id+' 接觸深',true);
      p=numeric(p,id+' 荷重',true);f=numeric(f,id+' 動力係數',true);
      if(x-b/2 < -1e-10 || x+b/2>a.width+1e-10 || y-d/2 < -1e-10 || y+d/2>a.depth+1e-10)throw Error(id+' 接觸面伸出板界，請核對實際作用面與荷重。');
      return {id,x,y,b,d,p,f,src:label(src,id+' 載重來源'),effective:p*f};
    });
    if(!a.loads.length)throw Error('請填至少一個輪位或腳位。');
    a.points=records(raw.points,pointHeaders).map(([id,x,y])=>{
      x=numeric(x,id+' x');y=numeric(y,id+' y');
      if(x<0||x>a.width||y<0||y>a.depth)throw Error(id+' 觀察點超出板界。');
      return {id,x,y};
    });
    if(!a.points.length)throw Error('請填至少一個觀察點。');
    return a;
  }
  // 1D cubic Hermite functions for w and its physical slope at the two ends.
  function hermite(t,l){
    const u=t*t,v=u*t;
    return [[1-3*u+2*v,(t-2*u+v)*l,3*u-2*v,(-u+v)*l],
      [(-6*t+6*u)/l,1-4*t+3*u,(6*t-6*u)/l,-2*t+3*u],
      [(-6+12*t)/(l*l),(-4+6*t)/l,(6-12*t)/(l*l),(-2+6*t)/l]];
  }
  function shapes(tx,ty,hx,hy){
    const X=hermite(tx,hx),Y=hermite(ty,hy),N=buffer(16),xx=buffer(16),yy=buffer(16),xy=buffer(16);
    for(let n=0;n<16;n++){
      const x=(n&4?2:0)+(n&1),y=(n&8?2:0)+(n&2?1:0);
      N[n]=X[0][x]*Y[0][y];xx[n]=X[2][x]*Y[0][y];yy[n]=X[0][x]*Y[2][y];xy[n]=X[1][x]*Y[1][y];
    }
    return {N,xx,yy,xy};
  }
  function stiffness(hx,hy,D,nu,k){
    const K=buffer(256),reaction=buffer(16);
    for(const [x,wx] of gauss)for(const [y,wy] of gauss){
      const {N,xx,yy,xy}=shapes((x+1)/2,(y+1)/2,hx,hy),w=wx*wy*hx*hy/4;
      for(let i=0;i<16;i++){
        reaction[i]+=w*k*N[i];
        for(let j=0;j<=i;j++)K[16*i+j]+=w*(D*(xx[i]*xx[j]+yy[i]*yy[j]+nu*(xx[i]*yy[j]+yy[i]*xx[j])+2*(1-nu)*xy[i]*xy[j])+k*N[i]*N[j]);
      }
    }
    return {K,reaction};
  }
  function factorBand(A,n,stride){
    for(let i=0;i<n;i++){
      const row=i*stride,first=Math.max(0,i-stride+1);
      for(let j=first;j<i;j++){
        let sum=A[row+i-j],other=j*stride;
        for(let l=first;l<j;l++)sum-=A[row+i-l]*A[other+j-l];
        A[row+i-j]=sum/A[other];
      }
      let pivot=A[row];for(let j=first;j<i;j++)pivot-=A[row+i-j]**2;
      if(!(pivot>0)||!Number.isFinite(pivot))throw Error('板剛度矩陣不穩定，請檢查材料、細長板塊與網格。');
      A[row]=Math.sqrt(pivot);
    }
  }
  function solveBand(L,b,stride){
    const n=b.length;
    for(let i=0;i<n;i++){
      let s=b[i];for(let d=1;d<stride&&d<=i;d++)s-=L[i*stride+d]*b[i-d];
      b[i]=s/L[i*stride];
    }
    for(let i=n-1;i>=0;i--){
      let s=b[i];for(let d=1;d<stride&&i+d<n;d++)s-=L[(i+d)*stride+d]*b[i+d];
      b[i]=s/L[i*stride];
    }
    return b;
  }
  function meshAxis(start,end,step,spans,targetCount){
    const n=Math.max(1,Math.ceil((end-start)/step-1e-12)),coarse=(end-start)/n,edges=[start];
    for(let i=0;i<n;i++){
      const l=start+i*coarse,r=l+coarse;
      let target=coarse;
      for(const [lo,hi,size] of spans)if(hi>=l-coarse*.5 && lo<=r+coarse*.5)target=Math.min(target,size/targetCount);
      if((i===0 && spans.some(([lo,hi])=>lo<=start+1e-10 && hi>start)) ||
         (i===n-1 && spans.some(([lo,hi])=>hi>=end-1e-10 && lo<end)))target/=4;
      const split=Math.min(32,2**Math.max(0,Math.ceil(Math.log2(coarse/target)-1e-10)));
      for(let j=1;j<=split;j++)edges.push(j===split&&i===n-1?end:l+coarse*j/split);
    }
    return edges;
  }
  function cellAt(edges,value){
    let lo=0,hi=edges.length-1;
    while(lo+1<hi){const m=(lo+hi)>>1;if(value<edges[m])hi=m;else lo=m;}
    return lo;
  }
  function buildPanel(a,x0,x1,y0,y1,step,panel,resolution){
    const active=a.loads.filter(l=>l.x+l.b/2>x0 && l.x-l.b/2<x1 && l.y+l.d/2>y0 && l.y-l.d/2<y1);
    const xe=meshAxis(x0,x1,step,active.map(l=>[l.x-l.b/2,l.x+l.b/2,l.b]),resolution/8);
    const ye=meshAxis(y0,y1,step,active.map(l=>[l.y-l.d/2,l.y+l.d/2,l.d]),resolution/8);
    const nx=xe.length-1,ny=ye.length-1,h=a.hMm/1000,D=a.eMpa*1000*h**3/(12*(1-a.nu*a.nu)),k=a.kMNm3*1000;
    const n=4*(nx+1)*(ny+1),stride=4*(Math.min(nx,ny)+2)+4;
    if(n*stride>20e6)throw Error('此板區的矩陣超出瀏覽器記憶體配置。請使用較疏網格或以離線求解器分析。');
    const L=buffer(n*stride),spring=buffer(n),cache=new Map();
    const index=(i,j)=>4*(nx<=ny ? j*(nx+1)+i : i*(ny+1)+j);
    function nodes(i,j){
      const bases=[index(i,j),index(i+1,j),index(i,j+1),index(i+1,j+1)];
      return Array.from({length:16},(_,q)=>bases[q>>2]+(q&3));
    }
    const cells=[];
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const hx=xe[i+1]-xe[i],hy=ye[j+1]-ye[j],key=hx.toPrecision(12)+'|'+hy.toPrecision(12);
      if(!cache.has(key))cache.set(key,stiffness(hx,hy,D,a.nu,k));
      const {K,reaction}=cache.get(key),ids=nodes(i,j);cells.push(ids);
      for(let q=0;q<16;q++){
        spring[ids[q]]+=reaction[q];
        for(let s=0;s<=q;s++){
          const I=Math.max(ids[q],ids[s]),J=Math.min(ids[q],ids[s]);L[I*stride+I-J]+=K[q*16+s];
        }
      }
    }
    const diagonal=buffer(n);
    for(let i=0;i<n;i++)diagonal[i]=Math.sqrt(L[i*stride]);
    for(let i=0;i<n;i++)for(let d=0;d<stride && d<=i;d++)L[i*stride+d]/=diagonal[i]*diagonal[i-d];
    factorBand(L,n,stride);
    const sum=buffer(n),parts=[],forces=[];
    for(const load of a.loads){
      const left=Math.max(x0,load.x-load.b/2),right=Math.min(x1,load.x+load.b/2);
      const lower=Math.max(y0,load.y-load.d/2),upper=Math.min(y1,load.y+load.d/2);
      const pressure=load.effective/(load.b*load.d);
      if(right<=left||upper<=lower){parts.push(null);forces.push({id:load.id,applied:0,reaction:0});continue;}
      const rhs=buffer(n);
      for(let j=cellAt(ye,lower);j<ny && ye[j]<upper;j++)for(let i=cellAt(xe,left);i<nx&&xe[i]<right;i++){
        const X=xe[i],Y=ye[j],hx=xe[i+1]-X,hy=ye[j+1]-Y,xa=Math.max(left,X),xb=Math.min(right,X+hx),ya=Math.max(lower,Y),yb=Math.min(upper,Y+hy);
        if(xb<=xa||yb<=ya)continue;
        const ids=cells[j*nx+i],w=pressure*(xb-xa)*(yb-ya)/4;
        for(const [gx,wx] of gauss)for(const [gy,wy] of gauss){
          const tx=(xa-X+(1+gx)*(xb-xa)/2)/hx,ty=(ya-Y+(1+gy)*(yb-ya)/2)/hy;
          const {N}=shapes(tx,ty,hx,hy);for(let m=0;m<16;m++)rhs[ids[m]]+=w*wx*wy*N[m];
        }
      }
      for(let i=0;i<n;i++)rhs[i]/=diagonal[i];
      const u=solveBand(L,rhs,stride);
      for(let i=0;i<n;i++)u[i]/=diagonal[i];
      let force=0;for(let i=0;i<n;i++){sum[i]+=u[i];force+=u[i]*spring[i];}
      parts.push(u);forces.push({id:load.id,applied:pressure*(right-left)*(upper-lower),reaction:force});
    }
    const angle=a.angle*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);
    const f=(a.face==='bottom'?-1:1)*6*D/(h*h*1000);
    function read(i,j,tx,ty,detail=false){
      const hx=xe[i+1]-xe[i],hy=ye[j+1]-ye[j],ids=cells[j*nx+i],{N,xx,yy,xy}=shapes(tx,ty,hx,hy);
      function response(u){
        let w=0,xxv=0,yyv=0,xyv=0;
        if(u)for(let s=0;s<16;s++){
          const v=u[ids[s]];w+=N[s]*v;xxv+=xx[s]*v;yyv+=yy[s]*v;xyv+=xy[s]*v;
        }
        const sx=f*(xxv+a.nu*yyv),sy=f*(yyv+a.nu*xxv),tau=f*(1-a.nu)*xyv;
        return {stress:sx*co*co+sy*si*si+2*tau*si*co,sx,sy,tau,wMm:w*1000};
      }
      const r={panel,i,j,tx,ty,x:xe[i]+tx*hx,y:ye[j]+ty*hy,...response(sum)};
      if(detail)r.parts=parts.map((u,k)=>({id:a.loads[k].id,...response(u)}));
      return r;
    }
    // At a C1 element boundary, curvature can have two different traces.
    function locate(x,y){
      if(x<x0-1e-10||x>x1+1e-10||y<y0-1e-10||y>y1+1e-10)return [];
      function axis(v,edges){
        const i=cellAt(edges,v),t=(v-edges[i])/(edges[i+1]-edges[i]);
        if(t<1e-8)return i>0?[[i-1,1],[i,0]]:[[i,0]];
        if(t>1-1e-8)return i+2<edges.length?[[i,1],[i+1,0]]:[[i,1]];
        return [[i,t]];
      }
      const hits=[];for(const [i,tx] of axis(x,xe))for(const [j,ty] of axis(y,ye))hits.push([i,j,tx,ty]);
      return hits;
    }
    return {panel,x0,x1,y0,y1,nx,ny,xe,ye,forces,read,locate};
  }
  function evaluate(a,resolution){
    const X=[0,...a.jointsX,a.width],Y=[0,...a.jointsY,a.depth];
    const step=Math.max(a.width,a.depth)/resolution,panels=[],observations=[],map=[];
    const targets=[...a.points];
    for(const l of a.loads)for(const dx of [-.5,0,.5])for(const dy of [-.5,0,.5])targets.push({x:l.x+dx*l.b,y:l.y+dy*l.d});
    let max=null,min=null,minW=null;
    for(let j=0;j<Y.length-1;j++)for(let i=0;i<X.length-1;i++){
      const p=buildPanel(a,X[i],X[i+1],Y[j],Y[j+1],step,(i+1)+'-'+(j+1),resolution);
      const heat=[],points=[];let high=null,low=null;
      const track=r=>{
        if(!high||r.stress>high.stress)high=r;
        if(!low||r.stress<low.stress)low=r;
        if(!minW || r.wMm<minW.wMm)minW={x:r.x,y:r.y,panel:r.panel,wMm:r.wMm};
      };
      for(let y=0;y<p.ny;y++)for(let x=0;x<p.nx;x++){
        for(const ty of [0,.5,1])for(const tx of [0,.5,1]){
          const r=p.read(x,y,tx,ty);track(r);if(tx===.5&&ty===.5)heat.push(r.stress);
        }
      }
      for(const t of targets)for(const hit of p.locate(t.x,t.y)){
        const r=p.read(...hit,t.id!==undefined);track(r);if(t.id!==undefined)points.push({...r,id:t.id});
      }
      function detailed(r){return p.read(r.i,r.j,r.tx,r.ty,true);}
      if(!max||high.stress>max.stress)max=detailed(high);
      if(!min||low.stress<min.stress)min=detailed(low);
      observations.push(...points);map.push(heat);
      const {read,locate,...info}=p;panels.push(info);
    }
    const applied=panels.reduce((s,p)=>s+p.forces.reduce((v,f)=>v+f.applied,0),0);
    const total=a.loads.reduce((s,l)=>s+l.effective,0);
    const balance=panels.reduce((s,p)=>s+p.forces.reduce((v,f)=>v+Math.abs(f.reaction-f.applied),0),0);
    if(!Number.isFinite(max.stress+min.stress+balance)||Math.abs(applied-total)>1e-7*Math.max(1,total)||balance>1e-6*Math.max(1,total))throw Error('荷載積分或地盤反力平衡殘差過大，請核對網格與板區幾何。');
    return {resolution,panels,observations,max,min,minW,map,applied,balance};
  }
  function calculate(raw){
    const input=normalize(raw),coarse=evaluate(input,input.mesh),fine=evaluate(input,input.mesh*2);
    return {version,input,coarse:{resolution:coarse.resolution,panels:coarse.panels,max:coarse.max,min:coarse.min,observations:coarse.observations,applied:coarse.applied,balance:coarse.balance},fine};
  }
  return Object.freeze({version,loadHeaders,pointHeaders,normalize,evaluate,calculate});
});
