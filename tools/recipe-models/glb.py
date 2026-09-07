"""Small, validated glTF 2.0 writer for static PBR props (stdlib + NumPy).
No opaque compression extension: the catalog's plain GLTFLoader can load it.
"""
from __future__ import annotations
import json,struct,hashlib,gzip
from pathlib import Path
import numpy as np
from geometry import Model,Part,normalized,normals

def smooth_normals(v,f):
    # Share normal contributions over UV seams, but not across separate parts.
    keys=np.round(v,7);unique,inv=np.unique(keys,axis=0,return_inverse=True)
    n=np.zeros_like(unique);fn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
    for k in range(3):np.add.at(n,inv[f[:,k]],fn)
    out=normalized(n)[inv];out[np.linalg.norm(out,axis=1)<.5]=[0,0,1]
    return out

def clean(p):
    v=p.vertices; f=p.faces
    area=np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1)
    f=f[area>1e-12]
    if not len(f):return None
    ids,inv=np.unique(f.ravel(),return_inverse=True)
    n=p.normals if p.normals is not None else smooth_normals(v,f)
    out=Part(p.name,p.material,v[ids],inv.reshape(-1,3),p.uv[ids],normalized(n[ids]))
    assert np.isfinite(out.vertices).all() and np.isfinite(out.normals).all()
    return out

def tangent_frame(v,n,uv,f):
    t=np.zeros_like(v);b=np.zeros_like(v)
    e1=v[f[:,1]]-v[f[:,0]];e2=v[f[:,2]]-v[f[:,0]]
    d1=uv[f[:,1]]-uv[f[:,0]];d2=uv[f[:,2]]-uv[f[:,0]]
    det=d1[:,0]*d2[:,1]-d1[:,1]*d2[:,0];inv=np.zeros_like(det);ok=np.abs(det)>1e-12;inv[ok]=1/det[ok]
    ft=(e1*d2[:,1,None]-e2*d1[:,1,None])*inv[:,None]
    fb=(e2*d1[:,0,None]-e1*d2[:,0,None])*inv[:,None]
    for k in range(3):np.add.at(t,f[:,k],ft);np.add.at(b,f[:,k],fb)
    t-=n*np.sum(n*t,axis=1,keepdims=True)
    bad=np.linalg.norm(t,axis=1)<1e-10
    refs=np.tile([0.,0.,1.],(len(v),1));refs[np.abs(n[:,2])>.9]=[0,1,0]
    t[bad]=np.cross(refs[bad],n[bad]);t=normalized(t)
    sign=np.where(np.sum(np.cross(n,t)*b,axis=1)<0,-1,1)
    return np.c_[t,sign]

