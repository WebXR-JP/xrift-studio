"""Validate the packaged recipe GLBs and pinned catalog without downloading tools.

Checks structural glTF invariants, indices, bounds, normals/tangents, embedded
images and material ranges. This is a project regression check, not a claim of
having run the Khronos glTF Validator or XRift Studio itself.
"""
from __future__ import annotations
import hashlib,io,json,math,struct
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent;PROJECT=ROOT.parent.parent


def inspect(path: Path):
    data=path.read_bytes()
    assert len(data)>=28, f'{path.name}: truncated GLB'
    magic,version,length=struct.unpack_from('<III',data)
    assert (magic,version,length)==(0x46546c67,2,len(data)), 'GLB header/length mismatch'
    jl,jt=struct.unpack_from('<II',data,12)
    assert jt==0x4e4f534a and jl%4==0, 'Invalid JSON chunk'
    j=json.loads(data[20:20+jl]);bl,bt=struct.unpack_from('<II',data,20+jl)
    assert bt==0x004e4942 and bl%4==0 and 28+jl+bl==len(data), 'Invalid BIN chunk'
    binary=data[28+jl:];assert j['asset']['version']=='2.0'
    assert len(j['buffers'])==1 and 'uri' not in j['buffers'][0], 'External buffer'
    assert len(binary)-3<=j['buffers'][0]['byteLength']<=len(binary)
    assert not j.get('skins') and not j.get('animations'), 'Unexpected skin/animation'
    assert not any(e in j.get('extensionsRequired',[]) for e in ['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu']), 'New runtime decoder needed'
    for view in j.get('bufferViews',[]):
        assert view['buffer']==0 and view.get('byteOffset',0)%4==0
        assert 0<=view.get('byteOffset',0)<len(binary)
        assert 0<view['byteLength'] and view.get('byteOffset',0)+view['byteLength']<=len(binary)
    arrays=[]
    for a in j.get('accessors',[]):
        assert not a.get('sparse'), 'Unexpected sparse accessor'
        v=j['bufferViews'][a['bufferView']]
        d={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        item=np.dtype(d).itemsize;offset=a.get('byteOffset',0);stride=v.get('byteStride',w*item)
        assert a['count']>0 and stride>=w*item and offset%item==0
        assert offset+(a['count']-1)*stride+w*item<=v['byteLength']
        arr=np.ndarray((a['count'],w),dtype=d,buffer=binary,offset=v.get('byteOffset',0)+offset,strides=(stride,item)).copy()
        assert np.isfinite(arr).all(), 'NaN or Infinity'
        arrays.append(arr)
    triangles=0;draw=0;positions=[];inverted=0;vertex_count=0
    # Runtime outputs are intentionally one identity node and one batched mesh.
    assert len(j['meshes'])==1 and len(j['nodes'])==1
    node=j['nodes'][0];assert node['mesh']==0 and not any(k in node for k in ['matrix','translation','rotation','scale'])
    for pr in j['meshes'][0]['primitives']:
        assert pr.get('mode',4)==4 and 'indices' in pr
        a=pr['attributes'];v=arrays[a['POSITION']].astype(float);n=arrays[a['NORMAL']].astype(float)
        f=arrays[pr['indices']].reshape(-1,3).astype(int)
        assert f.min()>=0 and f.max()<len(v)
        assert n.shape==v.shape and np.max(abs(np.linalg.norm(n,axis=1)-1))<1e-4, 'Non-unit normals'
        for attribute in a.values():assert len(arrays[attribute])==len(v), 'Attribute length mismatch'
        pos=j['accessors'][a['POSITION']]
        assert np.allclose(pos['min'],v.min(0),atol=1e-5) and np.allclose(pos['max'],v.max(0),atol=1e-5), 'Wrong accessor bounds'
        fn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
        assert np.min(np.linalg.norm(fn,axis=1))>1e-14, 'Degenerate triangles'
        directions=np.sum(fn*n[f].mean(1),axis=1)/np.maximum(np.linalg.norm(fn,axis=1),1e-20)
        inverted+=int(np.sum(directions<-.1))
        if 'TANGENT' in a:
            t=arrays[a['TANGENT']].astype(float)
            assert np.max(abs(np.linalg.norm(t[:,:3],axis=1)-1))<1e-4, 'Non-unit tangents'
            assert np.max(abs(np.sum(n*t[:,:3],axis=1)))<1e-4, 'Tangent not orthogonal'
            assert np.all(np.isin(t[:,3],[-1,1]))
        mat=j['materials'][pr['material']]
        if 'normalTexture' in mat:assert 'TANGENT' in a and 'TEXCOORD_0' in a
        positions.append(v);triangles+=len(f);draw+=1;vertex_count+=len(v)
    images=[]
    for im in j.get('images',[]):
        assert 'uri' not in im and im['mimeType'] in ('image/jpeg','image/png')
        v=j['bufferViews'][im['bufferView']];off=v.get('byteOffset',0)
        image=Image.open(io.BytesIO(binary[off:off+v['byteLength']]))
        assert max(image.size)<=512, 'Texture exceeds delivery budget'
        image.load();images.append({'size':list(image.size),'bytes':v['byteLength']})
    for tex in j.get('textures',[]):assert 0<=tex['source']<len(images)
    for mat in j['materials']:
        pbr=mat.get('pbrMetallicRoughness',{})
        assert 0<=pbr.get('roughnessFactor',1)<=1 and 0<=pbr.get('metallicFactor',1)<=1, 'Invalid PBR factors'
        assert all(0<=f<=1 for f in pbr.get('baseColorFactor',[1,1,1,1]))
        assert all(0<=f<=1 for f in mat.get('emissiveFactor',[0,0,0]))
        for info in [pbr.get('baseColorTexture'),pbr.get('metallicRoughnessTexture'),mat.get('normalTexture'),mat.get('emissiveTexture'),mat.get('occlusionTexture')]:
            if info is not None:assert 0<=info['index']<len(j.get('textures',[]))
    vs=np.vstack(positions)
    # Keep counts visible: tiny smooth-normal/fold disagreements need inspection,
    # not a silently altered winding. Major inversion is a hard regression.
    assert inverted/max(triangles,1)<.015, f'{inverted} triangles have opposing shading normals'
    return {'file':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'triangles':triangles,'drawPrimitives':draw,'materials':len(j['materials']),'meshInstances':1,'vertices':vertex_count,'images':images,'min':np.round(vs.min(0),4).tolist(),'max':np.round(vs.max(0),4).tolist(),'opposingSmoothNormals':inverted}


def main():
    manifest=json.loads((PROJECT/'docs/asset-refresh/manifest.json').read_text(encoding="utf-8"));results=[]
    before={d['file']:d for d in json.loads((PROJECT/'docs/asset-refresh/before.json').read_text(encoding="utf-8"))}
    folder=PROJECT/'public/visual-editor/recipe-assets'
    assert {p.name for p in folder.glob('*.glb')}=={d['fileName'] for d in manifest}, 'Unregistered or missing GLB'
    assert len(manifest)==32 and len({d['modelId'] for d in manifest})==32
    for item in manifest:
        path=folder/item['fileName'];result=inspect(path)
        assert result['sha256']==item['sha256'] and result['bytes']==item['byteLength'], 'Catalog digest mismatch'
        assert item['assetId']==f"model-{path.stem}-{result['sha256'][:12]}", 'Wrong content-addressed assetId'
        if path.name in before:
            for key in ('min','max'):assert np.allclose(result[key],before[path.name][key],atol=.00015), f'Placement envelope drift: {path.name} {key}'
        results.append(result);print(f"PASS {path.name:24} {result['bytes']:8} B {result['triangles']:6} triangles {result['drawPrimitives']:2} primitives")
    (PROJECT/'docs/asset-refresh/after.json').write_text(json.dumps(results,indent=2)+'\n', encoding="utf-8")
    summary={'models':len(results),'beforeModels':len(before),'beforeBytes':sum(d['bytes'] for d in before.values()),'afterBytes':sum(d['bytes'] for d in results),'beforeTriangles':sum(d['triangles'] for d in before.values()),'afterTriangles':sum(d['triangles'] for d in results),'beforeDrawPrimitives':sum(d['drawPrimitives'] for d in before.values()),'afterDrawPrimitives':sum(d['drawPrimitives'] for d in results),'modelStructuralChecks':'passed','existingPlacementEnvelopes':'29 matched within 0.15 mm','officialKhronosValidator':'not run','BlenderReconstruction':'not run (Blender unavailable)','StudioRuntimeAndFPS':'not assessed by this structural validator'}
    (PROJECT/'docs/asset-refresh/validation.json').write_text(json.dumps(summary,indent=2)+'\n', encoding="utf-8")
    print(json.dumps(summary,indent=2))
if __name__=='__main__':main()
