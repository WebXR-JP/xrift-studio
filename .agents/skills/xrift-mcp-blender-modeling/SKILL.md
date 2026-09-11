---
name: xrift-mcp-blender-modeling
description: XRift向けの3DモデルやGLBを制作・最適化・配置する。Blender制作とScript描画を依頼と成果物で選ぶ。
---

# XRift Studioのモデル制作

成果物とユーザーの指定から制作手段を選ぶ。GLB・Blenderの指定や形状・UVの編集が必要ならBlenderを使う。動的なScript描画にはR3Fを使える。コードで作りやすいことだけを理由に、要求された見た目やモデルを単純な箱へ置き換えない。

- 既存Sceneを保持し、生成物は専用Collectionまたは別ファイルで管理する。複数モデルは小物単位で作り、確認して配置する。
- GLBはメートル、Y-up、自己完結したテクスチャを基本とする。原点は設置面・ヒンジなど用途に合わせる。床置き家具を重心原点へ一律変更しない。
- Semantic置換モデルはsemanticLabels、nominalSize、実Bounds、Pivot、正面方向、styleTagsを対応させる。現行サンプル契約と拡張の区別は `docs/OPENXR_SPATIAL_AUTHORING.md` を確認する。
- Questの分類は製品の元GLBではない。取得Meshを保持する場合と、自作GLBへ置換する場合を区別する。ポリゴン数だけでQuestの性能保証をしない。
- Studioへ取り込んだ後に実レンダリングで寸法・向き・接地・Materialを確認する。MCPの書き込み後は最新revisionを使う。Scriptの信頼承認を迂回しない。

## 必要な手順

- Blender書き出し: [blender-export.md](references/blender-export.md)
- R3FをScriptへ変換: [r3f-to-script.md](references/r3f-to-script.md)。`useFrame`ではなく対応するScript lifecycleを使う。
- 変換・配置の例: [r3f-to-studio-example.md](references/r3f-to-studio-example.md)
- 反復編集: [iterative-loop.md](references/iterative-loop.md)

モデルの取り込みは `import_model_asset`、再取り込みは `reimport_model_asset`、配置は `place_asset`。対応するツールの引数を確認して既存Asset経路を使う。
