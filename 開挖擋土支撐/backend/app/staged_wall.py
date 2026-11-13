"""One-metre wall strip, z down, u towards the excavation. Units are kN and m."""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)


class Layer(Input):
    bottom: float = Field(gt=0)
    kh: float = Field(ge=0)
    pressure_top: float
    pressure_bottom: float
    lower: float | None = Field(default=None, le=0)
    upper: float | None = Field(default=None, ge=0)
    basis: str = Field(min_length=1)


class Stage(Input):
    id: str = Field(min_length=1)
    cut: float = Field(ge=0)
    outside_water: float = Field(ge=0)
    inside_water: float = Field(ge=0)
    earth_factor: float = Field(ge=0)
    water_factor: float = Field(ge=0)
    basis: str = Field(min_length=1)


class Support(Input):
    id: str = Field(min_length=1)
    depth: float = Field(ge=0)
    spacing: float = Field(gt=0)
    stiffness: float = Field(gt=0)
    preload: float = Field(ge=0)
    install: str = Field(min_length=1)
    remove: str | None = None
    law: Literal["bilateral", "compression"]
    basis: str = Field(min_length=1)


class Comparison(Input):
    stage: str
    depth: float = Field(ge=0)
    kind: Literal["external", "measurement"]
    quantity: Literal["u", "M", "V", "R"]
    unit: str
    value: float
    side: Literal["above", "below"] = "below"
    support: str | None = None
    source: str = Field(min_length=1)


class WallCase(Input):
    case_id: str = Field(min_length=1)
    basis: str = Field(min_length=1)
    length: float = Field(gt=0)
    ei: float = Field(gt=0)
    water_weight: float = Field(gt=0)
    step: float = Field(gt=0)
    toe: Literal["fixed", "pinned", "free"]
    soil_law: Literal["linear", "plastic"]
    layers: list[Layer] = Field(min_length=1)
    stages: list[Stage] = Field(min_length=1)
    supports: list[Support]
    comparisons: list[Comparison]


VERSION = "staged-wall.eb.v1"
GAUSS = ((-.8611363115940526, .3478548451374538), (-.3399810435848563, .6521451548625461),
         (.3399810435848563, .6521451548625461), (.8611363115940526, .3478548451374538))
# Multipliers convert the observation to the intrinsic result units: mm, kN·m/m, kN/m, kN per strut.
UNITS = {"u": {"mm": 1., "m": 1000., "cm": 10.}, "M": {"kN·m/m": 1., "tf·m/m": 9.80665},
         "V": {"kN/m": 1., "tf/m": 9.80665}, "R": {"kN": 1., "tf": 9.80665}}


def validate(case):
    stages = [s.id for s in case.stages]
    if len(set(stages)) != len(stages):
        raise ValueError("階段識別不可重複，外部檔的同號事件請分列。")
    if abs(case.layers[-1].bottom-case.length) > 1e-9 or any(a.bottom >= b.bottom for a,b in zip(case.layers,case.layers[1:])):
        raise ValueError("土層底深須遞增且最後一層達壁趾。")
    if case.soil_law == "plastic" and any(a.lower is None or a.upper is None or a.lower >= a.upper for a in case.layers):
        raise ValueError("彈塑性模型各層需負向／正向兩個相異反力界限（含零）。")
    if case.soil_law == "linear" and any(a.lower is not None or a.upper is not None for a in case.layers):
        raise ValueError("線彈性模型不使用限值；請移除上下限或選彈塑性。")
    if any(s.cut>case.length for s in case.stages) or any(a.cut>b.cut for a,b in zip(case.stages,case.stages[1:])):
        raise ValueError("開挖深度須在壁長內並依序不減；回填另建材料與啟用基準。")
    supports = {s.id:s for s in case.supports}
    if len(supports)!=len(case.supports):
        raise ValueError("支撐識別重複。")
    for s in case.supports:
        if s.depth>case.length or s.install not in stages or (s.remove is not None and
              (s.remove not in stages or stages.index(s.remove)<=stages.index(s.install))):
            raise ValueError(s.id+" 支撐深度或啟閉階段無效。")
    for c in case.comparisons:
        if c.stage not in stages or c.depth>case.length or c.unit not in UNITS[c.quantity]:
            raise ValueError("比較列須對應已列階段、牆段深度與同量綱單位。")
        if c.quantity=="R" and (c.support not in supports or abs(supports[c.support].depth-c.depth)>1e-8):
            raise ValueError("支撐力比較須對應同一支撐識別與深度。")
        if c.quantity in ("M","V") and ((c.side=="above" and c.depth==0) or (c.side=="below" and c.depth==case.length)):
            raise ValueError("邊端比較請選牆內側的取值方向。")


