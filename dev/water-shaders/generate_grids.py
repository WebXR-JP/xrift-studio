"""Generate indexed, texture-free glTF 2.0 water grids. Python standard library only."""
import json, struct, argparse
from pathlib import Path

def make_grid(output: Path, subdivisions: int) -> dict:
    n = subdivisions
    positions = [(64*(x/n-.5), 0.0, 64*(z/n-.5)) for z in range(n+1) for x in range(n+1)]
    normals = [(0.0, 1.0, 0.0)] * len(positions)
    uvs = [(x/n, z/n) for z in range(n+1) for x in range(n+1)]
    indices = []
    for z in range(n):
        for x in range(n):
            a = z*(n+1)+x; b=a+1; c=a+n+1; d=c+1
            indices.extend((a,c,b,b,c,d))
    blocks = [struct.pack('<'+'f'*len(v), *v) for v in [
        [q for p in positions for q in p], [q for p in normals for q in p], [q for p in uvs for q in p]]]
    blocks.append(struct.pack('<'+'H'*len(indices), *indices))
    data = bytearray(); views = []
    for k, block in enumerate(blocks):
        while len(data)%4: data.append(0)
        views.append(dict(buffer=0, byteOffset=len(data), byteLength=len(block), target=34963 if k==3 else 34962))
        data.extend(block)
    while len(data)%4: data.append(0)
    doc = dict(asset=dict(version='2.0', generator='XRift Studio water-grid generator'), scene=0,
        scenes=[dict(nodes=[0])], nodes=[dict(name=f'OceanGrid_64m_{n}',mesh=0)],
        meshes=[dict(primitives=[dict(attributes=dict(POSITION=0,NORMAL=1,TEXCOORD_0=2),indices=3,material=0)])],
        materials=[dict(name='Replace_with_Water_Shader',doubleSided=True,pbrMetallicRoughness=dict(baseColorFactor=[.05,.25,.3,1],metallicFactor=0,roughnessFactor=.4))],
        buffers=[dict(byteLength=len(data))],bufferViews=views,
        accessors=[dict(bufferView=0,componentType=5126,count=len(positions),type='VEC3',min=[-32,0,-32],max=[32,0,32]),
        dict(bufferView=1,componentType=5126,count=len(positions),type='VEC3'),dict(bufferView=2,componentType=5126,count=len(positions),type='VEC2'),
        dict(bufferView=3,componentType=5123,count=len(indices),type='SCALAR',min=[0],max=[len(positions)-1])])
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    blob=struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(data))+struct.pack('<II',len(j),0x4E4F534A)+j+struct.pack('<II',len(data),0x004E4942)+data
    output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(blob)
    return dict(file=output.name,vertices=len(positions),triangles=len(indices)//3,bytes=len(blob))

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path);args=p.parse_args()
    report=[make_grid(args.output/f'ocean-grid-64m-{n}.glb',n) for n in (64,128)]
    (args.output/'mesh-info.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
