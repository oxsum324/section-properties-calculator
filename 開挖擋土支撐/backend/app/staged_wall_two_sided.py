"""Independent histories on each face of a one-metre wall strip."""
from __future__ import annotations

import math
from dataclasses import dataclass

from .staged_wall import (
    GAUSS, UNITS, StripSurcharge, bending_action, bending_stiffness, grid,
    support_force, water_pressure,
)


@dataclass(frozen=True)
class SoilPoint:
    rest: float
    lower: float
    upper: float
    kh: float
    separation: bool
    passive_shear: float

    def evaluate(self, travel):
        if not self.kh:
            return 0., 0., "excavated"
        trial = self.rest+self.kh*travel
        if trial < self.lower:
            return self.lower, 0., "separated" if self.separation else "active"
        if trial > self.upper:
            return self.upper, 0., "passive"
        return trial, self.kh if self.lower < self.upper else 0., "elastic"

    def vertical_force_density(self, pressure):
        if pressure <= self.rest or self.upper <= self.rest:
            return 0.
        mobilized = (pressure-self.rest)/(self.upper-self.rest)
        return self.passive_shear*mobilized**4


EXCAVATED = SoilPoint(0., 0., 0., 0., False, 0.)
DIRECTION = (-1., 1.)


def surcharge_pressure(load, z, element_midpoint):
    if not isinstance(load,StripSurcharge):
        return load.pressure
    depth=z-load.depth
    if element_midpoint<load.depth:
        return 0.
    if depth==0:
        return load.pressure if load.near==0 else 0.

    def edge(x):
        return math.atan2(x,depth)-depth*x/(depth*depth+x*x)

    return 2*load.pressure/math.pi*(edge(load.far)-edge(load.near))


def soil_points(stage, mesh, layers, pore, side):
    inside=side=="inside"
    surface=stage.cut if inside else 0.
    surcharge=[load for load in stage.surcharges if load.side==side]
    overburden=0.
    layer_index=0
    points=[]
    for i,(a,b) in enumerate(zip(mesh,mesh[1:])):
        mid=(a+b)/2
        if mid<surface:
            points.append((EXCAVATED,EXCAVATED))
            continue
        while layer_index+1<len(layers) and mid>layers[layer_index].bottom:
            layer_index+=1
        layer=layers[layer_index]
        mass=layer.saturated_unit_weight if pore[i]+pore[i+1]>0 and layer.saturated_unit_weight is not None else layer.unit_weight
        top=overburden
        overburden+=mass*(b-a)-(pore[i+1]-pore[i])
        endpoints=[]
        for z,stress in ((a,top),(b,overburden)):
            effective=stress+sum(surcharge_pressure(load,z,mid) for load in surcharge)
            active=layer.ka*effective+layer.active_offset
            rest=layer.k0*effective
            upper=layer.kp*effective+layer.passive_offset
            lower=max(0.,active)
            if upper<lower:
                side_label="內" if inside else "外"
                raise ValueError(f"{side_label}側 {z:g} m 被動壓力低於主動／分離界限，請核對有效覆土及水壓。")
            endpoints.append(SoilPoint(rest,lower,upper,layer.kh,active<0,
                                       -upper*math.tan(math.radians(layer.passive_friction_deg))))
        points.append(tuple(endpoints))
    return points


@dataclass(frozen=True)
class Element:
    h: float
    bending: list
    distribution: list
    geometry: tuple
    integration: list


def element_data(ei,h):
    distributed=[[0.,0.] for _ in range(4)]
    geometry=[[[0.]*4 for _ in range(4)] for _ in range(2)]
    integration=[]
    for g,w in GAUSS:
        t=(g+1)/2
        weight=w*h/2
        t2=t*t
        t3=t2*t
        shape=(1-3*t2+2*t3,h*(t-2*t2+t3),3*t2-2*t3,h*(-t2+t3))
        slope=(6*(t2-t)/h,1-4*t+3*t2,6*(t-t2)/h,3*t2-2*t)
        lin=(1-t,t)
        integration.append((t,weight,slope))
        for i in range(4):
            for edge in range(2):
                distributed[i][edge]+=weight*shape[i]*lin[edge]
                for j in range(4):
                    geometry[edge][i][j]-=weight*lin[edge]*slope[i]*slope[j]
    return Element(h,bending_stiffness(ei,h),distributed,tuple(geometry),integration)


