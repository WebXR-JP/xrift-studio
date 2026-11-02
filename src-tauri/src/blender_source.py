import bpy
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_material_roundtrip import read_glb, write_glb, restore_materials

source, target = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
# A copied project must remain editable on another machine. Do not silently
# export missing textures or resolve references relative to a temporary folder.
if bpy.data.libraries:
    raise RuntimeError("Make linked libraries local before importing")
for image in bpy.data.images:
    if image.source == "FILE" and not image.packed_file:
        raise RuntimeError("Pack external images into the blend file: " + image.name)
if not any(o.type in {"MESH", "CURVE", "SURFACE", "FONT", "META"} for o in bpy.context.scene.objects):
    raise RuntimeError("No geometry in the active scene")
bpy.ops.export_scene.gltf(filepath=target, export_format="GLB", export_yup=True,
                          export_animations=True, export_cameras=False, export_lights=False,
                          export_extras=True)
document, binary = read_glb(Path(target).read_bytes())
Path(target).write_bytes(write_glb(restore_materials(document), binary))
