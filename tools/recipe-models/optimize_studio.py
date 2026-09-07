"""Repack the existing Blender-made recording studio, preserving its geometry.

The immutable source GLB (including CC0 texture attribution) is kept in sources/.
Opaque parts are grouped by material; transparent parts stay independently sorted.
Textures are bounded at 512px. Invalid pre-existing roughness factors are clamped.
"""
from pathlib import Path
import copy, io, json, struct
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation
from glb import GLB, clean
from geometry import Part, normalized
ROOT=Path(__file__).resolve().parent


def optimize(source: Path, destination: Path):
    raw=source.read_bytes();jl=struct.unpack_from('<I',raw,12)[0]
    j=json.loads(raw[20:20+jl]);binary=raw[28+jl:]
    if j.get('animations') or j.get('skins'):
        raise ValueError('Only static, unskinned authoring sources can be merged.')
    def accessor(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']]
        if a.get('sparse'):raise ValueError('Sparse accessors must be expanded first.')
        dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        offset=v.get('byteOffset',0)+a.get('byteOffset',0);item=np.dtype(dtype).itemsize
        stride=v.get('byteStride',width*item)
        return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=offset,strides=(stride,item)).copy()
    g=GLB();g.j['materials']=copy.deepcopy(j['materials'])
    g.j['nodes'][0]['name']='recording-studio';g.j['meshes'][0]['name']='recording-studio'
    g.j['asset']['copyright']='Existing XRift Studio recording-studio geometry; Poly Haven CC0 textures, see THIRD_PARTY_ASSETS.md'
    g.j['asset']['generator']='XRift Studio static studio repack 1.0 (original Blender source preserved)'
    if j.get('extensionsUsed'):g.j['extensionsUsed']=j['extensionsUsed']
    texmap={};images={}
    # Decode once for texture IDs that use the same source image.
    for ti,tex in enumerate(j.get('textures',[])):
        ii=tex['source']
        if ii not in images:
            im=j['images'][ii];v=j['bufferViews'][im['bufferView']];off=v.get('byteOffset',0)
            image=Image.open(io.BytesIO(binary[off:off+v['byteLength']])).convert('RGB')
            image.thumbnail((512,512),Image.Resampling.LANCZOS)
            stream=io.BytesIO();image.save(stream,format='JPEG',quality=88,subsampling=0,optimize=True)
            images[ii]=g.image(im.get('name',f'image-{ii}'),stream.getvalue(),'image/jpeg')
        texmap[ti]=images[ii]
    for mat in g.j['materials']:
        pbr=mat.get('pbrMetallicRoughness',{})
        for k in ('roughnessFactor','metallicFactor'):
            if k in pbr:pbr[k]=min(1.,max(0.,pbr[k]))
        for info in [pbr.get('baseColorTexture'),pbr.get('metallicRoughnessTexture'),mat.get('normalTexture'),mat.get('occlusionTexture'),mat.get('emissiveTexture')]:
            if info is not None:info['index']=texmap[info['index']]
    groups={};R=np.array([[1,0,0],[0,0,1],[0,-1,0]],dtype=float)
    def visit(i,parent):
        node=j['nodes'][i];local=np.eye(4)
        if 'matrix' in node:local=np.array(node['matrix']).reshape(4,4).T
        else:
            if 'rotation' in node:local[:3,:3]=Rotation.from_quat(node['rotation']).as_matrix()
            local[:3,:3]=local[:3,:3]@np.diag(node.get('scale',[1,1,1]));local[:3,3]=node.get('translation',[0,0,0])
        world=parent@local
        if 'mesh' in node:
            for pi,pr in enumerate(j['meshes'][node['mesh']]['primitives']):
                if pr.get('mode',4)!=4 or pr.get('targets'):raise ValueError('Only triangle primitives without morph targets are supported.')
                attrs=pr['attributes'];v=accessor(attrs['POSITION']).astype(float);n=accessor(attrs['NORMAL']).astype(float)
                uv=accessor(attrs['TEXCOORD_0']).astype(float) if 'TEXCOORD_0' in attrs else np.zeros((len(v),2))
                faces=accessor(pr['indices']).reshape(-1,3) if 'indices' in pr else np.arange(len(v)).reshape(-1,3)
                v=v@world[:3,:3].T+world[:3,3];n=normalized(n@np.linalg.inv(world[:3,:3]))
                if np.linalg.det(world[:3,:3])<0:faces=faces[:,[0,2,1]]
                # GLB.primitive expects Blender-native Z-up input, so invert its export rotation.
                p=clean(Part(node.get('name',str(i)),str(pr['material']),v@R,faces,uv,n@R))
                if p is None:continue
                mat=pr['material'];key=(mat,i,pi) if g.j['materials'][mat].get('alphaMode')=='BLEND' else (mat,)
                groups.setdefault(key,[]).append(p)
        for child in node.get('children',[]):visit(child,world)
    for i in j['scenes'][j.get('scene',0)]['nodes']:visit(i,np.eye(4))
    for key,parts in groups.items():
        mat=key[0];m=g.j['materials'][mat];pbr=m.get('pbrMetallicRoughness',{})
        textured=any(k in pbr for k in ('baseColorTexture','metallicRoughnessTexture')) or any(k in m for k in ('normalTexture','occlusionTexture','emissiveTexture'))
        g.primitive(parts,mat,textured)
    data=g.write(destination)
    return {'file':destination.name,'beforeBytes':len(raw),'bytes':len(data),'drawPrimitives':len(groups),'triangles':sum(len(p.faces) for ps in groups.values() for p in ps),'materialRoughnessClamped':True}

if __name__=='__main__':
    result=optimize(ROOT/'sources/recording-studio.original.glb',ROOT.parent.parent/'public/visual-editor/recipe-assets/recording-studio.glb')
    (ROOT/'studio-optimization.json').write_text(json.dumps(result,indent=2), encoding="utf-8")
    print(json.dumps(result,indent=2))