def solve_band(tangent,rhs,fixed):
    """Scaled, unsymmetric band LU for the linear nodal pressure interpolation."""
    n=len(rhs)
    for i in fixed:
        tangent[i]=[0.,0.,0.,1.,0.,0.,0.]
        rhs[i]=0.
        for j in range(max(0,i-3),min(n,i+4)):
            if j!=i:
                tangent[j][3+i-j]=0.
    if any(row[3]<=0 for row in tangent):
        raise ValueError("壁體切線剛度不足，請核對土壓、壁趾與支撐。")
    scales=[math.sqrt(row[3]) for row in tangent]
    for i,row in enumerate(tangent):
        rhs[i]/=scales[i]
        for j in range(max(0,i-3),min(n,i+4)):
            row[3+j-i]/=scales[i]*scales[j]
    for i,row in enumerate(tangent):
        pivot=row[3]
        if pivot<=1e-13 or not math.isfinite(pivot):
            raise ValueError("壁體失穩或切線剛度奇異，請核對該階支承條件。")
        for j in range(i+1,min(n,i+4)):
            target=tangent[j]
            multiplier=target[3+i-j]/pivot
            for k in range(i+1,min(n,i+4)):
                target[3+k-j]-=multiplier*row[3+k-i]
            rhs[j]-=multiplier*rhs[i]
    for i in reversed(range(n)):
        row=tangent[i]
        rhs[i]=(rhs[i]-sum(row[3+j-i]*rhs[j] for j in range(i+1,min(n,i+4))))/row[3]
    return [value/scale for value,scale in zip(rhs,scales)]


def geometry_matrices(elements,vertical,enabled):
    if not enabled:
        return [None]*len(elements)
    return [[[vertical[e]*data.geometry[0][i][j]+vertical[e+1]*data.geometry[1][i][j] for j in range(4)]
             for i in range(4)] for e,data in enumerate(elements)]


