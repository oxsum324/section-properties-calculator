"""Free rectangular Kirchhoff plate on linear bilateral Winkler springs.
Rayleigh--Ritz energy using shifted tensor Legendre polynomials; m, kN.
The uniform rectangular contact lies entirely on this panel. No joint transfer.
"""
from pathlib import Path
import json, math
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['MKL_NUM_THREADS']='2'
import numpy as np
from numpy.polynomial.legendre import leggauss,legvander,legder
from functools import lru_cache
from scipy.sparse import csc_matrix, diags, kron
from scipy.sparse.linalg import splu
from numpy.polynomial.legendre import legint

W,H,h,E,nu,k=5.,5.,.18,28000000.,.20,50000.
D=E*h**3/(12*(1-nu**2))
cases={'中央':[(2.5,2.5,40.,.24,.30)],'自由邊':[(.12,2.5,40.,.24,.30)],
       '自由角隅':[(.12,.15,40.,.24,.30)],'雙輪':[(1.9,2.3,40.,.24,.30),(3.1,2.7,25.,.30,.38)],
       '分離雙輪':[(1.1,2.3,40.,.24,.30),(3.9,2.7,25.,.30,.38)]}

@lru_cache(maxsize=32)
def transforms(n,span):
    blocks=[]
    for d in range(3):
        c=np.zeros((n+1,n+1))
        for j in range(n+1):
            coeff=np.eye(1,max(1,j-1),max(0,j-2)).ravel()
            a=legint(coeff,m=2,lbnd=-1) if j>=2 else np.eye(1,j+1,j).ravel()
            v=legder(a,m=d)*(2/span)**d
            v[np.abs(v)<1e-13*max(abs(v))]=0
            c[:len(v),j]=v
        blocks.append(csc_matrix(c))
    return blocks
def basis(x,n,span,order):
    arg=2*np.atleast_1d(x)/span-1
    return legvander(arg,n)@transforms(n,span)[order]
def grams(n,span):
    cf=transforms(n,span);wt=diags(span/(2*np.arange(n+1)+1))
    return {(a,b):cf[a].T@wt@cf[b] for a in range(3) for b in range(3)}

def solve(n):
    x,y=grams(n,W),grams(n,H);kr=lambda a,b:kron(a,b,format="csc")
    K=D*(kr(x[2,2],y[0,0])+kr(x[0,0],y[2,2])+nu*(kr(x[2,0],y[0,2])+kr(x[0,2],y[2,0]))+2*(1-nu)*kr(x[1,1],y[1,1]))+k*kr(x[0,0],y[0,0])
    # Equilibrate the positive definite energy matrix before sparse LU.
    diag=np.sqrt(K.diagonal());S=diags(1/diag);F=splu((S@K@S).tocsc());u,w=leggauss(n+1)
    def wheel(cx,cy,p,b,d):
        vx=w@basis(cx+u*b/2,n,W,0)/2;vy=w@basis(cy+u*d/2,n,H,0)/2
        rhs=np.kron(vx,vy)*p
        return (F.solve(rhs/diag)/diag).reshape(n+1,n+1)
    def read(A,x,y):
        X=[basis(x,n,W,i)[0] for i in range(3)]
        Y=[basis(y,n,H,i)[0] for i in range(3)]
        at=lambda i,j:X[i]@A@Y[j]
        return dict(wMm=at(0,0)*1000,bottomXmpa=-6*D*(at(2,0)+nu*at(0,2))/h**2/1000,
                    bottomYmpa=-6*D*(at(0,2)+nu*at(2,0))/h**2/1000,
                    bottomXYmpa=-6*D*(1-nu)*at(1,1)/h**2/1000)
    ix=np.asarray(grams(n,W)[0,0][0,:].toarray()).ravel()
    iy=np.asarray(grams(n,H)[0,0][0,:].toarray()).ravel()
    result={}
    for name,loads in cases.items():
        cs=[wheel(*v) for v in loads];C=sum(cs)
        samples=[('第一輪心',loads[0][0],loads[0][1]),('板中央',2.5,2.5),('板邊觀察點',0.,2.5),('角隅觀察點',0.,0.)]
        result[name]={'springForceKn':k*ix@C@iy,'loads':loads,'points':{}}
        for label,x,y in samples:
            parts=[read(a,x,y) for a in cs];total=read(C,x,y)
            assert max(abs(sum(p[q] for p in parts)-total[q]) for q in total)<1e-9
            result[name]['points'][label]=dict(xM=x,yM=y,total=total,contributions=parts)
        assert abs(k*ix@C@iy-sum(a[2] for a in loads))<1e-7
    # Uniform q gives exact rigid vertical displacement q/k and zero curvature.
    rhs=10*np.kron(ix,iy);A=(F.solve(rhs/diag)/diag).reshape(n+1,n+1)
    uniform=read(A,1.7,2.3);assert abs(uniform['wMm']-.2)<1e-9 and abs(uniform['bottomXmpa'])<1e-9
    return dict(order=n,uniform=uniform,cases=result)
if __name__=='__main__':
    res=[solve(100)]
    file=Path(__file__).resolve().parents[1]/'tests/fixtures/floor-plate-ritz.json'
    file.write_text(json.dumps(res[-1],ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    for case in cases:
        print(case,[(r['order'], round(r['cases'][case]['points']['第一輪心']['total']['bottomXmpa'],5)) for r in res])
