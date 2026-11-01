"""Run with Blender --background --factory-startup --disable-autoexec --python.

Creates sources and a reviewable manifest candidate in --output. It never writes
the original project. Use commit-existing-model-blends.mjs after closing Studio.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-tauri/src"))
from blender_material_roundtrip import read_glb, write_glb, prepare_materials

parser = argparse.ArgumentParser()
parser.add_argument("--project", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--model", action="append", default=[])
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
root = Path(args.project).resolve(strict=True)
output = Path(args.output).resolve()
if output == root or root in output.parents:
    raise ValueError("Output must be outside the original project")
output.mkdir(parents=True, exist_ok=False)
original = (root / "assets/assets.json").read_bytes()
manifest = json.loads(original)
report = {"project": str(root), "manifestSha256": hashlib.sha256(original).hexdigest(),
          "models": [], "skipped": []}
selected = set(args.model)
for asset in manifest["assets"].values():
    if asset["kind"] != "model" or (selected and asset["id"] not in selected):
        continue
    if asset.get("blenderSource"):
        report["skipped"].append({"id": asset["id"], "reason": "already editable"})
        continue
    source = asset["source"]
    if source["kind"] != "project" or not source["relativePath"].lower().endswith(".glb"):
        report["skipped"].append({"id": asset["id"], "reason": "requires project GLB"})
        continue
    source_path = (root / source["relativePath"]).resolve(strict=True)
    if root not in source_path.parents:
        raise ValueError("Source escapes project")
    data = source_path.read_bytes()
    document, binary = read_glb(data)
    # Do not silently discard extensions requiring a specialized importer.
    supported = {"VRMC_materials_mtoon", "KHR_materials_emissive_strength",
                 "KHR_materials_unlit", "KHR_texture_transform"}
    unknown = set(document.get("extensionsUsed", [])) - supported
    if unknown:
        report["skipped"].append({"id": asset["id"], "reason": "specialized extensions: " + ", ".join(sorted(unknown))})
        continue
    prepared = prepare_materials(document)
    digest = hashlib.sha256(data).hexdigest()
    asset_key = hashlib.sha256(asset["id"].encode()).hexdigest()[:16]
    relative = f"assets/imported/blender/{asset_key}/{digest[:16]}/model.blend"
    target = output / relative
    target.parent.mkdir(parents=True)
    temporary_glb = target.with_suffix(".glb")
    temporary_glb.write_bytes(write_glb(prepared, binary))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(temporary_glb), bone_heuristic="BLENDER")
    bpy.ops.file.pack_all()
    bpy.context.scene["xrift_model_asset_id"] = asset["id"]
    bpy.context.scene["xrift_source_sha256"] = digest
    bpy.context.scene["xrift_editing_note"] = "Geometry and bones are editable. MToon settings are preserved in material custom properties; confirm the final appearance in Studio."
    bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
    if not target.is_file():
        raise RuntimeError("Blender did not save the source")
    temporary_glb.unlink()
    asset["blenderSource"] = {"kind": "project", "relativePath": relative}
    report["models"].append({"id": asset["id"], "name": asset["name"],
        "source": source["relativePath"], "sourceSha256": digest, "blend": relative,
        "blendSha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "meshes": len([o for o in bpy.context.scene.objects if o.type == "MESH"]),
        "bones": sum(len(o.data.bones) for o in bpy.context.scene.objects if o.type == "ARMATURE")})
    print("PREPARED " + asset["id"], flush=True)
(output / "original-assets.json").write_bytes(original)
(output / "candidate-assets.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"prepared": len(report["models"]), "skipped": report["skipped"]}, ensure_ascii=False))
