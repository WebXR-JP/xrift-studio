# XRift Studio への取り込み

## 手順

1. `get_editor_context`でプロジェクト・シーン・Editモード・revisionを確認する。
2. `import_model_asset`に自己完結したGLBの絶対パスを渡す。対応形式・上限・引数は現在のツールスキーマで確認する。
3. 取り込み後の処理でrevisionが進むことがあるため、contextを取得してから`place_asset`する。
4. 再取込はEditモードで既存assetIdに対して行う。`STALE_REVISION`では状態を読み直し、同じ操作が完了済みでないか確認する。

取り込み結果で名前・親子関係・ピボット・スケールを確認する。スケールを一律に1にするために既存の配置やリグを変更しない。

## 座標とシーン

標準のY-up書き出しではBlender `(x, y, z)` → Studio `(x, z, -y)`。
`room_lib.to_xrift`もこの変換を使う。追加の親変換があればそれも考慮する。

- シーン内の実際のentityId・componentIdを取得する。`starter-floor`等の存在や位置を決めつけない。
- 既存の床と取り込んだ床が重なっている場合だけ、不要な床を無効化する。
- スポーンが室内の通行可能な位置にあり、家具と重ならないことを確認する。
- `generateColliders`が有効なら生成されたメッシュのコライダーを調べ、不要な装飾の当たり判定を調整する。`inspect_colliders`の警告ごとの`fixable`を確認し、自動修正できない項目は対象を個別に判断する。

## 表示と性能

- `set_scene_view_camera`で視点を合わせ、静止画は`capture_scene_view`、時間変化は`capture_scene_debug`で確認する。
- 暗すぎる場合は照明・露出・マテリアルを調べる。診断のために影などを変更するなら元の値を記録し、終了時にその値へ戻す。
- `update_scene_settings`のambientはcolor / intensityを変更できるが、現行実装ではenabledを受け付けない。必要ならUIで切り替える。
- `capture_scene_debug`のmetricsはシーン全体の描画負荷を含むため、GLB単体の三角形数と同一とは限らない。
- 大きな応答は必要なentity・項目に絞って読む。

照明をユーザーに任せる指定があれば器具・マーカーまでに留める。完了時はassetId・entityId、Studio座標での配置、変更した設定、残る手作業を伝える。
