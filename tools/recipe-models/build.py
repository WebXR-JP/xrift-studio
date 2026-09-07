"""Rebuild the deliverable GLBs, refresh hashes, then validate the catalog.

Run from the project root: python tools/recipe-models/build.py
Dependencies are authoring-only (see requirements-authoring.txt).
"""
from pathlib import Path
import argparse
import json
from models import BUILDERS
from textures import create
from glb import export_model
from optimize_studio import optimize
from sync_catalog import main as sync_catalog
from validate_assets import main as validate_assets
ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', help='Limit a geometry edit to selected model file stems')
    args = parser.parse_args()
    if args.only and set(args.only) - (set(BUILDERS) | {'recording-studio'}):
        parser.error('Unknown model name in --only')
    materials = create()
    materials['window-glass'] = {'color':[.16,.29,.32,.18], 'roughness':.15, 'metallic':.1, 'alphaMode':'BLEND'}
    (ROOT/'materials.json').write_text(json.dumps(materials, indent=2), encoding="utf-8")
    before = {d['file'].removesuffix('.glb'):d for d in json.loads((PROJECT/'docs/asset-refresh/before.json').read_text(encoding="utf-8"))}
    result_file = ROOT/'build-results.json'
    results = {d['file']:d for d in json.loads(result_file.read_text(encoding="utf-8"))} if result_file.exists() else {}
    for name, builder in BUILDERS.items():
        if args.only and name not in args.only:
            continue
        model = builder()
        if name in before:
            model.fit(before[name])
        info = export_model(model, materials, ROOT/'textures', PROJECT/f'public/visual-editor/recipe-assets/{name}.glb', ROOT/'sources')
        results[info['file']] = info
        print(name, info, flush=True)
    if not args.only or 'recording-studio' in args.only:
        info = optimize(ROOT/'sources/recording-studio.original.glb', PROJECT/'public/visual-editor/recipe-assets/recording-studio.glb')
        (ROOT/'studio-optimization.json').write_text(json.dumps(info, indent=2), encoding="utf-8")
    result_file.write_text(json.dumps(list(results.values()), indent=2), encoding="utf-8")
    sync_catalog()
    validate_assets()


if __name__ == '__main__':
    main()
