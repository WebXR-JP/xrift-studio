"""Pin byte lengths and SHA-256 identities after (re)exporting recipe GLBs.

Run this after every asset edit. No JavaScript/runtime dependencies are needed.
Existing public paths and stable modelIds are preserved; imported assetIds are
content-addressed and intentionally change when the model changes.
"""
from pathlib import Path
import hashlib,json,re,struct
ROOT=Path(__file__).resolve().parent;PROJECT=ROOT.parent.parent
TS=PROJECT/'src/lib/visual-editor/builtin-recipe-models.ts'

def main():
    source=TS.read_text(encoding="utf-8");items=json.loads((ROOT/'catalog.json').read_text(encoding="utf-8"));blocks=[];manifest=[]
    for item in items:
        p=PROJECT/'public/visual-editor/recipe-assets'/item['fileName'];raw=p.read_bytes();sha=hashlib.sha256(raw).hexdigest()
        j=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
        bounds=[j['accessors'][pr['attributes']['POSITION']] for m in j['meshes'] for pr in m['primitives']]
        radius=max(max(a['max'][i] for a in bounds)-min(a['min'][i] for a in bounds) for i in range(3))/2
        data={**item,'assetId':f'model-{p.stem}-{sha[:12]}','publicPath':f'/visual-editor/recipe-assets/{p.name}','sha256':sha,'byteLength':len(raw),'approxRadius':round(radius,4),'bounds':{'min':[min(a['min'][i] for a in bounds) for i in range(3)],'max':[max(a['max'][i] for a in bounds) for i in range(3)]},'provenance':('Original XRift Studio recording-studio geometry retained and repacked. Poly Haven CC0 textures resized to 512px; see THIRD_PARTY_ASSETS.md.' if item['modelId']=='recordingStudio' else 'Project-original mesh and PBR texture authoring; editable Blender reconstruction source included under tools/recipe-models/. GLBs generated independently of Blender; see docs/asset-refresh/README.md.')}
        manifest.append(data)
        keys=['modelId','assetId','publicPath','fileName','sha256','byteLength','displayName','approxRadius','bounds','provenance']
        lines=['  {']
        for k in keys:
            value=json.dumps(data[k],ensure_ascii=False)
            lines += [f'    {k}:',f'      {value},'] if k in ('sha256','provenance') else [f'    {k}: {value},']
        lines.append('  },');blocks.append('\n'.join(lines))
    match=re.search(r'(export const BUILTIN_RECIPE_MODELS: readonly BuiltinRecipeModelDefinition\[\] = \[\n)(.*?)(\n\];)',source,re.S)
    if match is None:raise ValueError('Catalog declaration not found; refusing a blind rewrite.')
    source=source[:match.start(2)]+'\n'.join(blocks)+source[match.end(2):]
    source=source.replace('Recorded for THIRD_PARTY_ASSETS.md-style provenance; these are original, not third-party.','Geometry and texture provenance; recording-studio retains its documented CC0 textures.')
    TS.write_text(source, encoding="utf-8")
    (PROJECT/'docs/asset-refresh/manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n', encoding="utf-8")
    print(f'Pinned {len(items)} model definitions and manifest entries.')
if __name__=='__main__':main()
