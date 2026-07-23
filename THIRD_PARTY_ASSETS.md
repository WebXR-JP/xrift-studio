# Third-party assets

## OpenBrush sample

| Bundled file | Upstream source | Revision | License | SHA-256 |
| --- | --- | --- | --- | --- |
| `openbrush-all-brushes.glb` | [`icosa-foundation/three-icosa/examples/all_brushes.glb`](https://github.com/icosa-foundation/three-icosa/blob/18682538402ecf8470c4eee91f817ca6093acfa2/examples/all_brushes.glb) | `18682538402ecf8470c4eee91f817ca6093acfa2` | Apache-2.0 | `587fc0c477a8028a6acac21291868dbf4402f5aebd1fca71661e1ba83dd0a380` |
| `openbrush-LICENSE.txt` | [`icosa-foundation/three-icosa/LICENSE`](https://github.com/icosa-foundation/three-icosa/blob/18682538402ecf8470c4eee91f817ca6093acfa2/LICENSE) | `18682538402ecf8470c4eee91f817ca6093acfa2` | Apache-2.0 license text | `3ddf9be5c28fe27dad143a5dc76eea25222ad1dd68934a047064e56ed2fa40c5` |

The OpenBrush Starter copies both files into the created project. Brush shader textures are loaded at runtime from the three-icosa template host and are not bundled here.

## XRift official World template

| Bundled file | Upstream source | Revision | License | SHA-256 |
| --- | --- | --- | --- | --- |
| `xrift-world-template-thumbnail.png` | [`WebXR-JP/xrift-world-template/public/thumbnail.png`](https://github.com/WebXR-JP/xrift-world-template/blob/abbce026ea1f1066726f385089d5f28b2ef5a890/public/thumbnail.png) | `abbce026ea1f1066726f385089d5f28b2ef5a890` | MIT | `bd0e67abf075b0f0b8e5c41fcdc06289e4e8fc189babdf625556ad4c1b3596ea` |
| `xrift-world-template-duck.glb` | [`WebXR-JP/xrift-world-template/public/duck.glb`](https://github.com/WebXR-JP/xrift-world-template/blob/abbce026ea1f1066726f385089d5f28b2ef5a890/public/duck.glb) | `abbce026ea1f1066726f385089d5f28b2ef5a890` | MIT | `154d3d5f025f9a0a614b5ea27b5e816120e0d286077b05ba67281e4b2823684d` |
| `xrift-world-template-tokyo-station.png` (upstream is named `.jpg`, but its pinned bytes are PNG) | [`WebXR-JP/xrift-world-template/public/tokyo-station.jpg`](https://github.com/WebXR-JP/xrift-world-template/blob/abbce026ea1f1066726f385089d5f28b2ef5a890/public/tokyo-station.jpg) | `abbce026ea1f1066726f385089d5f28b2ef5a890` | MIT | `613c5e5af594cf273bc14076cc86761a74826e9c57fbcec1e45c42a988fd3265` |
| `xrift-world-template-bunny.glb` | Generated from [`WebXR-JP/xrift-world-template/public/bunny.drc`](https://github.com/WebXR-JP/xrift-world-template/blob/abbce026ea1f1066726f385089d5f28b2ef5a890/public/bunny.drc) (`3bb08f257d873f69ded447e07c2dd4e9d7a264d58a686c88978c38430c5f6eb4`) by `pnpm starter:sync:xrift-official` | `abbce026ea1f1066726f385089d5f28b2ef5a890` | MIT | `7f903e35e249f399e440a3bce6bf694e72dc80ce9dfd33df7f4fd83d4e960fff` |
| `xrift-world-template-World.tsx.txt` | [`WebXR-JP/xrift-world-template/src/World.tsx`](https://github.com/WebXR-JP/xrift-world-template/blob/abbce026ea1f1066726f385089d5f28b2ef5a890/src/World.tsx) | `abbce026ea1f1066726f385089d5f28b2ef5a890` | MIT | `7269c522aa105b5f22a066d0c0b7818589149788a639d9b14b0c0d9c58070522` |
| `xrift-world-template-LICENSE.txt` | [`WebXR-JP/xrift-world-template/LICENSE`](https://github.com/WebXR-JP/xrift-world-template/blob/abbce026ea1f1066726f385089d5f28b2ef5a890/LICENSE) | `abbce026ea1f1066726f385089d5f28b2ef5a890` | MIT license text | `ab63a7a7e02339cd5547c0fbd3ed89e8ab740c72a7d1696719bbaa67ee11a2f8` |

The Starter scene is produced from the static R3F/Rapier subset of this fixed
source graph. XRift Studio copies the Duck, a Studio-generated GLB conversion
of the Draco bunny, the panorama, source, and license into the created Visual
project. Each model/texture is registered in the Asset manifest and linked to
the converted Scene by its Studio Asset ID.

## Project-owned Starter Assets

The files below were selected from assets supplied by the project owner with explicit permission for XRift Studio Starter use. This document does not infer or assign a third-party license.

| Bundled file | Project source name | SHA-256 |
| --- | --- | --- |
| `log-bench.glb` | `屋外プロップ_08_丸太ベンチ.glb` | `f7c57473cd2ead96aa2b7b820914b6c9b114915946b5dc00eb576c707b92aafd` |
| `torii-gate.glb` | `屋外プロップ_17_鳥居.glb` | `dd21cfcb12aa03fdb28ba95924d38e6e905d1c3f32da87c1352d17a6f3237786` |
| `mug.glb` | `小物プロップ_01_マグカップ.glb` | `33fb6b5fd7681d9f465f5fa6f6b1f50c6c61be8658df38ae79dfc98b04b73bfa` |
| `wine-glass.glb` | `小物プロップ_31_ワイングラス.glb` | `a2765c0512ea6484573662e61cd62965dd68e8a7355380920d5be67a8f83e7ba` |
| `wood-planks-clean.png` | `tile-wood-planks-clean.png` | `ebb12ef7d3d743e2d1bab5ee6d9fe392f6e0205651fa154f739e7300b26cb0ad` |
| `polished-concrete.png` | `t300_floor_04_polished_concrete_floor_with_subtl.png` | `f82525e2c1117fd36b276538a72d765e34178435f7759b27acf151578f895458` |

The original local storage paths are intentionally not recorded in source code or documentation. The fixed filenames, byte lengths, and hashes used for project creation are defined in `src/lib/visual-editor/starter-templates.ts`.
