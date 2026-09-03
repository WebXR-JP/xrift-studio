# 素材の調達順

置くものが決まったら、この順で当たる。上ほど速く、光・材質・大きさが揃っている。下ほど自由だが
往復が増える。1 段下へ降りるのは、上に無いことを確かめたときだけ。何を選ぶかはブリーフが決める。
この文書は順番と条件だけを言い、候補の一覧は持たない。一覧は tool が返す。

1. **出来合いのセット**: `list_scene_recipes` → `apply_scene_recipe`。光・Particle・Material が
   合った subtree で置かれる。`note` に書かれた「作者がまだやること」を必ず実行する。
2. **プロジェクトにある Model**: `list_assets { kind: "model" }` → `place_asset`。
3. **CC0 の外部素材**: `search_external_assets` → `install_external_asset`。Model は結果の
   `polycount` と `dimensionsMm` を読み、ブリーフで決めた予算と照らしてから入れる。写真スキャンの
   木は数百万三角形あるので入れない。解像度は公開物の容量から決める。PBR Material は床・壁・
   舗装に。HDRI は「特定の場所の光」が要るときで、普段は `list_material_presets` の空 shader の
   方が軽く、時間帯を数値で変えられる。
4. **Blender で作る**: 建築は `.claude/skills/xrift-blender-world/SKILL.md`、小物や木は
   `.agents/skills/xrift-mcp-blender-modeling/SKILL.md`。形の作り方は決めない。Blender MCP が
   接続されていれば、必要な形をその場で設計して作り、GLB で取り込む。
5. **プリミティブの合成**: `create_primitive` + Material (PBR か glow) + `core.particle` +
   `core.light`。1 つの形で見せず、台座・本体・光・音の関係で見せる。
6. **Script**: 同じ物を規則やばらつきで多数置く、動かす、反応させるなら
   `references/scripting-patterns.md`。Entity を並べるより速く軽い。

権利: Poly Haven と ambientCG は CC0 で、作者とライセンスは Asset と公開物へ自動で残る。
MCP の import 経路に無い外部モデルは、ユーザーにライセンスを確認してもらう。
