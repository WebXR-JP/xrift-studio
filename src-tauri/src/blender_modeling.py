"""Fixed XRift model builder. Input is validated data, never Python source."""

import json
import math
import sys
import time
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
    elif shape == "tube":
        curve = bpy.data.curves.new(part["name"], "CURVE")
        curve.dimensions = "3D"
        curve.resolution_u = 8
        curve.bevel_depth = part["bevel"]
        curve.bevel_resolution = 3
        curve.use_fill_caps = True
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(len(part["vertices"]) - 1)
        for point, vertex in zip(spline.bezier_points, part["vertices"]):
            point.co = STUDIO_TO_BLENDER @ Vector(vertex)
            point.handle_left_type = "AUTO"
            point.handle_right_type = "AUTO"
        obj = bpy.data.objects.new(part["name"], curve)
        bpy.context.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        return bpy.context.object
    elif shape == "lathe":
        segments = 32
        vertices = [STUDIO_TO_BLENDER @ Vector((r * math.cos(i * math.tau / segments), y, r * math.sin(i * math.tau / segments)))
                    for r, y, _ in part["vertices"] for i in range(segments)]
        faces = [(j * segments + i, (j + 1) * segments + i,
                  (j + 1) * segments + (i + 1) % segments, j * segments + (i + 1) % segments)
                 for j in range(len(part["vertices"]) - 1) for i in range(segments)]
        mesh = bpy.data.meshes.new(part["name"])
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(part["name"], mesh)
        bpy.context.collection.objects.link(obj)
        return obj
    elif shape == "mesh":
        mesh = bpy.data.meshes.new(part["name"])
        vertices = [STUDIO_TO_BLENDER @ Vector(vertex) for vertex in part["vertices"]]
        mesh.from_pydata(vertices, [], part["faces"])
        mesh.update()
        obj = bpy.data.objects.new(part["name"], mesh)
        bpy.context.collection.objects.link(obj)
        return obj
    elif shape == "extrude":
        # A simple closed XY contour; closure is implicit. Depth is centred
        # on Studio Z so the author's origin survives profile refinements.
        profile = list(part["vertices"])
        area = sum(a[0] * b[1] - b[0] * a[1]
                   for a, b in zip(profile, profile[1:] + profile[:1]))
        if area < 0:
            profile.reverse()
        count = len(profile)
        half_depth = part["depth"] / 2
        vertices = [STUDIO_TO_BLENDER @ Vector((x, y, z))
                    for z in (-half_depth, half_depth) for x, y, _ in profile]
        faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
        faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count)
                     for i in range(count))
        mesh = bpy.data.meshes.new(part["name"])
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(part["name"], mesh)
        bpy.context.collection.objects.link(obj)
        return obj
    else:
        raise ValueError("Unsupported model shape")
    return bpy.context.object


def expanded_parts(parts):
    """Expand bounded data translations; never interpret expressions or code."""
    for source in parts:
        repeat = source.get("repeat")
        count = repeat["count"] if repeat else 1
        for index in range(count):
            part = dict(source)
            if repeat:
                part["position"] = [value + index * offset
                                    for value, offset in zip(source["position"], repeat["offset"])]
                part["instance"] = index
                if index:
                    part["name"] = f"{source['name']} [{index + 1}]"
            yield part


