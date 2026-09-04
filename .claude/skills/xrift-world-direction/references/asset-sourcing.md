# 素材の入手先

素材をどこから持ってくるかは、設計図の「品質の水準」に照らして選ぶ。この文書は、入手先ごとの内容・向いている場面・使う前の確認事項を並べたものだ。組み合わせて使ってもよいし、ここにない方法を使う場合は設計図に書く。

| 入手先 | 手に入るもの | 向いている場面 | 使う前の確認事項 |
| --- | --- | --- | --- |
| 出来合いのセット (`list_scene_recipes` → `apply_scene_recipe`) | 光・Particle・Material のつり合いが取れた一式。仕掛け付きのセットは音と Interactivity Graph も含む | 手早く見栄えを整えたいとき。仕掛けの出発点としても使える | `note` に書かれた残作業（Collider など）を済ませる |
| プロジェクトの Model (`list_assets` → `place_asset`) | スターターに入っている Model と、取り込み済みの Model | すぐ置きたいとき | |
| 外部の CC0 素材 (`search_external_assets` → `install_external_asset`) | Poly Haven と ambientCG のモデル、PBR Material、HDRI | 写実的な質感がほしいとき。実在の小物・家具・岩など | 検索結果の `polycount` と `dimensionsMm` を設計図の予算と照合する。写真スキャンの木には数百万三角形のものがある。解像度は公開物の容量に合わせて選ぶ |
| Material のカタログ (`list_material_presets` → `create_material_from_preset`) | GLSL の空、水面、発光 | 数値で時間帯や波の様子を変えられる空と水がほしいとき | 発光は Bloom を有効にするとより明るく見える。Bloom なしでも成立する |
| Blender MCP | 建築は `.claude/skills/xrift-blender-world/SKILL.md`、小物や木は `.agents/skills/xrift-mcp-blender-modeling/SKILL.md` の手順で作る | 独自の形、寸法の合った部材、木が必要なとき | 要件を固めてから作り始める。GLB にして `import_model_asset` で取り込む |
| プリミティブ + Material + Particle + Light | 抽象的な形、ブロックアウト、台座と光の組み合わせ | 様式化した空間や抽象空間を作るとき。下地としても使える | 初期の灰色のまま残さない |
| Script (`references/scripting-patterns.md`) | 多数配置、動き、反応、生成的な構造 | Entity を並べると書き込み回数や draw call が増えすぎるとき | Play する前にユーザーの承認が要る |
| コードから作成 (`analyze_component_code` → `apply_component_code_import_plan`) | R3F / Three.js の JSX を Entity と Component に変換したもの | 手元に流用できるコードがあるとき | `useFrame` は変換できない |

権利について。Poly Haven と ambientCG は CC0 で、作者とライセンスの表示は Asset と公開物に自動で残る。MCP の取り込み経路にない外部モデルを使う場合は、先にユーザーにライセンスを確認してもらう。
