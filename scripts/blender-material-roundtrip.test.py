import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-tauri/src"))
from blender_material_roundtrip import *


class MaterialRoundtrip(unittest.TestCase):
    def test_reordered_materials_keep_own_toon_values(self):
        original = {"asset": {"version": "2.0"}, "materials": [
            {"name": "red", "extensions": {MTOON: {"shadeColorFactor": [1, 0, 0]}}},
            {"name": "blue", "extensions": {MTOON: {"shadeColorFactor": [0, 0, 1]}}}]}
        prepared = prepare_materials(original)
        self.assertNotIn("extras", original["materials"][0])
        prepared["materials"].reverse()
        for material in prepared["materials"]:
            material.pop("extensions")
        restored = restore_materials(prepared)
        self.assertEqual(restored["materials"][0]["extensions"][MTOON]["shadeColorFactor"], [0, 0, 1])
        self.assertIn(MTOON, restored["extensionsUsed"])
        self.assertNotIn("extras", restored["materials"][0])

    def test_textured_mtoon_is_not_silently_corrupted(self):
        with self.assertRaises(ValueError):
            prepare_materials({"materials": [{"extensions": {MTOON: {"shadeMultiplyTexture": {"index": 0}}}}]})

    def test_binary_and_other_properties_survive(self):
        document = {"asset": {"version": "2.0"}, "meshes": [{"name": "顔"}], "buffers": [{"byteLength": 4}]}
        self.assertEqual(read_glb(write_glb(document, b"1234")), (document, b"1234"))
        with self.assertRaises(ValueError):
            read_glb(write_glb(document, b"1234")[:-1])


unittest.main(argv=[__file__])
