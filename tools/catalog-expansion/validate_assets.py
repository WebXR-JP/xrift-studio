"""Validate this expansion's GLBs/PNGs and their content-addressed registry.

Requires the same numpy/Pillow authoring dependencies as generate_assets.py.
This is structural validation, not the official Khronos validator or a Play test.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
import struct
from pathlib import Path
from PIL import Image

PROJECT = Path(__file__).resolve().parents[2]

def main() -> None:
    spec = importlib.util.spec_from_file_location('recipe_model_checks', PROJECT/'tools/recipe-models/validate_assets.py')
    if spec is None or spec.loader is None:
        raise RuntimeError('Recipe-model validator is missing')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    report = json.loads((PROJECT/'tools/catalog-expansion/asset-report.json').read_text(encoding='utf-8'))
    models, textures = report['models'], report['textures']
    assert len(models)==12 and len(textures)==46, 'Unexpected catalog asset counts'
    all_items = models + textures
    assert len({x['assetId'] for x in all_items})==len(all_items), 'Duplicate asset IDs'
    directory=PROJECT/'public/visual-editor/catalog-samples'
    assert {p.name for p in directory.iterdir() if p.is_file()}=={x['fileName'] for x in all_items}, 'Missing or unregistered files'
    model_results=[]
    texture_results=[]
    for item in all_items:
        file=directory/item['fileName']; data=file.read_bytes()
        assert len(data)==item['byteLength'], f'{file.name}: byte length mismatch'
        assert hashlib.sha256(data).hexdigest()==item['sha256'], f'{file.name}: hash mismatch'
        kind='model' if file.suffix=='.glb' else 'texture'
        assert item['assetId']==f"{kind}-{file.stem}-{item['sha256'][:12]}", f'{file.name}: asset ID mismatch'
        if kind=='model':
            result=module.inspect(file)
            length=struct.unpack_from('<I',data,12)[0]
            gltf=json.loads(data[20:20+length])
            for primitive in gltf['meshes'][0]['primitives']:
                assert {'POSITION','NORMAL','TEXCOORD_0','TANGENT'} <= primitive['attributes'].keys(), 'Missing UV/tangent data'
            assert all(m['name']=='Sample Surface' for m in gltf['materials']), 'Material slot drift'
            model_results.append(result)
        else:
            with Image.open(file) as image:
                image.load()
                assert image.format=='PNG' and image.size==(512,512), f'{file.name}: invalid PNG size'
                if 'grille' in file.name:
                    assert image.mode=='RGBA' and image.getextrema()[3]==(0,255), 'Missing real alpha cutout'
                expected='linear' if '-normal.' in file.name or '-orm.' in file.name else 'srgb'
                assert item['colorSpace']==expected, f'{file.name}: wrong color space'
                texture_results.append({'file':file.name,'bytes':len(data),'size':list(image.size),'mode':image.mode,'colorSpace':expected,'sha256':item['sha256']})
        print(f'PASS {file.name}')
    summary={'modelCount':len(models),'textureCount':len(textures),'assetBytes':sum(x['byteLength'] for x in all_items),'structuralChecks':'passed','officialKhronosValidator':'not run','StudioRenderingAndPlay':'not run in this environment','models':model_results,'textures':texture_results}
    output=PROJECT/'docs/catalog-expansion/asset-validation.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'PASS: {len(models)} models, {len(textures)} textures, {summary["assetBytes"]:,} bytes')

if __name__=='__main__':
    main()