def grid(case,step):
    marks={0.,case.length}
    marks.update(s.bottom for s in case.layers)
    marks.update(s.depth for s in case.supports)
    marks.update(s.depth for s in case.comparisons)
    for s in case.stages:
        marks.update(v for v in (s.cut,s.inside_water,s.outside_water) if 0<v<case.length)
    cuts=sorted(marks)
    mesh=[0.]
    for a,b in zip(cuts,cuts[1:]):
        count=max(1,math.ceil((b-a)/step-1e-10))
        if len(mesh)+count>3000:
            raise ValueError("單一網格超過 3,000 節點，請用較大步距或離線模型。")
        mesh.extend(a+(b-a)*i/count for i in range(1,count))
        mesh.append(b)
    return mesh


def elements(case,mesh):
    elements=[]
    layer_index=0
    for i,(a,b) in enumerate(zip(mesh,mesh[1:])):
        if a>=case.layers[layer_index].bottom-1e-12 and layer_index+1<len(case.layers):
            layer_index+=1
        layer=case.layers[layer_index]
        top=case.layers[layer_index-1].bottom if layer_index else 0.
        h=b-a
        coeff=case.ei/h**3
        kb=[[coeff*v for v in row] for row in ((12,6*h,-12,6*h),(6*h,4*h*h,-6*h,2*h*h),
                                                (-12,-6*h,12,-6*h),(6*h,2*h*h,-6*h,4*h*h))]
        points=[]
        for g,w in GAUSS:
            t=(g+1)/2; z=a+h*t; t2=t*t; t3=t2*t
            shape=(1-3*t2+2*t3,h*(t-2*t2+t3),3*t2-2*t3,h*(-t2+t3))
            soil=layer.pressure_top+(layer.pressure_bottom-layer.pressure_top)*(z-top)/(layer.bottom-top)
            points.append((z,w*h/2,shape,soil))
        elements.append((2*i,kb,layer,points))
    return elements


def band_solve(k,b,locked):
    """Symmetric FEM tangent with half-bandwidth 3, diagonally equilibrated Cholesky."""
    n=len(b)
    for i in locked:
        b[i]=0.
        k[i]=[1.,0.,0.,0.]
        for j in range(i+1,min(n,i+4)):
            k[j][j-i]=0.
    if any(row[0]<=0 for row in k):
        raise ValueError("切線剛度不足，請查壁趾、土彈簧與支撐。")
    scales=[math.sqrt(row[0]) for row in k]
    for i in range(n):
        b[i]/=scales[i]
        for d in range(min(i,3)+1):
            k[i][d]/=scales[i]*scales[i-d]
        for j in range(max(0,i-3),i):
            v=k[i][i-j]-sum(k[i][i-h]*k[j][j-h] for h in range(max(0,i-3),j))
            k[i][i-j]=v/k[j][0]
        diag=k[i][0]-sum(k[i][d]**2 for d in range(1,min(i,3)+1))
        if diag<=1e-13 or not math.isfinite(diag):
            raise ValueError("壁體失穩或切線剛度奇異，請核對該階支承條件。")
        k[i][0]=math.sqrt(diag)
    for i in range(n):
        b[i]=(b[i]-sum(k[i][d]*b[i-d] for d in range(1,min(i,3)+1)))/k[i][0]
    for i in reversed(range(n)):
        b[i]=(b[i]-sum(k[j][j-i]*b[j] for j in range(i+1,min(n,i+4))))/k[i][0]
    return [v/s for v,s in zip(b,scales)]


