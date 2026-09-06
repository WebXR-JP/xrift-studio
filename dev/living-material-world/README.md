# Living Material World

XRift Studio の `exr` に配置した制作データ。Blender で形状を作り、Studio の Script で風、膜の変形、薄膜色、地表の線、Pulse、ノード間の光を加える。

- `build_meshes.py`: 13種類の分割GLBを生成するBlenderスクリプト。
- `build_audio.py`: オリジナルの環境音を生成する。
- `world-system.ts`: 現在のSceneに対応するScript。別SceneではTARGETSのEntity IDを置き換える。
- `scene-snapshot.json`: 配置と固定床を保存したSceneのスナップショット。Asset IDは制作先の `exr` に対応し、単独で開けるプロジェクト一式ではない。
- `assets/`: GLB、HDR、環境音、独立したBlender Sceneの保存ファイル。追加の画面支持フレームは `.blend` に保存済み。

## 操作と床

`Living World Controls` の Script Component で `windStrength`、`windDirection`、`worldEnergy`、`environmentPhase` を変更する。`worldPulse` の数値を増やすと波を送る。`bgmVolume` は環境音の音量。

床は `LMW Walkable Foundation` の固定Box Colliderで支える。中心 `[0,-0.25,0]`、halfExtents `[20,0.25,25]`。スポーンは `[0,1.25,19]`。床モデルの読込状態に依存せず、Play開始後の落下が止まることを確認した。

## 確認状況

Scriptの承認画面を廃止し、Playで保存済みソースを変換して実行する。ブラウザテストで承認なしの実行、更新、変換失敗時の直前の正常なScriptの維持を確認した。実機でScript Runtimeがready、変換・実行エラーなしを確認した。

暫定計測はPlayで約55,206三角形、190 draw calls、62fps。端末や視点によって変動する。

画面共有の表示枠は配置済み。音声通話に未接続のため、共有開始・停止、複数クライアント同期は未確認。録画カメラの向きがPlayのプレイヤーカメラに戻る現象があり、試し録りは完成動画として扱わない。4視点の完成動画、全効果の見た目の調整、風と音の連動は残作業。