def assemble(mesh,elements,face,anchors,water,geometry,active,preloading,u,tangent=False):
    residual=[0.]*len(u)
    stiffness=[[0.]*7 for _ in u] if tangent else None
    ends,states,struts=[],[],[]
    for e,(element,kg) in enumerate(zip(elements,geometry)):
        offset=2*e
        local=u[offset:offset+4]
        force=bending_action(element.bending,local,element.h)
        if kg is not None:
            relative=(0.,local[1],local[2]-local[0],local[3])
            for i,row in enumerate(kg):
                force[i]+=sum(a*b for a,b in zip(row,relative))
        results=[]
        for side,direction in enumerate(DIRECTION):
            results.append([point.evaluate(direction*(local[2*j]-anchors[e][side][j]))
                            for j,point in enumerate(face[side][e])])
        driving=[water[e+j]+results[0][j][0]-results[1][j][0] for j in (0,1)]
        tangents=[results[0][j][1]+results[1][j][1] for j in (0,1)]
        for i,d in enumerate(element.distribution):
            force[i]-=d[0]*driving[0]+d[1]*driving[1]
            residual[offset+i]+=force[i]
            if tangent:
                row=stiffness[offset+i]
                for j in range(4):
                    row[3+j-i]+=element.bending[i][j]+(kg[i][j] if kg is not None else 0.)
                row[3-i]+=d[0]*tangents[0]
                row[5-i]+=d[1]*tangents[1]
        ends.append(force)
        states.append(results)
    for support,i,reference in active.values():
        prescribed=support.id in preloading
        force,released=support_force(support,u[i],reference,prescribed)
        residual[i]+=force/support.spacing
        if tangent and not prescribed and not released:
            stiffness[i][3]+=support.stiffness/support.spacing
        struts.append(dict(id=support.id,z=mesh[i//2],reference_mm=1000*(u[i] if prescribed else reference),
                           force_kn=force,per_m=force/support.spacing,gap=released,
                           installation=support.installation,applying_preload=prescribed))
    return residual,stiffness,ends,states,struts


def lateral_equilibrium(u,fixed,evaluate):
    free=[i for i in range(len(u)) if i not in fixed]

    def norm(residual):
        return max(abs(residual[i]) for i in free)

    for iteration in range(64):
        response=evaluate(u,True)
        residual,stiffness=response[:2]
        error=norm(residual)
        if error<1e-6:
            solve_band(stiffness,[0.]*len(u),fixed)
            return u,response,error,iteration
        delta=solve_band(stiffness,[-r for r in residual],fixed)
        for k in range(22):
            trial=[a+b/2**k for a,b in zip(u,delta)]
            if norm(evaluate(trial,False)[0])<error:
                u=trial
                break
        else:
            raise ValueError("無法降低雙側平衡殘差，請核對土壓界限與支承。")
    raise ValueError("雙側土壓迭代未收斂。")


def vertical_forces(mesh,face,states):
    vertical=[0.]
    for e,(a,b) in enumerate(zip(mesh,mesh[1:])):
        density=sum(face[side][e][j].vertical_force_density(states[e][side][j][0])
                    for side in (0,1) for j in (0,1))
        vertical.append(vertical[-1]+density*(b-a)/2)
    return vertical


def load_resultant(mesh,values):
    force=moment=0.
    for (a,b),(left,right) in zip(zip(mesh,mesh[1:]),values):
        h=b-a
        segment=(left+right)*h/2
        force+=segment
        moment+=a*segment+h*h*(left+2*right)/6
    return force,moment


def observations(case,stage,node,wall,struts):
    output=[]
    for item in case.comparisons:
        if item.stage!=stage.id:
            continue
        point=wall[node[item.depth]//2]
        if item.quantity=="R":
            value=next((s["force_kn"] for s in struts if s["id"]==item.support),None)
        elif item.quantity=="u":
            value=point["u_mm"]
        else:
            value=point[item.quantity+"_"+item.side]
        given=item.value*UNITS[item.quantity][item.unit]
        output.append({**item.model_dump(),"converted":given,"calc":value,"delta":None if value is None else value-given})
    return output


def stage_result(case,stage,mesh,node,elements,face,anchors,water,vertical,response,u,fixed,error,iteration,cycles):
    residual,_,ends,states,struts=response
    wall=[dict(z=z,u_mm=1000*u[2*i],rotation=u[2*i+1],vertical_kn_m=vertical[i],
               M_above=ends[i-1][3] if i else None,V_above=-ends[i-1][2] if i else None,
               M_below=-ends[i][1] if i<len(ends) else None,V_below=ends[i][0] if i<len(ends) else None)
          for i,z in enumerate(mesh)]
    outside,m_out=load_resultant(mesh,[(r[0][0][0],r[0][1][0]) for r in states])
    inside,m_in=load_resultant(mesh,[(r[1][0][0],r[1][1][0]) for r in states])
    water_force,water_moment=load_resultant(mesh,zip(water,water[1:]))
    geometric_moment=0.
    if case.two_sided.geometric:
        for e,element in enumerate(elements):
            local=u[2*e:2*e+4]
            relative=(0.,local[1],local[2]-local[0],local[3])
            for t,w,slope in element.integration:
                axial=(1-t)*vertical[e]+t*vertical[e+1]
                geometric_moment+=w*axial*sum(a*b for a,b in zip(slope,relative))
    n=len(u)
    toe_force=residual[-2] if n-2 in fixed else 0.
    toe_moment=residual[-1] if n-1 in fixed else 0.
    force_error=outside-inside+water_force-sum(s["per_m"] for s in struts)+toe_force
    moment_error=m_out-m_in+water_moment-sum(s["z"]*s["per_m"] for s in struts)+toe_force*case.length+toe_moment+geometric_moment
    soil=[]
    for e,segment in enumerate(states):
        for side,side_name in enumerate(("outside","inside")):
            for j,(pressure,_,state) in enumerate(segment[side]):
                p=face[side][e][j]
                soil.append(dict(z=mesh[e+j],side=side_name,interval="below" if j==0 else "above",
                                 pressure_kpa=pressure,rest_kpa=p.rest,active_kpa=p.lower,passive_kpa=p.upper,
                                 state=state,reference_mm=anchors[e][side][j]*1000))
    return dict(id=stage.id,wall=wall,springs=[],soil_pressures=soil,supports=struts,
                comparisons=observations(case,stage,node,wall,struts),iterations=iteration,vertical_iterations=cycles,
                balance=dict(applied=water_force,soil=inside-outside,soil_outside=outside,soil_inside=inside,
                             soil_moment_at_ground=m_out-m_in,toe_force=toe_force,toe_moment=toe_moment,
                             water_force=water_force,water_moment_at_ground=water_moment,
                             geometric_moment=geometric_moment,vertical_toe=vertical[-1],
                             force_error=force_error,moment_error=moment_error,nodal_error=error))


def solve_two_sided_mesh(case,step):
    mesh=grid(case,step)
    elements=[element_data(case.ei,b-a) for a,b in zip(mesh,mesh[1:])]
    anchors=[[[0.,0.],[0.,0.]] for _ in elements]
    node={z:2*i for i,z in enumerate(mesh)}
    n=2*len(mesh)
    u=[0.]*n
    vertical=[0.]*len(mesh)
    fixed={"fixed":{n-2,n-1},"pinned":{n-2},"free":set()}[case.toe]
    active={}
    results=[]
    for stage in case.stages:
        preloading=set()
        for support in case.supports:
            if support.remove==stage.id:
                active.pop(support.id)
            if support.install==stage.id:
                i=node[support.depth]
                active[support.id]=(support,i,u[i])
                if support.installation=="preload_then_lock":
                    preloading.add(support.id)
        try:
            outside=[stage.water_factor*water_pressure(z,case.water_weight,stage.outside_water,stage.outside_water_profile) for z in mesh]
            inside=[stage.water_factor*water_pressure(z,case.water_weight,stage.inside_water,stage.inside_water_profile) for z in mesh]
            water=[a-b for a,b in zip(outside,inside)]
            face=(soil_points(stage,mesh,case.two_sided.outside,outside,"outside"),
                  soil_points(stage,mesh,case.two_sided.inside,inside,"inside"))
            for cycle in range(30):
                geometry=geometry_matrices(elements,vertical,case.two_sided.geometric)

                def evaluate(v,tangent):
                    return assemble(mesh,elements,face,anchors,water,geometry,active,preloading,v,tangent)

                u,response,error,iteration=lateral_equilibrium(u,fixed,evaluate)
                updated=vertical_forces(mesh,face,response[3])
                stable=max(abs(a-b) for a,b in zip(updated,vertical))<1e-6
                vertical=updated
                if not case.two_sided.geometric or stable:
                    break
            else:
                raise ValueError("雙側土壓的垂直力與二階作用未收斂。")
        except ValueError as exc:
            raise ValueError(stage.id+"："+str(exc)) from exc
        for e,segment in enumerate(response[3]):
            for side,direction in enumerate(DIRECTION):
                for j,(pressure,_,state) in enumerate(segment[side]):
                    if state in ("active","passive"):
                        p=face[side][e][j]
                        anchors[e][side][j]=u[2*(e+j)]-(pressure-p.rest)/(p.kh*direction)
        for key in preloading:
            support,i,_=active[key]
            active[key]=(support,i,u[i])
        results.append(stage_result(case,stage,mesh,node,elements,face,anchors,water,vertical,
                                    response,u,fixed,error,iteration,cycle+1))
    return results
