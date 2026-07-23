# Starter asset provenance

The project-owned files below were supplied with explicit permission for XRift Studio Starter use. No third-party license is asserted or inferred for those files.

| Fixed file | Asset shown in XRift Studio | Source asset name |
| --- | --- | --- |
| `log-bench.glb` | 丸太ベンチ | `屋外プロップ_08_丸太ベンチ.glb` |
| `torii-gate.glb` | 鳥居 | `屋外プロップ_17_鳥居.glb` |
| `mug.glb` | マグカップ | `小物プロップ_01_マグカップ.glb` |
| `wine-glass.glb` | ワイングラス | `小物プロップ_31_ワイングラス.glb` |
| `wood-planks-clean.png` | Wood Planks | `tile-wood-planks-clean.png` |
| `polished-concrete.png` | Polished Concrete | `t300_floor_04_polished_concrete_floor_with_subtl.png` |

## OpenBrush sample

`openbrush-all-brushes.glb` is copied from `examples/all_brushes.glb` in [icosa-foundation/three-icosa](https://github.com/icosa-foundation/three-icosa) at revision `18682538402ecf8470c4eee91f817ca6093acfa2`. It is licensed under Apache-2.0. The full license text is stored beside it as `openbrush-LICENSE.txt` and is also copied into projects created from the OpenBrush Starter.

The repository-level `THIRD_PARTY_ASSETS.md` records the fixed SHA-256 hashes used to verify these copies.

## XRift official World template

`xrift-world-template-thumbnail.png`, `xrift-world-template-duck.glb`,
`xrift-world-template-tokyo-station.png` (the upstream `.jpg` contains PNG bytes), `xrift-world-template-World.tsx.txt`,
and `xrift-world-template-LICENSE.txt` are verbatim copies from
[`WebXR-JP/xrift-world-template`](https://github.com/WebXR-JP/xrift-world-template)
at revision `abbce026ea1f1066726f385089d5f28b2ef5a890`. WebXR-JP distributes the
repository under the MIT License. The source and license are copied into
projects created from the XRift official World Starter; the thumbnail is used
only to identify that Starter in XRift Studio. `xrift-world-template-bunny.glb`
is generated from the same revision's `public/bunny.drc` by
`pnpm starter:sync:xrift-official`, so the standalone Draco geometry can use
the normal Studio Model Asset pipeline.
