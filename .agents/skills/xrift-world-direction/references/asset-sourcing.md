# 素材の入手先

素材の入手先は、設計図の「品質の水準」に合わせて選んでください。次の表で、入手できる素材、用途、確認事項を比較できます。複数の入手先を組み合わせても構いません。表にない方法を使う場合は設計図に記載します。

| 入手先 | 手に入るもの | 向いている場面 | 使う前の確認事項 |
| --- | --- | --- | --- |
| 出来合いのセット (`list_scene_recipes` → `apply_scene_recipe`) | 光・Particle・Materialのつり合いが取れた一式。仕掛け付きのセットは音とInteractivity Graphも含む | 手早く見栄えを整えたいとき。仕掛けの出発点としても使える | `note`に書かれた残作業（Colliderなど）を済ませる |
| プロジェクトのModel (`list_assets` → `place_asset`) | スターターに入っているModelと、取り込み済みのModel | すぐ置きたいとき | |
| 外部のCC0素材 (`search_external_assets` → `install_external_asset`) | Poly HavenとambientCGのモデル、PBR Material、HDRI | 写実的な質感がほしいとき。実在の小物・家具・岩など | 検索結果の`polycount`と`dimensionsMm`を設計図の予算と照合する。写真スキャンの木には数百万三角形のものがある。解像度は公開物の容量に合わせて選ぶ |
| Materialのカタログ (`list_material_presets` → `create_material_from_preset`) | GLSLの空、水面、発光 | 数値で時間帯や波の様子を変えられる空と水がほしいとき | 発光はBloomを有効にするとより明るく見える。Bloomなしでも成立する |
| Blender MCP | 建築は`.claude/skills/xrift-blender-world/SKILL.md`、小物や木は`.agents/skills/xrift-mcp-blender-modeling/SKILL.md`の手順で作る | 独自の形、寸法の合った部材、木が必要なとき | 要件を固めてから作り始める。GLBにして`import_model_asset`で取り込む |
| プリミティブ + Material + Particle + Light | 抽象的な形、ブロックアウト、台座と光の組み合わせ | 様式化した空間や抽象空間を作るとき。下地としても使える | 初期の灰色のまま残さない |
| Script (`references/scripting-patterns.md`) | 多数配置、動き、反応、生成的な構造 | Entityを並べると書き込み回数やdraw callが増えすぎるとき | Playで変換と実行を確認する |
| コードから作成 (`analyze_component_code` → `apply_component_code_import_plan`) | R3F / Three.jsのJSXをEntityとComponentに変換したもの | 手元に流用できるコードがあるとき | `useFrame`は変換できない |

Poly HavenとambientCGの素材はCC0です。Assetと公開物には、作者とライセンスの表示が自動で残ります。MCPの取り込みに対応していない外部モデルを使う場合は、先にユーザーへライセンスの確認を依頼してください。