def solve_mesh(case,step):
    mesh=grid(case,step); elems=elements(case,mesh); n=len(mesh)*2
    node={z:i for i,z in enumerate(mesh)}
    fixed={"fixed":{n-2,n-1},"pinned":{n-2},"free":set()}[case.toe]
    u=[0.]*n; committed=[[0.]*4 for _ in elems]
    active={}; results=[]
    for st in case.stages:
        for s in case.supports:
            if s.remove==st.id:
                active.pop(s.id)
            if s.install==st.id:
                active[s.id]=(s,2*node[s.depth],u[2*node[s.depth]])
        def assemble(v,tangent=False,details=False):
            k=[[0.]*4 for _ in range(n)] if tangent else None
            residual=[0.]*n;ends=[];states=[];struts=[];applied=reaction=applied_m=soil_m=0.
            for e,(offset,kb,layer,points) in enumerate(elems):
                local=v[offset:offset+4]
                # Remove rigid translation/rotation before forming beam actions.
                h=mesh[e+1]-mesh[e]
                rel=(0.,0.,local[2]-local[0]-local[1]*h,local[3]-local[1])
                force=[sum(a*b for a,b in zip(row,rel)) for row in kb]
                if tangent:
                    for i in range(4):
                        for j in range(i+1):k[offset+i][i-j]+=kb[i][j]
                updated=[]
                for j,(z,weight,N,earth) in enumerate(points):
                    water=case.water_weight*(max(0.,z-st.outside_water)-max(0.,z-st.inside_water))
                    q=earth*st.earth_factor+water*st.water_factor
                    disp=sum(a*b for a,b in zip(N,local)); plastic=committed[e][j]
                    kh=layer.kh if z>=st.cut else 0.
                    trial=kh*(disp-plastic);r=trial;kt=kh
                    if kh and case.soil_law=="plastic":
                        r=max(layer.lower,min(layer.upper,trial))
                        if r!=trial:kt=0.;plastic=disp-r/kh
                    if details:
                        updated.append(dict(z=z,u_m=disp,spring_kpa=r,plastic_m=plastic,active=bool(kh),
                                            effective_kpa=earth*st.earth_factor,water_kpa=water*st.water_factor))
                        applied+=weight*q;reaction+=weight*r;applied_m+=weight*z*q;soil_m+=weight*z*r
                    for i in range(4):
                        force[i]+=N[i]*weight*(r-q)
                        if tangent:
                            for a in range(i+1):k[offset+i][i-a]+=kt*weight*N[i]*N[a]
                for i in range(4): residual[offset+i]+=force[i]
                if details: ends.append(force);states.append(updated)
            for s,d,u0 in active.values():
                force=s.preload+s.stiffness*(v[d]-u0)
                open_gap=s.law=="compression" and force<0
                if open_gap:force=0.
                residual[d]+=force/s.spacing
                if tangent and not open_gap:k[d][0]+=s.stiffness/s.spacing
                if details:struts.append(dict(id=s.id,z=s.depth,reference_mm=1000*u0,force_kn=force,
                                              per_m=force/s.spacing,gap=open_gap))
            return k,residual,ends,states,struts,(applied,reaction,applied_m,soil_m)
        def norm(residual):
            return max((abs(v) for i,v in enumerate(residual) if i not in fixed),default=0.)
        try:
            for iteration in range(64):
                k,r,*_=assemble(u,True)
                error=norm(r)
                if error<1e-6:
                    # Zero load may balance a mechanism; still verify tangent rank.
                    band_solve(k,[0.]*n,fixed)
                    break
                delta=band_solve(k,[-x for x in r],fixed)
                alpha=1.
                for _ in range(18):
                    trial=[x+alpha*y for x,y in zip(u,delta)]
                    if norm(assemble(trial)[1])<error:
                        u=trial;break
                    alpha/=2
                else:raise ValueError("無法降低平衡殘差，請查載重、降伏界限與支承。")
            else:raise ValueError("分階迭代未收斂。")
        except ValueError as ex:
            raise ValueError(st.id+"："+str(ex)) from ex
        _,r,ends,states,struts,(applied,reaction,applied_m,soil_m)=assemble(u,details=True)
        committed=[[pt["plastic_m"] for pt in pts] for pts in states]
        wall=[]
        for i,z in enumerate(mesh):
            wall.append(dict(z=z,u_mm=u[2*i]*1000,rotation=u[2*i+1],
                             M_above=ends[i-1][3] if i else None,V_above=-ends[i-1][2] if i else None,
                             M_below=-ends[i][1] if i<len(elems) else None,V_below=ends[i][0] if i<len(elems) else None))
        toe_force=r[n-2] if n-2 in fixed else 0.;toe_m=r[n-1] if n-1 in fixed else 0.
        balance=applied-reaction-sum(s["per_m"] for s in struts)+toe_force
        balance_m=applied_m-soil_m-sum(s["per_m"]*s["z"] for s in struts)+toe_force*case.length+toe_m
        compare=[]
        for item in case.comparisons:
            if item.stage!=st.id:continue
            station=wall[node[item.depth]]
            if item.quantity=="R":calc=next((s["force_kn"] for s in struts if s["id"]==item.support),None)
            elif item.quantity=="u":calc=station["u_mm"]
            else:calc=station[item.quantity+"_"+item.side]
            given=item.value*UNITS[item.quantity][item.unit]
            compare.append({**item.model_dump(),"converted":given,"calc":calc,"delta":calc-given if calc is not None else None})
        results.append(dict(id=st.id,wall=wall,springs=states,supports=struts,comparisons=compare,iterations=iteration,
                            balance=dict(applied=applied,soil=reaction,toe_force=toe_force,toe_moment=toe_m,
                                         force_error=balance,moment_error=balance_m,nodal_error=norm(r))))
    return results


def calculate(case: WallCase):
    validate(case)
    coarse=solve_mesh(case,case.step)
    fine=solve_mesh(case,case.step/2)
    return {"version":VERSION,"coarse_step":case.step,"fine_step":case.step/2,"stages":fine,
            "coarse":[dict(id=s["id"],wall=s["wall"],supports=s["supports"],balance=s["balance"]) for s in coarse]}
