# OpenXR Spatial Authoring

WindowsのStudioから保存済みの部屋を取得し、既存のSceneDocument・Asset Importへ渡す。利用者向け手順は[部屋の取り込み](guide/xr-spatial.md)。

## ネイティブOpenXRによる保存済み部屋の取得

実装: `src-tauri/crates/openxr-room`。Windowsで同梱のOpenXR Loaderを使い、現在のRuntimeの拡張を列挙する。`XR_KHR_D3D11_enable`、`XR_FB_spatial_entity`、`XR_FB_spatial_entity_query`、`XR_FB_scene` を必須とし、`XR_META_spatial_entity_mesh` は任意。Runtime名から対応を推定しない。SteamVRが必須拡張を公開しない場合は不足を返す。

Runtime指定GPUのD3D11 Deviceで一時Sessionを作り、STAGE座標系でLOCALストレージのSemantic Entityを問い合わせる。取得対象Componentの有効化とLOCATABLEの位置確定を待ち、Plane・Bounds・分類・利用可能なMeshを返す。描画層は送らず、WebXRや外部ブラウザを使わない。新規Room Setup要求は行わない。

- 45秒の取得期限、クエリ15秒、位置・Component確定に追加5秒。Runtime内のブロッキング呼び出し中は取消・期限の確認が遅れる可能性がある。
- 件数4096、1Mesh20万頂点・60万index、返却データ32MBまで。参照ハンドル・Session・D3D11 Deviceは終了・失敗・取消で解放する。
- FB平面のXY座標を共有importerのXZへ変換し、回転を合成して実空間位置を保つ。Meshと3D Boundsは元の座標系を保持する。
- 位置不明のEntityを原点へ配置しない。除外件数を警告し、取得ゼロは空の成功にしない。複数の保存済み領域をRuntimeが返す場合、取得時に位置を確定できるEntityが対象になる。
- PC上のTauri非同期コマンドから実行し、二重取得を拒否する。UIは取得と保存を分け、保存中に取り消せるようには見せない。取得中のScene変更・画面終了・取消では古い結果を適用しない。
- 取得結果は共有Spatial Capture検証を通した後、既存のGLB Asset保存・Scene配置へ渡す。

ビルド時はOpenXR Loaderの同梱にCMakeとC++ツールチェーンが必要。利用者がLoader DLLを配置する手順は不要。Windows向けCIで同梱Loaderを含めて検証する。ネイティブ取得・取消はSessionをまたぐ非同期操作のため、現在の同期MCP document surfaceには公開していない。UIとTauri IPCに限定し、MCPの簡易形状配置を直接取得と呼ばない。

## 対応範囲

| 接続環境 | 実装・制約 |
| --- | --- |
| Meta Air Link + Meta Runtime | FB系の部屋取得拡張を使う読取処理を実装。実機未検証 |
| SteamVR Runtime | 同じ必須拡張がある場合だけ取得。接続できる端末すべてに対応するものではない |
| PICO 4 Ultra + PICO Connect | 部屋取得は未対応。PCへの空間API公開も未確認 |
| 新しいルームスキャン | 未実装。MetaではLink接続前にQuest本体でRoom Setupを済ませる |

WebXR Preview、ブラウザのスキャンページ、ブラウザ機能診断、外部ブラウザ起動は削除した。HTTPSページやファイルの手動転送は使わない。Runtimeの選択をStudioから変更しない。

取得した形状をGLB Assetとして配置し、形状がなく寸法がある場合に同梱サンプルを使う。実物の製品モデルを識別・生成する機能ではない。取得結果はローカルプロジェクトに保存し、自動送信しない。

## Capture Schema

`src/lib/visual-editor/value-up/spatial-xr/spatial-capture.ts` が型の正本。0.1.0は0.2.0へ移行し、未知のバージョン・異なる座標系・不正なposeやindexは拒否する。

右手系・Y-up・メートル。Surfaceの頂点とBoundsはSurfaceローカル、poseはreferenceSpace内。Plane polygonはplaneSpaceのX/Z面で+Yが法線。GLB化でposeを頂点へ二重適用しない。Three.jsのXYZ Eulerへ変換して配置する。

