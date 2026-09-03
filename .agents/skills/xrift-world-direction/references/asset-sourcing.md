# 素材の調達先

どこから素材を取るかは、設計図と品質の水準で決める。この文書は「何があるか」と「それぞれの
向き不向き」を並べるだけで、順番も推奨も無い。組み合わせてよいし、ここに無い方法を設計しても
よい。

| 調達先 | 何が手に入るか | 向いている場面 | 気をつけること |
| --- | --- | --- | --- |
| 出来合いのセット (`list_scene_recipes` → `apply_scene_recipe`) | 光・Particle・Material が互いに合った subtree。しかけ付きのセットは音と Interactivity Graph も込み | 速く様になる物、仕掛けの雛形 | `note` に書かれた残作業 (Collider など) を実行する |
| プロジェクトの Model (`list_assets` → `place_asset`) | スターターの Model と、取り込み済みのもの | すぐ置ける | |
| 外部の CC0 素材 (`search_external_assets` → `install_external_asset`) | Poly Haven と ambientCG のモデル、PBR Material、HDRI | 写実の質感、実在の小物や家具や岩 | Model は結果の `polycount` と `dimensionsMm` を予算と照らす。写真スキャンの木のように数百万三角形のものがある。解像度は公開物の容量から決める |
| Material のカタログ (`list_material_presets` → `create_material_from_preset`) | GLSL の空、水面、発光 | 軽く、時間帯や波を数値で変えられる空と水 | 発光は Bloom があるとより光って見えるが、無くても成立する |
| Blender MCP | 何でも。建築は `.claude/skills/xrift-blender-world/SKILL.md`、小物や木は `.agents/skills/xrift-mcp-blender-modeling/SKILL.md` | 独自の形、寸法の合った部材、木 | 往復が増える。要件を決めてから作り、GLB で `import_model_asset` |
| プリミティブ + Material + Particle + Light | 抽象的な形、ブロックアウト、台座と光の組み合わせ | 様式化、抽象空間、下地 | 既定の灰色を残さない |
| Script (`references/scripting-patterns.md`) | 多数配置、動き、反応、生成的な構造 | Entity で作ると重く遅いもの | Play の前にユーザーの承認が要る |
| コードから作成 (`analyze_component_code` → `apply_component_code_import_plan`) | R3F / Three.js の JSX を Entity と Component へ変換 | 手元にコードがあるとき | `useFrame` は変換できない |

権利: Poly Haven と ambientCG は CC0 で、作者とライセンスは Asset と公開物へ自動で残る。
MCP の import 経路に無い外部モデルは、ユーザーにライセンスを確認してもらう。
