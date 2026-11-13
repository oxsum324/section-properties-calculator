"""Synthetic vibrating cable. Length m, mass kg/m, force N, EI N m².
Pinned straight analytic cases and independent in-plane shallow-cable tangent FEM.
"""
from pathlib import Path
import json, math
import numpy as np
from scipy.linalg import eigh
from scipy.signal import periodogram, find_peaks, detrend

root=Path(__file__).resolve().parents[1]
out=root/'output/cable-spectrum-reference'
out.mkdir(parents=True,exist_ok=True)
L,mu,T,EI,EA=30.,18.,400000.,220000.,1.5e9
sag=mu*9.80665*L**2/(8*T)
def modes(n,T,EI,midSag,kEnds):
    dx=L/n;nd=2*(n+1)
    M=np.zeros((nd,nd));K=np.zeros_like(M);g=np.zeros(nd)
    for el in range(n):
        ix=2*el+np.arange(4);loc=np.ix_(ix,ix)
        for v,w in zip(*np.polynomial.legendre.leggauss(4)):
            t=(v+1)/2;wt=w*dx/2;x=(el+t)*dx
            N=np.array([1-3*t*t+2*t**3,dx*(t-2*t*t+t**3),3*t*t-2*t**3,dx*(-t*t+t**3)])
            d=np.array([6*(t*t-t)/dx,1-4*t+3*t*t,6*(t-t*t)/dx,-2*t+3*t*t])
            b=np.array([(12*t-6)/dx**2,(6*t-4)/dx,(6-12*t)/dx**2,(6*t-2)/dx])
            M[loc]+=mu*np.outer(N,N)*wt
            K[loc]+=(EI*np.outer(b,b)+T*np.outer(d,d))*wt
            g[ix]+=4*midSag/L*(1-2*x/L)*d*wt
    K+=EA/L*np.outer(g,g)
    K[1,1]+=kEnds[0];K[-1,-1]+=kEnds[1]
    use=[i for i in range(nd) if i not in (0,nd-2)]
    ev=eigh(K[np.ix_(use,use)],M[np.ix_(use,use)],subset_by_index=[0,5],eigvals_only=True)
    return np.sqrt(ev)/(2*np.pi)
def analytic(mode,EI):
    q=mode*np.pi/L
    return math.sqrt((T*q*q+EI*q**4)/mu)/(2*np.pi)
exact=[analytic(i,EI) for i in range(1,7)]
grid=[dict(n=n,pinned=modes(n,T,EI,0,[0,0]).tolist(),sagCompliant=modes(n,T,EI,sag,[5e4,1.2e5]).tolist()) for n in (24,48,96)]
assert np.max(np.abs(np.array(grid[-1]['pinned'])-exact))<1e-4
assert np.max(np.abs(np.subtract(grid[-1]['sagCompliant'],grid[-2]['sagCompliant'])))<.001
fs=128.;t=np.arange(8192)/fs;signals={};rng=np.random.default_rng(14503)
for name,freq in [('理想弦',[analytic(i,0) for i in range(1,7)]),('直索含EI',exact),('垂度與端柔',grid[-1]['sagCompliant'])]:
    # sensor near center third mode weak; fourth mode deliberately absent.
    active=[1,2,3,5];amps=[.65,.22,.095,.31]
    a=sum(amp*np.sin(2*np.pi*freq[m-1]*t+0.28*m) for m,amp in zip(active,amps))
    a+=.13*np.sin(2*np.pi*7.23*t)+.0006*t+rng.normal(0,.012,len(t))
    filename=name+'合成加速規.csv'
    np.savetxt(out/filename,np.column_stack((t,a)),delimiter=',',header='time_s,accel_m_s2',comments='',fmt='%.10f',encoding='utf8')
    f,p=periodogram(detrend(a,type='linear'),fs,window='hann',scaling='spectrum')
    amp=np.sqrt(2*p);idx,_=find_peaks(amp,height=.055,prominence=.04)
    peaks=[]
    for b in idx:
        y=np.log(amp[b-1:b+2]);delta=.5*(y[0]-y[2])/(y[0]-2*y[1]+y[2])
        peaks.append(dict(bin=int(b),interpolatedHz=float((b+delta)*fs/len(t)),binAmplitude=float(amp[b])))
    for m in active:assert min(abs(v['interpolatedHz']-freq[m-1]) for v in peaks)<.001
    signals[name]=dict(file=filename,modeFrequenciesHz=freq,activeModes=active,noiseLineHz=7.23,peaks=peaks)
reference=dict(synthetic=True,lengthM=L,massKgM=mu,forceN=T,EI_Nm2=EI,EA_N=EA,sagM=sag,rotationalSpringsNmRad=[5e4,1.2e5],translationalEnds='固定於兩端弦線，端部為轉動彈簧',geometry='水平淺垂度拋物線，面內小振幅、已知 EI 與 EA；靜力平衡用均布自重。',rateHz=fs,n=len(t),binWidthHz=fs/len(t),femGrid=grid,signals=signals)
(root/'tests/fixtures/cable-spectrum-reference.json').write_text(json.dumps(reference,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('sag',sag,'baseline',exact[:3],'sag/end',grid[-1]['sagCompliant'][:3],[(k,len(v['peaks'])) for k,v in signals.items()])