Capture ID、sourceSurfaceId、元Semantic Labelを保存する。未知ラベルは文字列を保持する。Metaの大文字ラベルは分類エイリアスとして対応する。

JSON入力は64MBまで。Surface数・頂点数・index数を制限し、全体の構造を確認してからAssetを書き込む。読み込み中にSceneが変わった場合は、古いSceneで上書きせず再試行を案内する。途中のAsset書き込みが失敗した場合、Sceneは反映されないが未参照ファイルが残る可能性がある。

## GLBと純正モデル

取得Geometryを優先する。Planeは凹形状を考慮して三角形化する。形状がないときは19種の同梱サンプルを使い、認識BoundsとGLBの寸法・設置原点に合わせる。これは家具の高品質完成ライブラリではなく、分類ごとの基本サンプルである。

サンプルは `public/visual-editor/spatial-samples/`、登録は `semantic-sample-models.ts`。manifestのSHA-256、byteLength、GLBの実Boundsを一致させる。GLOBAL_MESHのサンプルは実際の部屋の再現ではないため、実Meshがない場合に部屋として自動採用しない。

純正モデルを増やすときは、まず同じSemanticに複数候補を登録し、既存のrankSemanticPrefabsへ渡す。ランカーは意味一致を必須にし、寸法最大20点、styleTags最大10点を加える。既定のインポートは分類ごとの基本サンプルを選ぶ。Style Packの自動選択UIは将来の拡張である。

| 項目 | 制作・登録時の契約 |
| --- | --- |
| 座標・単位 | GLBは+Yが上、メートル。正面方向はモデルごとに確認し統一する |
| 家具のPivot | 床面中央。扉の可動部分はヒンジ、壁付けは取付面を基準にする |
| 寸法 | nominalSizeと実Boundsを照合する。Boundsは幅・高さ・奥行きの順 |
| Material | glTF PBR。Normal Map等の必要なテクスチャを内包する |
| Metadata | semanticLabels、styleTags、元ラベル、生成元を保持する。Blenderはexport_extrasを有効にする |
| 品質確認 | Studio実レンダリングで接地・向き・Materialを確認し、Questの実測を別に記録する |
| 将来の拡張 | 軸別Scale制限、LOD、thumbnail、50〜70種のStyle Pack。未実装をmetadataだけで対応済みとしない |

保存形式の既存識別子 `webxr-right-handed-y-up-meters` と過去の `source.transport` 値は、既存データの互換性のため維持する。これらはブラウザ機能の有効化を意味しない。今回の直接取得は `source.transport: "openxr"` を記録する。

## MCP

| Tool | 結果 |
| --- | --- |
| plan_spatial_capture | 取得済みデータから簡易形状の配置計画を返す |
| apply_spatial_capture | revisionを確認して簡易形状を配置する。GLB保存や端末取得は行わない |
| rank_spatial_prefabs | 意味・寸法・styleTagsに合う候補を比較する |
| plan_digital_twin | MaterialやPrefabの変更計画を返す。適用は後続操作 |

端末取得は非同期Session操作と複数Assetの保存を伴うため、同期MCP document surfaceには公開しない。UIとTauri IPCから実行する。Anchorの復元・共有、Depthによる遮蔽、Style Packの一括適用は未実装。

## 検証

- `pnpm typecheck`
- `node --test scripts/native-room.test.mjs scripts/guide.test.mjs`
- `node scripts/generate-mcp-tool-names.mjs --check`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --locked --manifest-path src-tauri/crates/openxr-room/Cargo.toml`
- Windows実機で読取、取消、切断、位置・向き、Scene変更時の拒否を確認する。

CIでのコンパイル・テスト成功と実機取得の成功を区別する。新規スキャンやPICO対応を検証済みと扱わない。

## 一次資料

- [OpenXR Loader](https://registry.khronos.org/OpenXR/specs/1.1/loader.html)
- [Meta LinkでのScene API](https://developers.meta.com/horizon/documentation/unreal/unreal-mr-utility-kit-gs/)
- [Meta Air Linkサンプル](https://github.com/oculus-samples/Unity-TheWorldBeyond)
