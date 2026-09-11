---
name: xrift-blender-world
description: Blender MCP で XRift Studio 向けの部屋・建築・インテリアを制作し、GLB で取り込むときに使う。
metadata:
  version: "1.1.0"
---

# Blender で部屋・インテリアを作る

判断境界はリポジトリの `AGENT.md` に従う。既存シーン・制作条件を確認し、依頼された範囲を編集する。

## 制作

- 作業用 `.blend`・テクスチャ・生成スクリプトは Studio 管理下のプロジェクトディレクトリと分ける。
- 繰り返し生成する部屋は寸法定数をまとめた `.py` にする。小さな編集に全面再生成は不要。
- 再生成は自分が生成した対象コレクションに限定する。既存オブジェクトや全データブロックを一括削除しない。全面生成が必要なら専用 `.blend` を用意し、既存作業を保存する。
- 大きな形を確認してから細部へ進む。部屋の寸法・開口部・通路・家具配置を優先する。
- Studio で個別編集する物は別オブジェクトにし、名前を付ける。ドアはヒンジ、家具は設置面など、用途に合うピボットを保つ。
- プレビュー用ライト・カメラは書き出し対象から分離する。色や照明の最終判断は Studio の表示で行う。

## 必要な資料と補助コード

| 対象 | 参照先 |
|---|---|
| 壁・床・貼り付け部品の面の競合 | [zfighting.md](references/zfighting.md) |
| マテリアル・UV・形状・GLB検査 | [blender-recipes.md](references/blender-recipes.md) |
| 取り込み・座標・表示確認 | [xrift-import.md](references/xrift-import.md) |
| 部屋の生成ヘルパー | [room_lib.py](scripts/room_lib.py) |
| テクスチャ取得 | [fetch_polyhaven.py](scripts/fetch_polyhaven.py) |
| 静的な部屋の検査 | [validate_scene.py](scripts/validate_scene.py) |
| 同一平面の候補検出 | [find_coplanar.py](scripts/find_coplanar.py) |

補助スクリプトは対象と前提を読んでから使う。検査は全メッシュを走査するため、専用の制作ファイルで行う。
`validate_scene.py` の単位スケール・UV・マテリアル・モディファイア検査はこの静的な部屋の制作規約であり、すべての glTF の必須条件ではない。
`find_coplanar.py` の候補には誤検出がある。件数をゼロにするために意図した形状を壊さず、対象面と Studio の表示で判断する。

## 書き出しと確認

1. 対象オブジェクト・親子関係・ピボット・実寸・マテリアルを確認し、対象だけを自己完結した GLB に書き出す。
2. 静的な部屋ではプレビュー用ライト・カメラ・不要なアニメーションを除外する。依頼された動きは保持する。
3. Edit モードで取り込み、最新の revision を取得して配置する。再取込では既存の assetId を維持する。
4. 既存の床との重なり、スポーン位置、生成されたコライダーを確認し、問題のある対象だけ修正する。
5. `capture_scene_view` で見た目、必要なら Play と `capture_scene_debug` で動き・性能を確認する。診断用に変更した値は元の値へ戻す。

完了時は assetId・entityId、検証結果、残る問題を報告する。素材は取得先の利用条件を確認し、取得元・作者・加工内容を記録する。
