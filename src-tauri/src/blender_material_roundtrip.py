"""Preserve texture-free MToon settings through Blender's glTF extras."""
import copy
import json
import struct

MTOON = "VRMC_materials_mtoon"
PROPERTY = "xrift_mtoon_json"


def read_glb(data):
    magic, version, size = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or size != len(data):
        raise ValueError("Invalid GLB")
    offset, document, binary = 12, None, b""
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8:offset + 8 + length]
        if len(chunk) != length:
            raise ValueError("Truncated GLB")
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    if document is None:
        raise ValueError("Missing GLB JSON")
    return document, binary


def write_glb(document, binary):
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    chunks = struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
    if binary:
        chunks += struct.pack("<II", len(binary), 0x004E4942) + binary
    return struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks


def has_texture_reference(value):
    if isinstance(value, dict):
        return any((key.endswith("Texture") and item is not None)
                   or has_texture_reference(item) for key, item in value.items())
    if isinstance(value, list):
        return any(has_texture_reference(item) for item in value)
    return False


def prepare_materials(document):
    result = copy.deepcopy(document)
    for material in result.get("materials", []):
        mtoon = material.get("extensions", {}).get(MTOON)
        if mtoon is None:
            continue
        if has_texture_reference(mtoon):
            raise ValueError("Textured MToon needs a texture-aware Blender importer")
        material.setdefault("extras", {})[PROPERTY] = json.dumps(mtoon)
    return result


def restore_materials(document):
    for material in document.get("materials", []):
        extras = material.get("extras", {})
        encoded = extras.pop(PROPERTY, None)
        if encoded is None:
            continue
        mtoon = json.loads(encoded)
        if not isinstance(mtoon, dict) or has_texture_reference(mtoon):
            raise ValueError("Invalid preserved MToon settings")
        material.setdefault("extensions", {})[MTOON] = mtoon
        used = document.setdefault("extensionsUsed", [])
        if MTOON not in used:
            used.append(MTOON)
        if not extras:
            material.pop("extras", None)
    return document
