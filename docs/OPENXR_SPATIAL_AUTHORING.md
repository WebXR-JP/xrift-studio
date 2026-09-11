# OpenXR / WebXR Spatial Authoring

Visual Projectを正本にし、既存のSceneDocument、Asset Import、Compilerへ接続する。PCのRuntime診断、外部ブラウザでのVR Preview、Quest BrowserでのRoom Captureは別の処理である。

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

## このPRの範囲

| 機能 | 実装・制約 |
| --- | --- |
| PC Runtime診断 | Windows Registry / Linux XDGと環境変数から登録を読む。HMDの利用可否や描画成功は保証しない |
| XR Play | 保存→Compiler→専用staging→dev server→既定ブラウザ。VR対応Chrome/Edge等でEnter VRを押す。通常のPublishとは別staging |
| VR入力 | 左右Controllerのselectを既存Interactableへ渡す。移動、手の見た目、全Controller Profileは未検証 |
| Quest Room Capture | immersive-arでPlane / Meshを取得し、JSONとGLBをダウンロードする。端末の許可と対応ブラウザが必要 |
| Capture読み込み | XRパネルからJSONを選び、取得形状をGLB Assetとして配置。形状がない場合のみ同梱サンプルを使う |
| 簡易形状の配置 | MCP apply_spatial_capture。既存PrimitiveとColliderを使う。GLB読み込みとは別の操作 |
| Prefab候補の比較 | 意味が一致する候補だけを寸法・styleTagsで並べる。候補の自動制作やStyle Packの生成はしない |
| Digital Twin | 読み取り専用の変更計画。計画したMaterial / Prefabの適用は後続操作 |
| Anchor | Binding用データ型と編集関数。永続Anchorの取得・復元・共有は未実装 |
| Hit Test | 最初に取得できたposeをCaptureへ記録。任意位置へ継続配置するMR UIは未実装 |
| Depth | CPU側から取得できる概要の記録。GPU Depth、Depth描画、遮蔽の適用は未実装 |
| Occlusion | purposeとして保持する。用途ラベルだけで遮蔽描画が有効になるわけではない |
| Hand / Layers / WebGPU | 入力源やAPIの診断。APIの存在とsessionで有効なfeatureを区別する |

実機動作はこのPR作成環境では未確認。既存ZIPの「全部入り」「動作可能」という記述は保証として引き継がない。ネイティブOpenXR描画エンジン、Questへの自動転送、スキャンからの製品モデル識別は含まない。

## 操作とデータ

利用者向け手順は [XRと部屋の取り込み](guide/xr-spatial.md)。Captureページは `public/xr-spatial/` に置く。公開前はURLが使えると断定せず、PRのプレビューまたはローカルで確認する。

- PICO Connect対応端末はWindows PCへ接続し、SteamVRをOpenXR RuntimeとしてPCVR Previewを試す。実機未検証。PCVR表示はPICOのRoom Capture対応を意味しない。
- PCVRは対応ブラウザとActive OpenXR Runtimeの組み合わせで検証する。既定ブラウザが非対応なら、起動URLを対応ブラウザへ貼り付ける。
- Quest単体のlocalhostはQuest自身を指す。PCのlocalhost URLをそのままQuestで開いても接続できない。Quest側のCaptureページにはHTTPSを使う。
- Runtimeの登録は読み取りのみ。アプリからRegistryやRuntime選択を変更しない。
- APIの有無、requestSession成功、enabledFeatures、実際に取得できた形状をそれぞれ区別する。
- 取得データはダウンロードまたはローカルプロジェクトに保存する。自動送信はしない。部屋の形状を公開する判断はユーザーが行う。

## Capture Schema

`src/lib/visual-editor/value-up/spatial-xr/spatial-capture.ts` が型の正本。0.1.0は0.2.0へ移行し、未知のバージョン・異なる座標系・不正なposeやindexは拒否する。

右手系・Y-up・メートル。Surfaceの頂点とBoundsはSurfaceローカル、poseはreferenceSpace内。Plane polygonはplaneSpaceのX/Z面で+Yが法線。GLB化でposeを頂点へ二重適用しない。Three.jsのXYZ Eulerへ変換して配置する。

Capture ID、sourceSurfaceId、元Semantic Labelを保存する。未知ラベルは文字列を保持する。Metaの大文字ラベルとWebXRのラベルを混同せず、分類エイリアスとして対応する。

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

## MCP

| Tool | 結果・次の操作 |
| --- | --- |
| plan_spatial_capture | 読み取り専用の簡易形状計画。元Captureと対象Materialを確認する |
| apply_spatial_capture | revisionを検査し、簡易形状を配置。結果のEntityを確認する。GLB化はXRパネルの読み込みを使う |
| rank_spatial_prefabs | 意味・寸法・styleTagsに合う候補。選択後の配置は既存Asset操作で行う |
| plan_digital_twin | 読み取り専用。MaterialやPrefabの変更計画を返す |

XR PlayとCaptureファイル読込はデスクトップUIの操作。現時点でMCPの対応操作にしない理由は、前者が外部プロセスを起動し、後者が複数Assetの永続化を伴い、同期document surfaceに配置できないため。将来はproject/local-asset surfaceで既存revisionと保存の契約に接続する。Shapeの簡易配置だけをGLB保存済みと報告しない。

## 確認

- pnpm typecheck
- node scripts/generate-mcp-tool-names.mjs --check
- node scripts/check-fixture-coverage.mjs
- Spatial Capture fixture: 不正入力、Quaternion、Bounds補正、Semantic候補、凹PlaneのGLB面積
- 19 GLB: parser再読み込み、manifestのSHA-256・byteLength
- Rust変更: cargo checkとopenxrのテスト。利用可能なRust環境で行う
- 実機: Windows + Meta Link、Windows + SteamVR、Quest Browser standaloneで別々に記録する

実機ではVR開始・終了・再開、左右select、アプリ終了後のdev server停止、Capture取消、Plane/Mesh不対応、権限拒否、姿勢未取得、GLBの寸法と向きを確認する。検証したOS・ブラウザ・Runtime・端末をPRに残す。

## 一次資料

2026-09-11確認。仕様にAPIがあっても、すべての端末が実装しているとは限らない。

- [OpenXR Loader](https://registry.khronos.org/OpenXR/specs/1.1/loader.html)
- [WebXR Plane Detection](https://immersive-web.github.io/plane-detection/)
- [Meta IWSDK Scene Understanding](https://developers.meta.com/horizon/documentation/iwsdk/guides/11-scene-understanding/)