class GLB:
    def __init__(self):
        self.j={'asset':{'version':'2.0','generator':'XRift Studio original recipe rebuild 1.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[]}],'materials':[],'accessors':[],'bufferViews':[],'buffers':[{'byteLength':0}],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]};self.bin=bytearray();self.tex={}
    def view(self,data,target=None):
        while len(self.bin)%4:self.bin.append(0)
        i=len(self.j['bufferViews']);v={'buffer':0,'byteOffset':len(self.bin),'byteLength':len(data)}
        if target:v['target']=target
        self.j['bufferViews'].append(v);self.bin.extend(data);return i
    def acc(self,a,typ,target=34962,position=False):
        a=np.asarray(a); ct={np.dtype('<f4'):5126,np.dtype('<u2'):5123,np.dtype('<u4'):5125}[a.dtype]
        v=self.view(a.tobytes(),target);d={'bufferView':v,'componentType':ct,'count':len(a),'type':typ}
        if position:d.update(min=a.min(0).astype(float).tolist(),max=a.max(0).astype(float).tolist())
        idx=len(self.j['accessors']);self.j['accessors'].append(d);return idx
    def image(self,name,data,mime):
        key=hashlib.sha256(data).hexdigest()
        if key in self.tex:return self.tex[key]
        i=len(self.j['images']);self.j['images'].append({'name':name,'bufferView':self.view(data),'mimeType':mime})
        ti=len(self.j['textures']);self.j['textures'].append({'source':i,'sampler':0});self.tex[key]=ti;return ti
    def material(self,name,d,texture_root):
        mat={'name':name,'pbrMetallicRoughness':{'baseColorFactor':d.get('color',[1,1,1,1]),'roughnessFactor':d.get('roughness',.7),'metallicFactor':d.get('metallic',0)}}
        for key,slot in [('baseColorTexture','baseColorTexture'),('normalTexture','normalTexture')]:
            if key in d:
                p=texture_root/d[key];i=self.image(p.stem,p.read_bytes(),'image/png' if p.suffix=='.png' else 'image/jpeg')
                if key=='baseColorTexture':mat['pbrMetallicRoughness'][slot]={'index':i}
                else:mat[slot]={'index':i}
        if d.get('doubleSided'):mat['doubleSided']=True
        if d.get('emissive'):mat['emissiveFactor']=d['emissive']
        if d.get('alphaMode'):mat['alphaMode']=d['alphaMode']
        self.j['materials'].append(mat);return len(self.j['materials'])-1
    def primitive(self,parts,matid,has_texture=True):
        vs=[];ns=[];uvs=[];fs=[];offset=0
        # Export rotation Blender Z-up -> glTF Y-up; determinant = +1.
        R=np.array([[1,0,0],[0,0,1],[0,-1,0]],dtype=float)
        for p in parts:
            vs.append(p.vertices@R.T);ns.append(p.normals@R.T);uvs.append(p.uv);fs.append(p.faces+offset);offset+=len(p.vertices)
        v=np.vstack(vs);n=np.vstack(ns);uv=np.vstack(uvs);f=np.vstack(fs)
        # Index repeated face corners while retaining hard normals and UV seams.
        packed=np.concatenate([v,n,uv],axis=1).astype('<f4');unique,inv=np.unique(packed,axis=0,return_inverse=True)
        f=inv[f];v=unique[:,:3];n=unique[:,3:6];uv=unique[:,6:8]
        attrs={'POSITION':self.acc(v,'VEC3',position=True),'NORMAL':self.acc(n,'VEC3')}
        if has_texture:
            attrs['TEXCOORD_0']=self.acc(uv,'VEC2')
            if 'normalTexture' in self.j['materials'][matid]:attrs['TANGENT']=self.acc(tangent_frame(v.astype(float),n.astype(float),uv.astype(float),f).astype('<f4'),'VEC4')
        index=self.acc(f.ravel().astype('<u2' if len(v)<65536 else '<u4'),'SCALAR',34963)
        self.j['meshes'][0]['primitives'].append({'attributes':attrs,'indices':index,'material':matid,'mode':4})
    def write(self,path):
        self.j['buffers'][0]['byteLength']=len(self.bin)
        for key in ['images','textures']:
            if not self.j[key]:del self.j[key]
        if 'textures' not in self.j:del self.j['samplers']
        jb=json.dumps(self.j,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*((-len(jb))%4);bb=bytes(self.bin)+b'\0'*((-len(self.bin))%4)
        out=struct.pack('<III',0x46546c67,2,12+8+len(jb)+8+len(bb))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(bb),0x004e4942)+bb
        Path(path).write_bytes(out);return out

def export_model(model,materials,texture_root,out,source_dir):
    model.parts=[c for p in model.parts if (c:=clean(p)) is not None]
    g=GLB();g.j['nodes'][0]['name']=model.name;g.j['meshes'][0]['name']=model.name
    g.j['asset']['copyright']='Project-original geometry and textures for XRift Studio; no third-party model data'
    g.j['nodes'][0]['extras']={'units':'metres','authoringSource':f'tools/recipe-models/sources/{model.name}.json.gz'}
    for mat in dict.fromkeys(p.material for p in model.parts):
        d=materials[mat];mi=g.material(mat,d,texture_root)
        g.primitive([p for p in model.parts if p.material==mat],mi,'normalTexture' in d or 'baseColorTexture' in d)
    data=g.write(out)
    source={'name':model.name,'coordinates':'Blender Z-up metres','materials':{m:materials[m] for m in dict.fromkeys(p.material for p in model.parts)},'parts':[{'name':p.name,'material':p.material,'vertices':np.round(p.vertices,7).tolist(),'triangles':p.faces.tolist(),'uv':np.round(p.uv,7).tolist(),'normals':np.round(p.normals,7).tolist()} for p in model.parts]}
    source_dir.mkdir(exist_ok=True)
    # mtime=0 makes the compressed authoring sources reproducible too.
    with (source_dir/f'{model.name}.json.gz').open('wb') as handle:
        with gzip.GzipFile(fileobj=handle,mode='wb',mtime=0) as gz:gz.write(json.dumps(source,separators=(',',':')).encode())
    return {'file':Path(out).name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':sum(len(p.faces) for p in model.parts),'drawPrimitives':len(g.j['materials']),'authoringParts':len(model.parts)}
