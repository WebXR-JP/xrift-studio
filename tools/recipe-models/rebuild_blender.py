"""Reconstruct the delivered mesh parts as editable native Blender projects.

Usage (Blender 4.2+):
  blender --background --python tools/recipe-models/rebuild_blender.py
  blender --background --python tools/recipe-models/rebuild_blender.py -- --only fountain campfire-base
  blender --background --python tools/recipe-models/rebuild_blender.py -- --only fountain --export

This script is included as authoring source. It was syntax-checked, but Blender
was not available in the delivery environment. The shipped GLBs were generated
and re-imported independently. Nothing here silently overwrites runtime GLBs.
"""
from __future__ import annotations
import argparse
import gzip
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent


def main() -> None:
    try:
        import bpy
        from mathutils import Vector
    except ImportError as error:
        raise SystemExit("Run this script with Blender's --python option, not system Python.") from error

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", help="Model file stems, such as fountain or bench")
    parser.add_argument("--output", type=Path, default=PROJECT / "blender")
    parser.add_argument("--export", action="store_true", help="Also export to blender/exports/, not public/")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    paths = {p.name.removesuffix(".json.gz"): p for p in sorted((ROOT / "sources").glob("*.json.gz"))}
    paths["recording-studio"] = ROOT / "sources/recording-studio.original.glb"
    names = args.only or list(paths)
    unknown = set(names) - set(paths)
    if unknown:
        raise SystemExit(f"Unknown models: {', '.join(sorted(unknown))}")
    args.output.mkdir(parents=True, exist_ok=True)

    for name in names:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        scene.name = name
        scene.unit_settings.system = "METRIC"
        scene.unit_settings.scale_length = 1.0
        scene["authoring_note"] = "Editable source for XRift Studio recipe asset refresh; metres, Blender Z-up."
        assets = bpy.data.collections.new(f"ASSET | {name}")
        scene.collection.children.link(assets)
        objects = []

        if name == "recording-studio":
            # Keep the original named furniture/wall objects, not the batched runtime mesh.
            bpy.ops.import_scene.gltf(filepath=str(paths[name]))
            objects = list(bpy.context.selected_objects)
            for obj in objects:
                if obj.type == "MESH":
                    for material in obj.data.materials:
                        if material and material.use_nodes:
                            for node in material.node_tree.nodes:
                                if node.type == "BSDF_PRINCIPLED":
                                    node.inputs["Roughness"].default_value = min(1.0, node.inputs["Roughness"].default_value)
        else:
            with gzip.open(paths[name], "rt", encoding="utf-8") as handle:
                source = json.load(handle)
            materials = {}
            for material_name, definition in source["materials"].items():
                material = bpy.data.materials.new(material_name)
                material.use_nodes = True
                nodes = material.node_tree.nodes
                links = material.node_tree.links
                shader = nodes.get("Principled BSDF")
                color = definition.get("color", [1, 1, 1, 1])
                material.diffuse_color = color
                shader.inputs["Base Color"].default_value = color
                shader.inputs["Roughness"].default_value = definition.get("roughness", 0.7)
                shader.inputs["Metallic"].default_value = definition.get("metallic", 0.0)
                shader.inputs["Alpha"].default_value = color[3]
                if definition.get("emissive"):
                    emission = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
                    emission.default_value = [*definition["emissive"], 1]
                    if shader.inputs.get("Emission Strength"):
                        shader.inputs["Emission Strength"].default_value = 1
                material.use_backface_culling = not definition.get("doubleSided", False)
                if definition.get("alphaMode") == "BLEND":
                    if hasattr(material, "surface_render_method"):
                        material.surface_render_method = "DITHERED"
                    elif hasattr(material, "blend_method"):
                        material.blend_method = "BLEND"
                for texture_key in ("baseColorTexture", "normalTexture"):
                    if texture_key not in definition:
                        continue
                    image_path = ROOT / "textures" / definition[texture_key]
                    if not image_path.is_file():
                        raise FileNotFoundError(image_path)
                    image = bpy.data.images.load(str(image_path), check_existing=True)
                    texture = nodes.new("ShaderNodeTexImage")
                    texture.image = image
                    texture.extension = "REPEAT"
                    if texture_key == "normalTexture":
                        image.colorspace_settings.name = "Non-Color"
                        normal = nodes.new("ShaderNodeNormalMap")
                        normal.inputs["Strength"].default_value = 1
                        links.new(texture.outputs["Color"], normal.inputs["Color"])
                        links.new(normal.outputs["Normal"], shader.inputs["Normal"])
                    else:
                        image.colorspace_settings.name = "sRGB"
                        links.new(texture.outputs["Color"], shader.inputs["Base Color"])
                    image.pack()
                materials[material_name] = material

            for index, part in enumerate(source["parts"]):
                mesh = bpy.data.meshes.new(f"{name} / {part['name']} / {index:03}")
                mesh.from_pydata(part["vertices"], [], part["triangles"])
                mesh.update()
                uv_layer = mesh.uv_layers.new(name="UVMap")
                for loop in mesh.loops:
                    u, v = part["uv"][loop.vertex_index]
                    # The source records glTF's image origin; Blender's UV V is opposite.
                    uv_layer.data[loop.index].uv = (u, 1.0 - v)
                for polygon in mesh.polygons:
                    polygon.use_smooth = True
                if part.get("normals") and hasattr(mesh, "normals_split_custom_set_from_vertices"):
                    mesh.normals_split_custom_set_from_vertices(part["normals"])
                mesh.materials.append(materials[part["material"]])
                obj = bpy.data.objects.new(f"{index:03} | {part['name']}", mesh)
                assets.objects.link(obj)
                obj["source_part"] = part["name"]
                objects.append(obj)

        # A non-mesh presentation rig. Export uses explicit selection of model objects only.
        rig = bpy.data.collections.new("PRESENTATION | excluded from GLB exports")
        scene.collection.children.link(rig)
        bpy.context.view_layer.update()
        points = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == "MESH" for corner in obj.bound_box]
        if not points:
            raise RuntimeError(f"No geometry reconstructed for {name}")
        low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
        high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
        center = (low + high) / 2
        extent = max(high - low)
        camera_data = bpy.data.cameras.new("Preview camera")
        camera = bpy.data.objects.new("Preview camera", camera_data)
        rig.objects.link(camera)
        camera.location = center + Vector((1.3, -1.8, 1.0)) * extent
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = extent * 1.55
        scene.camera = camera
        for label, position, energy, color in (
            ("Key", (2.0, -3.0, 4.0), 450, (1.0, 0.91, 0.80)),
            ("Fill", (-3.0, -1.0, 2.0), 200, (0.74, 0.85, 1.0)),
            ("Rim", (1.0, 3.0, 3.0), 350, (1.0, 1.0, 1.0)),
        ):
            data = bpy.data.lights.new(label, "AREA")
            data.energy = energy * max(extent, 0.2) ** 2
            data.color = color
            data.shape = "DISK"
            data.size = extent * 2
            light = bpy.data.objects.new(label, data)
            rig.objects.link(light)
            light.location = center + Vector(position) * extent
            light.rotation_euler = (center - light.location).to_track_quat("-Z", "Y").to_euler()
        world = bpy.data.worlds.new("Neutral studio")
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.07, 0.08, 0.10, 1)
        world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.5
        scene.world = world
        scene.render.resolution_x = 1024
        scene.render.resolution_y = 1024
        scene.render.resolution_percentage = 100
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        # Pack the studio's original images too, so each .blend is self-contained.
        for image in bpy.data.images:
            if image.has_data and image.source == "FILE":
                image.pack()
        destination = args.output / f"{name}.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(destination))
        if args.export:
            export_dir = args.output / "exports"
            export_dir.mkdir(exist_ok=True)
            bpy.ops.export_scene.gltf(
                filepath=str(export_dir / f"{name}.glb"),
                export_format="GLB", use_selection=True, export_apply=True,
                export_yup=True, export_normals=True, export_tangents=True,
            )
        print(f"Saved editable Blender project: {destination}")


if __name__ == "__main__":
    main()
