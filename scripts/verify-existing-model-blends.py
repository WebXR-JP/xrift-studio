"""Real Blender reimport/export verification of a prepared migration."""
import hashlib
import json
from pathlib import Path
import runpy
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-tauri/src"))
from blender_material_roundtrip import read_glb, MTOON

prepared = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
report = json.loads((prepared / "report.json").read_text(encoding="utf-8"))
exporter = Path(__file__).resolve().parents[1] / "src-tauri/src/blender_source.py"
output = prepared / "verification"
output.mkdir(exist_ok=True)


def bones(document):
    return {document["nodes"][index]["name"] for skin in document.get("skins", []) for index in skin["joints"]}


def mtoons(document):
    used = {p["material"] for mesh in document.get("meshes", []) for p in mesh["primitives"] if "material" in p}
    return sorted(json.dumps(document["materials"][index]["extensions"][MTOON], sort_keys=True)
                  for index in used if MTOON in document["materials"][index].get("extensions", {}))


for index, model in enumerate(report["models"]):
    original, _ = read_glb((Path(report["project"]) / model["source"]).read_bytes())
    blend = prepared / model["blend"]
    target = output / f"{index}.glb"
    sys.argv = [str(exporter), "--", str(blend), str(target)]
    runpy.run_path(str(exporter), run_name="__main__")
    converted, _ = read_glb(target.read_bytes())
    if bones(original) != bones(converted):
        raise ValueError("Bone identities changed: " + model["id"])
    if mtoons(original) != mtoons(converted):
        raise ValueError("MToon settings changed: " + model["id"])
    if not converted.get("meshes"):
        raise ValueError("Missing exported geometry: " + model["id"])
    model["verifiedBlendSha256"] = hashlib.sha256(blend.read_bytes()).hexdigest()
    model["verifiedGlb"] = str(target.relative_to(prepared))
    print("VERIFIED " + model["id"], flush=True)
(prepared / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("VERIFIED TOTAL " + str(len(report["models"])))