class ProgressPreviews:
    """Render the actual evaluated meshes; temporary capture settings never enter the saved model."""
    def __init__(self, directory, total):
        self.directory, self.total = directory, total
        self.sequence, self.completed, self.last_capture = 0, 0, 0
        self.failed = False

    def capture(self, objects, completed, force=False):
        if self.failed or completed == self.completed or (not force and self.sequence and time.monotonic() - self.last_capture < 10):
            return
        scene = bpy.context.scene
        render = scene.render
        shading = scene.display.shading
        saved = (scene.camera, render.engine, render.resolution_x, render.resolution_y, render.resolution_percentage,
                 render.filepath, render.film_transparent, render.image_settings.file_format,
                 shading.light, shading.color_type, shading.background_type, tuple(shading.background_color),
                 shading.show_shadows, shading.show_cavity)
        camera_data = bpy.data.cameras.new("XRift temporary progress camera")
        camera = bpy.data.objects.new(camera_data.name, camera_data)
        scene.collection.objects.link(camera)
        try:
            bpy.context.view_layer.update()
            meshes = [obj for obj in objects if obj.type == "MESH"]
            graph = bpy.context.evaluated_depsgraph_get()
            corners = [evaluated.matrix_world @ Vector(corner) for obj in meshes
                       for evaluated in [obj.evaluated_get(graph)] for corner in evaluated.bound_box]
            minimum = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
            maximum = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
            center = (minimum + maximum) / 2
            distance = max((maximum - minimum).length, 0.1)
            camera.location = center + Vector((1.4, -1.8, 1.2)).normalized() * (distance * 2 + 1)
            camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
            camera_data.type = "ORTHO"
            inverse_rotation = camera.rotation_euler.to_matrix().transposed()
            projected = [inverse_rotation @ (point - center) for point in corners]
            camera_data.ortho_scale = max(max(abs(point.x) * 2 for point in projected), max(abs(point.y) * 3 for point in projected), 0.05) * 1.15
            camera_data.clip_end = distance * 10 + 100
            scene.camera = camera
            render.engine = "BLENDER_WORKBENCH"
            render.resolution_x, render.resolution_y, render.resolution_percentage = 480, 320, 100
            render.film_transparent = False
            render.image_settings.file_format = "PNG"
            shading.light, shading.color_type, shading.background_type = "STUDIO", "MATERIAL", "VIEWPORT"
            shading.background_color = (0.92, 0.94, 0.96)
            shading.show_shadows, shading.show_cavity = True, True
            self.sequence += 1
            render.filepath = str(self.directory / f"preview-{self.sequence}.png")
            bpy.ops.render.render(write_still=True)
            frame = {"sequence": self.sequence, "completed": completed, "total": self.total, "capturedAt": int(time.time() * 1000)}
            # Keep each completed frame until native polling has consumed it.
            # A fast model can finish both captures between two polling ticks.
            (self.directory / f"preview-{self.sequence}.json").write_text(json.dumps(frame), encoding="utf-8")
            temporary = self.directory / "preview-next.json"
            temporary.write_text(json.dumps(frame), encoding="utf-8")
            temporary.replace(self.directory / "preview.json")
            self.completed, self.last_capture = completed, time.monotonic()
        except Exception as error:
            self.failed = True
            (self.directory / "preview-error.txt").write_text("Progress capture unavailable", encoding="utf-8")
            print(f"XRift progress capture unavailable: {type(error).__name__}", flush=True)
        finally:
            (scene.camera, render.engine, render.resolution_x, render.resolution_y, render.resolution_percentage,
             render.filepath, render.film_transparent, render.image_settings.file_format,
             shading.light, shading.color_type, shading.background_type, shading.background_color,
             shading.show_shadows, shading.show_cavity) = saved
            bpy.data.objects.remove(camera, do_unlink=True)
            bpy.data.cameras.remove(camera_data)


def build(spec, glb_path, blend_path, previews=False):
    # Factory startup is already isolated. Remove only that background Scene,
    # preserving every object in the person's separate Blender application.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    root = bpy.data.objects.new(spec["name"], None)
    bpy.context.collection.objects.link(root)
    objects = [root]
    parts = list(expanded_parts(spec["parts"]))
    progress = ProgressPreviews(glb_path.parent, len(parts)) if previews else None
    for part in parts:
        obj = make_geometry(part)
        obj.name = part["name"]
        if part.get("id"):
            obj["xriftPartId"] = part["id"]
        if "instance" in part:
            obj["xriftPartInstance"] = part["instance"]
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
        # Bevel width is in metres, independent of the dimensions of a plank.
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if part.get("bevel") and part["shape"] != "tube":
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            modifier = obj.modifiers.new("XRift Bevel", "BEVEL")
            modifier.width = part["bevel"]
            modifier.segments = 3
            modifier.limit_method = "ANGLE"
        for polygon in obj.data.polygons:
            polygon.use_smooth = part["shape"] in ("sphere", "torus", "tube", "lathe") or (part["shape"] in ("cone", "cylinder") and len(polygon.vertices) == 4)
        # Every generated part can receive an authored or generated texture later.
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(island_margin=0.02)
        bpy.ops.object.mode_set(mode="OBJECT")
        objects.append(obj)
        if progress:
            progress.capture(objects, len(objects) - 1)
    if progress:
        progress.capture(objects, len(parts), force=True)
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
        export_extras=True,
        export_animations=False, export_cameras=False, export_lights=False,
    )
    if "FINISHED" not in result or not glb_path.is_file():
        raise RuntimeError("Blender did not produce a GLB")


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    previews = len(args) == 4 and args[-1] == "--progress-previews"
    if len(args) != 3 and not previews:
        raise ValueError("Expected model JSON, GLB and blend paths")
    input_path, glb_path, blend_path = [Path(value) for value in args[:3]]
    for path in (input_path, glb_path, blend_path):
        if not path.is_absolute() or path.parent.resolve() != input_path.parent.resolve():
            raise ValueError("All model files must be inside the same isolated directory")
    if glb_path.exists() or blend_path.exists():
        raise FileExistsError("Generated models must not overwrite existing files")
    with input_path.open("r", encoding="utf-8") as file:
        spec = json.load(file)
    build(spec, glb_path, blend_path, previews=previews)


if __name__ == "__main__":
    main()
