"""Exercise editing a copy of an existing source, never the original project."""
import hashlib
import json
from pathlib import Path
import runpy
import sys
import bpy

prepared, output = map(Path, sys.argv[sys.argv.index("--") + 1:])
report = json.loads((prepared / "report.json").read_text(encoding="utf-8"))
model = report["models"][0]
output.mkdir(parents=True, exist_ok=False)
source = prepared / model["blend"]
original_bytes = source.read_bytes()
bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
changed = 0
for mesh in bpy.data.meshes:
    for vertex in mesh.vertices:
        vertex.co.x *= 1.1
        changed += 1
assert changed > 0
edited = output / "edited.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(edited))
exporter = Path(__file__).resolve().parents[1] / "src-tauri/src/blender_source.py"
sys.path.insert(0, str(exporter.parent))
from blender_material_roundtrip import read_glb, MTOON
sys.argv = [str(exporter), "--", str(edited), str(output / "edited.glb")]
runpy.run_path(str(exporter), run_name="__main__")
original_glb = (Path(report["project"]) / model["source"]).read_bytes()
(output / "original.glb").write_bytes(original_glb)
original, _ = read_glb(original_glb)
result_bytes = (output / "edited.glb").read_bytes()
result, _ = read_glb(result_bytes)
def toon_settings(document):
    return sorted(json.dumps(m["extensions"][MTOON], sort_keys=True)
                  for m in document.get("materials", []) if MTOON in m.get("extensions", {}))
assert toon_settings(original) and toon_settings(original) == toon_settings(result)
assert hashlib.sha256(original_glb).digest() != hashlib.sha256(result_bytes).digest()
assert source.read_bytes() == original_bytes
print(json.dumps({"editedVertices": changed, "mtoonMaterials": len(toon_settings(result)), "originalUnchanged": True}))
