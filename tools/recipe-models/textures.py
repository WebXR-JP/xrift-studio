"""Deterministic project-original PBR texture authoring; no external assets."""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter,zoom
import json
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'textures'

def noise(n,rng,scale):
    k=max(2,scale)
    a=rng.random((k,k)); a=zoom(a,(n/k,n/k),order=3,mode='wrap')[:n,:n]
    return a

def create():
    OUT.mkdir(exist_ok=True)
    mats={}
    def save(name,base,rough,metal=0,height=None,normal_strength=1.0,double=False,emissive=None):
        d={'roughness':rough,'metallic':metal,'doubleSided':double}
        if np.ndim(base)==1:d['color']=list(base)+[1]
        else:
            c=np.uint8(np.clip(base*255,0,255));p=OUT/f'{name}-basecolor.jpg';image=Image.fromarray(c)
            if name in ('leaf','leaf-light','bamboo','paper','charcoal','ash','snow'):
                image=image.resize((128,128),Image.Resampling.LANCZOS)
            image.save(p,quality=86,subsampling=0,optimize=True);d['baseColorTexture']=p.name;d['color']=[1,1,1,1]
        if height is not None:
            dy,dx=np.gradient(height);nx=-dx*normal_strength;ny=dy*normal_strength;nz=np.ones_like(nx);v=np.stack([nx,ny,nz],2);v/=np.linalg.norm(v,axis=2)[...,None]
            # Micro-normal maps need less resolution than silhouette/base-color detail.
            # Filter signed vectors, then normalize again; do not JPEG-compress normals.
            v=np.stack([np.asarray(Image.fromarray(v[...,i].astype(np.float32)).resize((128,128),Image.Resampling.LANCZOS)) for i in range(3)],axis=2)
            v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12)
            p=OUT/f'{name}-normal.png';Image.fromarray(np.uint8(np.clip((v*.5+.5)*255,0,255))).save(p,optimize=True);d['normalTexture']=p.name
        if emissive is not None:d['emissive']=emissive
        mats[name]=d
    n=256;rng=np.random.default_rng(2107);y,x=np.mgrid[0:1:n*1j,0:1:n*1j]
    a=noise(n,rng,6); b=noise(n,rng,24); c=rng.random((n,n))
    stone=.32*a+.35*b+.2*c+.1
    fleck=np.clip((c-.83)*5,0,1)
    stonec=np.clip(np.array([.52,.50,.45])[None,None,:]*(.68+stone[...,None]*.62)+fleck[...,None]*.075,0,1)
    save('limestone',stonec,.86,height=stone,normal_strength=1.6)
    basalt=np.array([.29,.30,.30])[None,None,:]*(.52+stone[...,None]*.95)
    save('basalt',basalt,.88,height=stone,normal_strength=2)
    # Meandering wood grain and several soft knots; no photograph dependency.
    phase=8*np.sin(y*7)+3*noise(n,rng,5)
    grain=(np.sin(2*np.pi*x*44+phase)+.4*np.sin(2*np.pi*x*90+phase*.7))*.5
    knot=np.zeros_like(x)
    for cx,cy in [(.28,.36),(.77,.8)]:
        r=np.sqrt(((x-cx)*3)**2+((y-cy)*.7)**2);knot+=np.exp(-r*13)*np.sin(r*280)
    h=.32+grain*.1+knot*.17+noise(n,rng,40)*.18
    bc=np.array([.49,.285,.135])[None,None,:]*(.76+h[...,None]*.65)
    save('oak',bc,.61,height=h,normal_strength=.65)
    save('darkwood',bc*np.array([.47,.49,.52]),.69,height=h,normal_strength=.9)
    fiss=np.sin(x*130+3*np.sin(y*6)+noise(n,rng,10)*4)
    bark=.25+np.clip(fiss,-.7,1)*.17+noise(n,rng,42)*.3
    save('bark',np.array([.245,.16,.10])[None,None,:]*(.5+bark[...,None]*1.35),.95,height=bark,normal_strength=2.3)
    rr=np.sqrt(((x-.5)*1.04)**2+((y-.5)*.95)**2)
    ring=np.sin(rr*210+noise(n,rng,5)*3); end=.58+ring*.09+noise(n,rng,28)*.08
    save('endgrain',np.array([.62,.42,.22])[None,None,:]*(.64+end[...,None]*.52),.8,height=end,normal_strength=.8)
    coal=(noise(n,rng,8)*.45+noise(n,rng,28)*.25)
    save('charcoal',np.repeat((.045+coal*.07)[...,None],3,2),.98,height=coal,normal_strength=3)
    save('ash',np.repeat((.18+stone*.1)[...,None],3,2),1,height=stone,normal_strength=1)
    paper=np.ones((n,n,3))*np.array([.90,.82,.66])[None,None,:]+(c[...,None]-.5)*.03
    save('paper',paper,.89,height=noise(n,rng,64),normal_strength=.2,emissive=[.18,.11,.04])
    veins=np.exp(-abs(x-.5)*110)*.22
    for i in range(7):veins+=np.exp(-abs(y-(i/7+abs(x-.5)*.55))*160)*.07
    leaf=(.8+.18*np.sin(y*3.14)+noise(n,rng,8)*.15+veins)
    save('leaf',np.array([.15,.31,.065])[None,None,:]*leaf[...,None],.76,height=veins,normal_strength=.8,double=True)
    save('leaf-light',np.array([.28,.40,.095])[None,None,:]*leaf[...,None],.78,height=veins,normal_strength=.8,double=True)
    bamboo=.78+.08*np.sin(x*120)+noise(n,rng,20)*.12
    save('bamboo',np.array([.35,.43,.17])[None,None,:]*bamboo[...,None],.7,height=bamboo,normal_strength=.5)
    rip=.12*np.sin(x*31+y*17+noise(n,rng,5)*2)+.075*np.sin(y*37-x*12)+.04*noise(n,rng,16)
    save('water',np.ones((n,n,3))*np.array([.065,.205,.215])+rip[...,None]*.018,.22,0,rip,.55)
    save('iron',[.075,.085,.09],.38,.83)
    save('bronze',[.45,.26,.095],.34,.8)
    save('silver',[.49,.54,.59],.25,.95)
    save('ivory',[.83,.80,.70],.74)
    save('wax',[.91,.79,.57],.55)
    save('ember',[.28,.018,.003],.95,emissive=[1,.14,.008])
    save('warm-light',[.92,.58,.23],.5,emissive=[1,.57,.16])
    save('aqua-light',[.02,.40,.44],.3,emissive=[.06,.9,1])
    save('snow',np.ones((n,n,3))*.90+(c[...,None]-.5)*.04,.94,height=c,normal_strength=.16)
    save('scarlet',[.45,.025,.014],.95)
    save('orange',[.82,.22,.035],.8)
    save('black',[.018,.023,.026],.8)
    save('glass',[.15,.25,.27],.14,.45) # Opaque reflective panel: no per-frame transmission pass.
    (ROOT/'materials.json').write_text(json.dumps(mats,indent=2), encoding="utf-8")
    print('Generated',len(mats),'original PBR materials,',sum(p.stat().st_size for p in OUT.iterdir()),'bytes')
    return mats
if __name__=='__main__':create()
