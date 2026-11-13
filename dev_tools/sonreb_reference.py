"""合成 SonReb 比對；SciPy 密集協方差矩陣實作，單位 R、km/s、MPa。"""
import json
from pathlib import Path
import numpy as np
from scipy.linalg import cho_factor, cho_solve
from scipy.optimize import minimize_scalar
from scipy.stats import t
from scipy.spatial import Delaunay
root = Path(__file__).resolve().parents[1] / 'tests/fixtures'
rv = [(29,3.65),(33,3.55),(31,4.05),(36,3.80),(35,4.32),(40,4.00),(39,4.50),(43,4.23),(36,4.05),(46,4.65)]
effects = [-.035,.05,-.04,.03,.025,-.045,.05,-.025,.015,.02]
zones = []
for i, (r,v) in enumerate(rv):
    k = [2,3,2,4][i % 4]
    # Distinct IDs and raw readings for each location, no within-zone split.
    noises = np.linspace(-.035,.035,k)
    cores = [dict(id=f'C{i+1}-{j+1}',rawMpa=float(32*(r/35)**1.1*(v/4)**1.4*np.exp(effects[i]+n)),factor=1.,
                  factorBasis='合成 L/D=2.0；無齡期修正') for j,n in enumerate(noises)]
    zones.append(dict(zone=f'Z{i+1:02}',material='M1',condition='H1／水平／乾表面／直達',rebound=[r-.5,r+.5],
                      velocityKmS=[v-.025,v+.025],cores=cores,role='校正' if i<8 else '外留'))
def features(z):
    return np.array([1.,np.log(np.mean(z['rebound'])/35),np.log(np.mean(z['velocityKmS'])/4)])
def fit(active):
    xs=[]; ids=[]; ys=[]
    for i,z in enumerate(active):
        for c in z['cores']:
            xs.append(features(z));ids.append(i);ys.append(np.log(c['rawMpa']*c['factor']))
    X=np.array(xs);Y=np.array(ys);Z=np.equal.outer(ids,ids).astype(float);n,p=X.shape
    def solve(lam):
        V=np.eye(n)+lam*Z;f=cho_factor(V)
        q=cho_solve(f,X); gram=X.T@q;inv=np.linalg.inv(gram);beta=inv@(q.T@Y)
        residual=Y-X@beta;variance=residual@cho_solve(f,residual)/(n-p)
        ll=(n-p)*np.log(variance)+np.linalg.slogdet(gram)[1]+np.linalg.slogdet(V)[1]
        return ll,beta,variance,inv
    opt=minimize_scalar(lambda a:solve(np.exp(a))[0],bounds=(-18,17),method='bounded')
    lam=0. if solve(0.)[0]<=opt.fun else np.exp(opt.x)
    _,b,s,inv=solve(lam)
    hull=Delaunay(np.array([features(z)[1:] for z in active]))
    def predict(zone):
        x=features(zone);y=x@b;se=np.sqrt(s*(1.+lam+x@inv@x));half=t.ppf(.975,len(active)-p)*se
        measured = [c['rawMpa']*c['factor'] for c in zone['cores']]
        return dict(zone=zone['zone'],insideHull=bool(hull.find_simplex(x[1:],tol=1e-10)>=0),
                    measuredCoreMpa=measured,predictedMinusMeasuredMpa=[np.exp(y)-v for v in measured],
                    medianMpa=np.exp(y),individualCoreApprox95Mpa=[np.exp(y-half),np.exp(y+half)],
                    coreIds=[c['id'] for c in zone['cores']])
    return dict(beta=list(b),varianceWithinLog=s,varianceBetweenLog=lam*s,nZones=len(active),nCores=n),predict
train=zones[:8];meta,predict=fit(train);loo=[]
for z in train:
    row=fit([u for u in train if u is not z])[1](z)
    row['heldOutCoreIds']=row.pop('coreIds');row['trainingZones']=[u['zone'] for u in train if u is not z]
    loo.append(row)
result={'scope':'合成獨立回歸基準。輸出為新測區單顆經指定修正鑽心之條件中位數與近似預測區間，測區隨機截距。模型、誤差分布及參數不確定性須依實測覆核。','model':'log(fc/MPa)=b0+bR log(R/35)+bV log(V/4)+zone effect+core error; REML, t(df=training zones−3) approximation','zones':zones,'fit':meta,'externalHoldout':[predict(z) for z in zones[8:]],'leaveOneZoneOut':loo}
assert len(set(c['id'] for z in zones for c in z['cores']))==sum(len(z['cores']) for z in zones)
assert all(x['zone'] not in x['trainingZones'] for x in loo)
assert result['externalHoldout'][0]['insideHull'] and not result['externalHoldout'][1]['insideHull']
(root/'sonreb-reference.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(meta,result['externalHoldout'])
