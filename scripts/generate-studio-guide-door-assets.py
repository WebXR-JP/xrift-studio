"""Generate the two animated door GLBs used by the Studio guide starter.

Run from Blender:
  blender --background --factory-startup --python scripts/generate-studio-guide-door-assets.py

The right-hand door receives the KHR_interactivity sample graph after Blender's
glTF exporter writes the animation data. Keeping both models Blender-authored
makes their geometry and animation directly comparable in the starter museum.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Quaternion


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIRECTORY = (
    REPOSITORY_ROOT / "public" / "visual-editor" / "starter-assets"
)
GLTF_JSON_CHUNK = 0x4E4F534A


def clear_scene() -> None:
    if bpy.ops.object.mode_set.poll():
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in bpy.data.collections:
        if collection.name != bpy.context.scene.collection.name:
            bpy.data.collections.remove(collection)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def create_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float,
    roughness: float,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
    return material


def create_cube(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    *,
    material: bpy.types.Material,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, 0.0))
    cube = bpy.context.active_object
    cube.name = name
    cube.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    cube.data.materials.append(material)
    cube.parent = parent
    cube.location = location
    return cube


def create_handle(
    name: str,
    location: tuple[float, float, float],
    *,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12)
    handle = bpy.context.active_object
    handle.name = name
    handle.scale = (0.13, 0.11, 0.13)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    handle.data.materials.append(material)
    handle.parent = parent
    handle.location = location
    return handle


def add_open_animation(
    pivot: bpy.types.Object,
    *,
    action_name: str,
    angle_degrees: float,
) -> None:
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = 52
    pivot.rotation_mode = "QUATERNION"
    pivot.rotation_quaternion = Quaternion((0.0, 0.0, 1.0), 0.0)
    pivot.keyframe_insert(data_path="rotation_quaternion", frame=1)
    pivot.rotation_quaternion = Quaternion(
        (0.0, 0.0, 1.0),
        math.radians(angle_degrees),
    )
    pivot.keyframe_insert(data_path="rotation_quaternion", frame=42)
    pivot.keyframe_insert(data_path="rotation_quaternion", frame=52)
    action = pivot.animation_data.action if pivot.animation_data else None
    if action:
        action.name = action_name
    scene.frame_set(1)


def build_door(
    *,
    label: str,
    hinge_x: float,
    panel_center_x: float,
    handle_x: float,
    angle_degrees: float,
    panel_color: tuple[float, float, float, float],
) -> dict[str, object]:
    clear_scene()
    scene = bpy.context.scene
    scene.name = f"{label} Door Demo"

    frame_material = create_material(
        f"{label}_Frame",
        (0.035, 0.045, 0.07, 1.0),
        metallic=0.42,
        roughness=0.3,
    )
    panel_material = create_material(
        f"{label}_Panel",
        panel_color,
        metallic=0.18,
        roughness=0.34,
    )
    trim_material = create_material(
        f"{label}_Trim",
        (0.78, 0.82, 0.9, 1.0),
        metallic=0.76,
        roughness=0.24,
    )

    frame_root = bpy.data.objects.new(f"{label}_StaticFrame", None)
    scene.collection.objects.link(frame_root)
    create_cube(
        f"{label}_FrameLeft",
        (0.28, 0.34, 4.24),
        (-1.48, 0.0, 2.12),
        material=frame_material,
        parent=frame_root,
    )
    create_cube(
        f"{label}_FrameRight",
        (0.28, 0.34, 4.24),
        (1.48, 0.0, 2.12),
        material=frame_material,
        parent=frame_root,
    )
    create_cube(
        f"{label}_FrameHeader",
        (3.24, 0.34, 0.3),
        (0.0, 0.0, 4.1),
        material=frame_material,
        parent=frame_root,
    )
    create_cube(
        f"{label}_Threshold",
        (3.24, 0.38, 0.12),
        (0.0, 0.0, 0.06),
        material=trim_material,
        parent=frame_root,
    )

    pivot = bpy.data.objects.new(f"{label}_DoorPivot", None)
    scene.collection.objects.link(pivot)
    pivot.location = (hinge_x, 0.0, 0.0)

    create_cube(
        f"{label}_DoorPanel",
        (2.52, 0.18, 3.82),
        (panel_center_x - hinge_x, 0.0, 2.0),
        material=panel_material,
        parent=pivot,
    )
    for trim_name, dimensions, location in (
        (
            "TopTrim",
            (2.18, 0.08, 0.09),
            (panel_center_x - hinge_x, -0.13, 3.62),
        ),
        (
            "BottomTrim",
            (2.18, 0.08, 0.09),
            (panel_center_x - hinge_x, -0.13, 0.38),
        ),
        (
            "CenterTrim",
            (2.18, 0.08, 0.07),
            (panel_center_x - hinge_x, -0.13, 2.0),
        ),
    ):
        create_cube(
            f"{label}_{trim_name}",
            dimensions,
            location,
            material=trim_material,
            parent=pivot,
        )
    create_handle(
        f"{label}_DoorHandle",
        (handle_x - hinge_x, -0.2, 1.95),
        material=trim_material,
        parent=pivot,
    )
    add_open_animation(
        pivot,
        action_name=f"Open_{label}_Door",
        angle_degrees=angle_degrees,
    )

    return {
        "pivot": pivot.name,
        "objects": [obj.name for obj in scene.objects],
        "action": pivot.animation_data.action.name,
    }


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_range=True,
        export_extras=True,
    )


def default_interactivity_extension() -> dict[str, object]:
    return {
        "graph": 0,
        "graphs": [
            {
                "name": "Open interaction door on start",
                "types": [{"signature": "float"}, {"signature": "int"}],
                "declarations": [
                    {"op": "event/onStart"},
                    {"op": "math/Inf"},
                    {"op": "animation/start"},
                ],
                "nodes": [
                    {
                        "declaration": 0,
                        "flows": {"out": {"node": 2}},
                        "extras": {
                            "xriftStudio": {"position": [80, 160]},
                        },
                    },
                    {
                        "declaration": 1,
                        "extras": {
                            "xriftStudio": {"position": [330, 330]},
                        },
                    },
                    {
                        "declaration": 2,
                        "values": {
                            "animation": {"type": 1, "value": [0]},
                            "startTime": {"type": 0, "value": [0]},
                            "endTime": {"node": 1},
                            "speed": {"type": 0, "value": [1]},
                        },
                        "extras": {
                            "xriftStudio": {"position": [590, 160]},
                        },
                    },
                ],
            }
        ],
    }


def inject_khr_interactivity(path: Path) -> None:
    source = path.read_bytes()
    if source[:4] != b"glTF":
        raise RuntimeError(f"{path.name} is not a GLB")
    magic, version, _length = struct.unpack_from("<4sII", source, 0)
    chunks: list[tuple[int, bytes]] = []
    offset = 12
    while offset < len(source):
        chunk_length, chunk_type = struct.unpack_from("<II", source, offset)
        offset += 8
        chunk_data = source[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == GLTF_JSON_CHUNK:
            document = json.loads(chunk_data.rstrip(b" \t\r\n\0").decode("utf-8"))
            extensions_used = list(document.get("extensionsUsed", []))
            if "KHR_interactivity" not in extensions_used:
                extensions_used.append("KHR_interactivity")
            document["extensionsUsed"] = extensions_used
            document.setdefault("extensions", {})[
                "KHR_interactivity"
            ] = default_interactivity_extension()
            chunk_data = json.dumps(
                document,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
            chunk_data += b" " * ((4 - len(chunk_data) % 4) % 4)
        chunks.append((chunk_type, chunk_data))

    body = b"".join(
        struct.pack("<II", len(chunk_data), chunk_type) + chunk_data
        for chunk_type, chunk_data in chunks
    )
    path.write_bytes(struct.pack("<4sII", magic, version, 12 + len(body)) + body)


def generate_assets() -> dict[str, object]:
    gltf_path = OUTPUT_DIRECTORY / "studio-guide-gltf-door.glb"
    interaction_path = (
        OUTPUT_DIRECTORY / "studio-guide-interaction-door.glb"
    )
    gltf_door = build_door(
        label="GLTF",
        hinge_x=-1.26,
        panel_center_x=0.0,
        handle_x=0.9,
        angle_degrees=100.0,
        panel_color=(0.03, 0.42, 0.62, 1.0),
    )
    export_glb(gltf_path)
    interaction_door = build_door(
        label="Interaction",
        hinge_x=1.26,
        panel_center_x=0.0,
        handle_x=-0.9,
        angle_degrees=-100.0,
        panel_color=(0.38, 0.12, 0.68, 1.0),
    )
    export_glb(interaction_path)
    inject_khr_interactivity(interaction_path)
    return {
        "created": [str(gltf_path), str(interaction_path)],
        "gltfDoor": gltf_door,
        "interactionDoor": interaction_door,
        "byteLengths": {
            gltf_path.name: gltf_path.stat().st_size,
            interaction_path.name: interaction_path.stat().st_size,
        },
    }


result = generate_assets()
