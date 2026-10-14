"""Fixed XRift model builder. Input is validated data, never Python source."""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


# Studio/glTF use Y up. Blender uses Z up; this is a proper rotation, so
# winding, handedness and normals remain unchanged in the exported mesh.
STUDIO_TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def make_geometry(part):
    shape = part["shape"]
    if shape == "box":
        bpy.ops.mesh.primitive_cube_add(size=1)
    elif shape == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.5)
    elif shape == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.5, depth=1)
    elif shape == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.5, radius2=0, depth=1)
    elif shape == "torus":
        bpy.ops.mesh.primitive_torus_add(
            major_segments=32, minor_segments=12, major_radius=0.375, minor_radius=0.125
        )
    elif shape == "mesh":
        mesh = bpy.data.meshes.new(part["name"])
        vertices = [STUDIO_TO_BLENDER @ Vector(vertex) for vertex in part["vertices"]]
        mesh.from_pydata(vertices, [], part["faces"])
        mesh.update()
        obj = bpy.data.objects.new(part["name"], mesh)
        bpy.context.collection.objects.link(obj)
        return obj
    else:
        raise ValueError("Unsupported model shape")
    return bpy.context.object


def build(spec, glb_path, blend_path):
    # Factory startup is already isolated. Remove only that background Scene,
    # preserving every object in the person's separate Blender application.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    root = bpy.data.objects.new(spec["name"], None)
    bpy.context.collection.objects.link(root)
    objects = [root]
    for part in spec["parts"]:
        obj = make_geometry(part)
        obj.name = part["name"]
        obj.parent = root
        obj.location = STUDIO_TO_BLENDER @ Vector(part["position"])
        # Studio uses Three.js intrinsic XYZ (Rx @ Ry @ Rz). Blender's
        # Euler(..., "XYZ") composes those axes differently for combined angles.
        rx, ry, rz = [math.radians(value) for value in part["rotation"]]
        rotation = Matrix.Rotation(rx, 3, "X") @ Matrix.Rotation(ry, 3, "Y") @ Matrix.Rotation(rz, 3, "Z")
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = (STUDIO_TO_BLENDER @ rotation @ STUDIO_TO_BLENDER.transposed()).to_euler("XYZ")
        obj.scale = (part["scale"][0], part["scale"][2], part["scale"][1])
        material = bpy.data.materials.new(f"{part['name']} Material")
        material.use_nodes = True
        material.diffuse_color = tuple(part["color"])
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = tuple(part["color"])
        shader.inputs["Metallic"].default_value = part["metallic"]
        shader.inputs["Roughness"].default_value = part["roughness"]
        shader.inputs["Alpha"].default_value = part["color"][3]
        if part["color"][3] < 1:
            if hasattr(material, "surface_render_method"):
                material.surface_render_method = "DITHERED"
            else:
                material.blend_method = "BLEND"
        obj.data.materials.append(material)
        if part.get("bevel"):
            modifier = obj.modifiers.new("XRift Bevel", "BEVEL")
            modifier.width = part["bevel"]
            modifier.segments = 2
            modifier.limit_method = "ANGLE"
        objects.append(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[-1]
    bpy.context.view_layer.update()
    # Keep the editable modifiers in the .blend; the GLB evaluates those same
    # modifiers rather than substituting geometry or Materials at import time.
    saved = bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False, compress=False)
    if "FINISHED" not in saved:
        raise RuntimeError("Blender did not save the editable model")
    if not hasattr(bpy.types, "EXPORT_SCENE_OT_gltf"):
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    result = bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", use_selection=True,
        export_materials="EXPORT", export_yup=True, export_apply=True,
        export_animations=False, export_cameras=False, export_lights=False,
    )
    if "FINISHED" not in result or not glb_path.is_file():
        raise RuntimeError("Blender did not produce a GLB")


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) != 3:
        raise ValueError("Expected model JSON, GLB and blend paths")
    input_path, glb_path, blend_path = [Path(value) for value in args]
    for path in (input_path, glb_path, blend_path):
        if not path.is_absolute() or path.parent.resolve() != input_path.parent.resolve():
            raise ValueError("All model files must be inside the same isolated directory")
    if glb_path.exists() or blend_path.exists():
        raise FileExistsError("Generated models must not overwrite existing files")
    with input_path.open("r", encoding="utf-8") as file:
        spec = json.load(file)
    build(spec, glb_path, blend_path)


if __name__ == "__main__":
    main()
