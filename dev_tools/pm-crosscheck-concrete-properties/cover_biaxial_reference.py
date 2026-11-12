"""Independent signed rectangular RC section benchmark, 6,000 concrete strips.

Run with Python, NumPy and SciPy. Steel positions are in millimetres from
the upper left. Positive Mx and My compress the top and left respectively.
"""
import json
import math
from pathlib import Path

import numpy as np
from scipy.optimize import root

W, H = 50., 60.
FC, FY, ES = 280., 4200., 2040000.
AREA = 5.067
layouts = {
    'design': [(50,50),(250,50),(450,50),(50,300),(450,300),(50,550),(250,550),(450,550)],
    'observed': [(65,70),(240,50),(410,80),(60,270),(450,310),(60,530),(260,540),(420,510)],
}
ids = ['T1','T2','T3','L1','R1','B1','B2','B3']
grid = (np.arange(6000) + 0.5) / 6000 - 0.5


def integrate(depth, theta, bars):
    nx, ny = math.sin(theta), math.cos(theta)
    extreme = abs(nx)*W/2 + abs(ny)*H/2
    edge = extreme - .85*depth
    # Integrate along the direction with the larger compression normal component.
    swap = abs(nx) > abs(ny)
    width, height, ax, ay = (H,W,ny,nx) if swap else (W,H,nx,ny)
    xs = grid * width
    cut = np.clip((edge - ax*xs)/ay, -height/2, height/2)
    low, high = (cut, height/2) if ay > 0 else (-height/2, cut)
    force = .85*FC*(high-low)*width/len(grid)
    p, mx, my = force.sum(), (force*(low+high)/2).sum(), (force*xs).sum()
    if swap:
        mx, my = my, mx
    strains = []
    for x_mm, y_mm in bars:
        x, y = W/2 - x_mm/10, H/2 - y_mm/10
        d = extreme - nx*x - ny*y
        strain = .003*(1-d/depth)
        strains.append(strain)
        stress = np.clip(ES*strain,-FY,FY) - (.85*FC if d <= .85*depth else 0)
        p += AREA*stress
        mx += AREA*stress*y
        my += AREA*stress*x
    et = -min(strains)
    phi = np.clip(.65 + .25*(et-FY/ES)/.003,.65,.90)
    return p/1000, mx/1e5, my/1e5, et, phi


def solve(bars, mode, target, bearing):
    beta = math.radians(bearing)
    co, si = math.cos(beta), math.sin(beta)
    def residual(variables):
        p, mx, my, _, phi = integrate(math.exp(variables[0]), variables[1], bars)
        scale = phi if mode == 'design' else 1.
        return [(scale*p-target)/100., scale*(-mx*si+my*co)/30.]
    for depth0 in (16, 30, 45, 8):
        solved = root(residual, [math.log(depth0), beta], tol=1e-10)
        if max(abs(v) for v in solved.fun) < 1e-8:
            break
    else:
        raise ValueError((mode,target,bearing,solved.message))
    primary = solved.x.copy()
    others = []
    for shift in (-.04, 0., .04):
        for rotation in (-2., -.5, .5, 2.):
            near = root(residual, primary + [shift,math.radians(rotation)], tol=1e-10)
            if max(abs(v) for v in near.fun) > 1e-8:
                continue
            pp, mx, my, _, phi = integrate(math.exp(near.x[0]),near.x[1],bars)
            radial = (phi if mode=='design' else 1.)*(mx*co+my*si)
            if radial > 0 and not any(abs(radial-r) < 1e-5 for r in others):
                others.append(radial)
    c, theta = math.exp(primary[0]), primary[1]
    p, mx, my, et, phi = integrate(c,theta,bars)
    scale = phi if mode == 'design' else 1.
    assert mx*co+my*si > 0
    return dict(cCm=c,normalDeg=math.degrees(theta),pnTf=p,mnxTfm=mx,mnyTfm=my,
                epsT=et,phi=phi,capacityTfm=scale*math.hypot(mx,my),positiveIntersectionsTfm=sorted(others))


if __name__ == '__main__':
    ref = dict(material=[FC,FY,ES], widthMm=W*10, depthMm=H*10, areaCm2=AREA, bars=layouts, ids=ids, cases=[])
    for mode, target, angles in [('nominal',60,[0,30,90,-30]),('design',60,[0,30,90,-30,180,135,-135,-90]),('design',200,[30,-30]),('design',-65,[135])]:
        for angle in angles:
            entry = dict(mode=mode,pTf=target,angle=angle)
            for name, bars in layouts.items():
                entry[name] = solve(bars,mode,target,angle)
            ref['cases'].append(entry)
    dest = Path(__file__).resolve().parents[2] / 'tests/fixtures/column-cover-biaxial.json'
    dest.write_text(json.dumps(ref,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(len(ref['cases']), 'directional benchmarks x two layouts')
