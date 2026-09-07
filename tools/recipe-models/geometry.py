"""Project-original recipe meshes. Coordinates are Blender-native Z-up.

The geometry is independent of the host renderer: build.py writes GLB and
rebuild_blender.py reconstructs the SAME authored parts as native Blender meshes.
No network access, downloaded mesh, hidden subdivision or runtime decoder.
"""
from __future__ import annotations
from dataclasses import dataclass
import math
import numpy as np

@dataclass
class Part:
    name: str
    material: str
    vertices: np.ndarray
    faces: np.ndarray
    uv: np.ndarray
    normals: np.ndarray | None = None

def normalized(v):
    a=np.asarray(v,dtype=float)
    return a/np.maximum(np.linalg.norm(a,axis=-1,keepdims=True),1e-15)

def normals(v,f):
    n=np.zeros_like(v,dtype=float)
    fn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
    for k in range(3):np.add.at(n,f[:,k],fn)
    return normalized(n)

class Model:
    def __init__(self,name):self.name=name;self.parts=[]
    def add(self,name,mat,v,f,uv=None,n=None):
        v=np.asarray(v,dtype=float);f=np.asarray(f,dtype=np.int32)
        if uv is None:uv=v[:,:2]
        self.parts.append(Part(name,mat,v,f,np.asarray(uv,dtype=float),None if n is None else np.asarray(n,dtype=float)))
        return self.parts[-1]
    def transform(self,p,scale=(1,1,1),rotation=None,offset=(0,0,0)):
        s=np.asarray(scale); p.vertices*=s
        if p.normals is not None:p.normals=normalized(p.normals/s)
        if rotation is not None:
            r=np.asarray(rotation); p.vertices=p.vertices@r.T
            if p.normals is not None:p.normals=p.normals@r.T
        p.vertices+=offset
        return p
    def fit(self,old):
        """Retain the old placement envelope, including its non-ground origins."""
        vs=np.vstack([p.vertices for p in self.parts]);lo=vs.min(0);hi=vs.max(0)
        # glTF (x,y,z) = Blender (x,z,-y).
        tlo=np.array([old['min'][0],-old['max'][2],old['min'][1]])
        thi=np.array([old['max'][0],-old['min'][2],old['max'][1]])
        scale=(thi-tlo)/np.maximum(hi-lo,1e-9)
        for p in self.parts:
            p.vertices=(p.vertices-lo)*scale+tlo
            if p.normals is not None:p.normals=normalized(p.normals/scale)

    def box(self,name,mat,center,size,bevel=.008,rotation=None):
        """Chamfered box built from six inset faces, twelve bevels and corners.
        A bevel is real silhouette geometry; normal maps are only micro-detail.
        """
        h=np.array(size)/2; b=min(float(bevel),float(h.min())*.45)
        # Convex bevelled cuboid: per-corner three inset points.
        from itertools import product
        pts=[]
        for signs in product((-1,1),repeat=3):
            for a in range(3):
                p=(h-b)*signs; p[a]=h[a]*signs[a];pts.append(p)
        # Small convex hull uses scipy only during authoring, not at runtime.
        from scipy.spatial import ConvexHull
        pts=np.array(pts); hull=ConvexHull(pts)
        v=[];f=[];uv=[];nn=[]
        for face,eq in zip(hull.simplices,hull.equations):
            tri=pts[face]; normal=eq[:3]
            if np.dot(np.cross(tri[1]-tri[0],tri[2]-tri[0]),normal)<0:tri=tri[[0,2,1]]
            axis=int(np.argmax(abs(normal)));axes=[i for i in range(3) if i!=axis]
            # Wood grain follows the long board direction (texture V), while
            # stone uses a consistent metric scale rather than stretched UVs.
            if size[axes[0]]>size[axes[1]]:axes.reverse()
            k=len(v);v.extend(tri);f.append([k,k+1,k+2]);nn.extend([normal]*3)
            for p in tri:
                if mat in ('limestone','basalt'):
                    uv.append([p[axes[0]]*3,p[axes[1]]*3])
                else:
                    uv.append([(p[axes[0]]/max(size[axes[0]],1e-6)+.5),(p[axes[1]]/max(size[axes[1]],1e-6)+.5)])
        p=self.add(name,mat,v,f,uv,nn)
        return self.transform(p,rotation=rotation,offset=center)

    def lathe(self,name,mat,profile,segments=32,center=(0,0,0),arc=math.tau,phase=0,uv_scale=(1,1)):
        """Closed/open radial profile; duplicate each profile strip for crisp rims.
        Profile runs from bottom outer surface upwards then down its inside.
        The normal at each corner is averaged only across gentle slopes.
        """
        prof=np.asarray(profile,dtype=float); vv=[];ff=[];uu=[];nn=[]
        segs=len(prof)-1
        sl=[]
        for i in range(segs):
            dr,dz=prof[i+1]-prof[i];sl.append(normalized([dz, -dr]))
        dist=np.r_[0,np.cumsum(np.linalg.norm(np.diff(prof,axis=0),axis=1))];total=max(dist[-1],1e-9)
        for j in range(segs):
            if np.linalg.norm(prof[j+1]-prof[j])<1e-10:continue
            ns=[]
            for q in (j,j+1):
                prev=sl[max(0,q-1)];nex=sl[min(segs-1,q)]
                ns.append(normalized(prev+nex) if np.dot(prev,nex)>.8 else sl[j])
            start=len(vv)
            for k in range(segments+1):
                a=phase+arc*k/segments;c=math.cos(a);s=math.sin(a)
                for row,q in enumerate((j,j+1)):
                    r,z=prof[q]; vv.append([r*c,r*s,z]); uu.append([k/segments*uv_scale[0],dist[q]/total*uv_scale[1]])
                    n=ns[row];nn.append([n[0]*c,n[0]*s,n[1]])
            for k in range(segments):
                i=start+k*2;ff.extend([[i,i+2,i+1],[i+1,i+2,i+3]])
        return self.transform(self.add(name,mat,vv,ff,uu,nn),offset=center)

    def cylinder(self,name,mat,radius,depth,center=(0,0,0),segments=24,bevel=.005):
        b=min(bevel,depth*.23,radius*.25)
        return self.lathe(name,mat,[(0,-depth/2),(radius-b,-depth/2),(radius,-depth/2+b),(radius,depth/2-b),(radius-b,depth/2),(0,depth/2)],segments,center)

    def tube(self,name,mat,points,radii,sides=8):
        ps=np.asarray(points,dtype=float); rs=np.broadcast_to(radii,(len(ps),))
        tangent=normalized(np.gradient(ps,axis=0));vv=[];uv=[];ff=[];nn=[]
        lens=np.r_[0,np.cumsum(np.linalg.norm(np.diff(ps,axis=0),axis=1))]; lens/=max(lens[-1],1e-9)
        for j,(c,r,t) in enumerate(zip(ps,rs,tangent)):
            ref=np.array([0.,0.,1.]) if abs(t[2])<.9 else np.array([0.,1.,0.])
            x=normalized(np.cross(t,ref));y=np.cross(t,x)
            for i in range(sides+1):
                a=math.tau*i/sides;n=x*math.cos(a)+y*math.sin(a);vv.append(c+r*n);nn.append(n);uv.append([i/sides,lens[j]])
        for j in range(len(ps)-1):
            for i in range(sides):
                a=j*(sides+1)+i;b=a+sides+1;ff.extend([[a,a+1,b],[a+1,b+1,b]])
        # geometry end caps; separate cap material can be overlaid for cut timber.
        for row,direction in [(0,-1),(len(ps)-1,1)]:
            ci=len(vv);vv.append(ps[row]);nn.append(tangent[row]*direction);uv.append([.5,.5]);base=row*(sides+1)
            for i in range(sides):ff.append([ci,base+i+1,base+i] if direction<0 else [ci,base+i,base+i+1])
        return self.add(name,mat,vv,ff,uv,nn)

    def torus(self,name,mat,radius,minor,center=(0,0,0),major_seg=40,minor_seg=6,rotation=None):
        vv=[];uv=[];ff=[];nn=[]
        for i in range(major_seg+1):
            a=math.tau*i/major_seg
            for j in range(minor_seg+1):
                b=math.tau*j/minor_seg
                vv.append([(radius+minor*math.cos(b))*math.cos(a),(radius+minor*math.cos(b))*math.sin(a),minor*math.sin(b)])
                nn.append([math.cos(b)*math.cos(a),math.cos(b)*math.sin(a),math.sin(b)]);uv.append([i/major_seg,j/minor_seg])
        for i in range(major_seg):
            for j in range(minor_seg):
                k=i*(minor_seg+1)+j;l=k+minor_seg+1;ff.extend([[k,l,k+1],[k+1,l,l+1]])
        return self.transform(self.add(name,mat,vv,ff,uv,nn),rotation=rotation,offset=center)

    def ellipsoid(self,name,mat,center,size,seed=0,rough=0,segments=20,rings=10):
        rng=np.random.default_rng(seed); vv=[];uv=[];ff=[]
        phases=rng.uniform(0,6.28,6)
        for j in range(rings+1):
            t=math.pi*j/rings
            for i in range(segments+1):
                a=math.tau*i/segments
                wave=((math.sin(3*a+phases[0])*math.sin(4*t+phases[1])*.5+math.sin(7*a+phases[2])*math.sin(3*t+phases[3])*.3)*math.sin(t)**2+math.cos(5*t+phases[4])*.2)
                r=1+rough*wave
                vv.append([r*math.sin(t)*math.cos(a),r*math.sin(t)*math.sin(a),r*math.cos(t)]);uv.append([i/segments,j/rings])
        for j in range(rings):
            for i in range(segments):
                k=j*(segments+1)+i;l=k+segments+1;ff.extend([[k,l,k+1],[k+1,l,l+1]])
        vv=np.array(vv);ff=np.array(ff)
        return self.transform(self.add(name,mat,vv,ff,uv),scale=np.array(size)/2,offset=center)

    def disk(self,name,mat,radius,z,center=(0,0),segments=48):
        vv=[[center[0],center[1],z]];uv=[[.5,.5]];ff=[]
        for i in range(segments):
            a=math.tau*i/segments;vv.append([center[0]+radius*math.cos(a),center[1]+radius*math.sin(a),z]);uv.append([.5+.49*math.cos(a),.5+.49*math.sin(a)])
        for i in range(segments):ff.append([0,i+1,(i+1)%segments+1])
        return self.add(name,mat,vv,ff,uv,[[0,0,1]]*len(vv))

def rot(axis,a):
    c=math.cos(a);s=math.sin(a)
    if axis=='x':return np.array([[1,0,0],[0,c,-s],[0,s,c]])
    if axis=='y':return np.array([[c,0,s],[0,1,0],[-s,0,c]])
    return np.array([[c,-s,0],[s,c,0],[0,0,1]])

def align_z(direction):
    z=normalized(direction);x=normalized(np.cross([0,1,0] if abs(z[1])<.9 else [1,0,0],z));y=np.cross(z,x)
    return np.column_stack([x,y,z])
