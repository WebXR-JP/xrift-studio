"""Run in Blender (including execute_blender_code) with XRIFT_REPO set.
Creates a separate collection; only exports the objects made by this script.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import bpy
from mathutils import Matrix, Euler

root = Path(os.environ['XRIFT_REPO'])
output = root / 'public/visual-editor/world-assets'
output.mkdir(parents=True, exist_ok=True)
parts = json.loads((root / 'assets/world-models/parts.json').read_text())
collection = bpy.data.collections.new('XRift Vehicle Models')
bpy.context.scene.collection.children.link(collection)
# Convert authored Three.js Y-up coordinates into Blender Z-up.
conversion = Matrix.Rotation(math.pi / 2, 4, 'X')
model_definitions = {}

def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

for kind, definitions in parts.items():
    materials = {}
    for color in dict.fromkeys(part['color'] for part in definitions):
        material = bpy.data.materials.new(f'XRift_{kind}_{color[1:]}')
        material.use_nodes = True
        rgba = tuple(linear(int(color[i:i+2], 16) / 255) for i in (1, 3, 5)) + (1,)
        material.diffuse_color = rgba
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = rgba
        bsdf.inputs['Roughness'].default_value = 0.65
        bsdf.inputs['Metallic'].default_value = 0.1
        materials[color] = material
    objects = []
    for index, part in enumerate(definitions):
        if part['shape'] == 'box':
            bpy.ops.mesh.primitive_cube_add(size=1)
            obj = bpy.context.object
            obj.scale = part['size']
            shape_rotation = Matrix.Identity(4)
        else:
            radius, _, depth = part['size']
            bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=depth)
            obj = bpy.context.object
            # Blender cylinders run along Z; Three.js cylinders along Y.
            shape_rotation = Matrix.Rotation(-math.pi / 2, 4, 'X')
        obj.name = f'XRift_{kind}_{index:02d}'
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
        scale = Matrix.Diagonal((*obj.scale, 1))
        rotation = Euler(part.get('rotation', [0, 0, 0]), 'XYZ').to_matrix().to_4x4()
        obj.matrix_world = conversion @ Matrix.Translation(part['position']) @ rotation @ shape_rotation @ scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.clear()
        obj.data.materials.append(materials[part['color']])
        objects.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    combined = bpy.context.object
    # Export a floor/seat-origin model, keeping authored world coordinates.
    combined.data.transform(combined.matrix_world)
    combined.matrix_world = Matrix.Identity(4)
    combined.name = f'XRift_{kind}'
    path = output / f'{kind}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_materials='EXPORT', export_yup=True, export_cameras=False, export_lights=False)
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    model_definitions[kind] = dict(modelId=kind, assetId=f'model-{kind}-{digest[:12]}',
        publicPath=f'/visual-editor/world-assets/{kind}.glb', fileName=path.name,
        sha256=digest, byteLength=len(data), displayName='Vehicle 車体' if kind == 'vehicle' else 'Seat 座席' if kind == 'seat' else 'Wheel タイヤ',
        approxRadius=1.5 if kind == 'vehicle' else 0.6,
        provenance='Original model generated with Blender MCP; scripts/generate-world-asset-models.py')
(root / 'src/lib/visual-editor/scripting/world-asset-model-definitions.json').write_text(json.dumps(model_definitions, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({kind: (output / f'{kind}.glb').stat().st_size for kind in parts}))
