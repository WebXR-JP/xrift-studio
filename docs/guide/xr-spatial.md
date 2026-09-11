# XRと部屋の取り込み

XRパネルでは、PCのVR環境を診断し、編集したワールドを外部ブラウザで確認できます。Quest Browserで取得した部屋の形状も取り込めます。この機能は実機検証中です。

## PCでVRを確認する

1. SteamVRまたはMeta Linkでヘッドセットを接続し、使用するOpenXR Runtimeを設定します。
2. ワールドを開き、Scene Viewの「XR」から「再診断」を押します。Runtimeの検出だけではHMDの動作確認は完了しません。
3. 「XR Play」を押すと、ワールドを保存・変換して外部ブラウザを開きます。
4. WebXR対応ブラウザで「Enter VR」を押します。非対応のブラウザが開いた場合は、表示されたURLを対応ブラウザへコピーします。
5. 終了するときはブラウザでVRを終了し、XRパネルの「XR Previewを停止」を押します。

スクリプト等の変換でエラーになった場合は表示された問題を修正してください。VR確認でXRiftへの公開は行われません。PCでの性能とQuest単体の性能は異なります。

## PICOをPCにつないで見る

PICO Connect対応のヘッドセットでは、Windows PCへ接続し、SteamVR経由でVR Previewを試せます。この組み合わせでのXRift Studioの実機動作は未検証です。

1. [PICO Connect](https://www.picoxr.com/global/software/pico-link)でPCとヘッドセットを接続します。
2. SteamVRを起動し、ヘッドセットとコントローラーが認識されていることを確認します。OpenXR RuntimeはSteamVRを選びます。
3. Studioの「XR Play」で開いたWebXR対応ブラウザから「Enter VR」を押します。

「WebXR VR unavailable」と表示された場合はブラウザとRuntimeの組み合わせを確認してください。XRパネルに残る実際のPreview URLを別の対応ブラウザで開くこともできます。PC画面を平面スクリーンとして見る機能とは異なります。

SteamVR経由のVR表示から、PICOの部屋形状やSemantic情報も取得できるとは限りません。以下のRoom ScanはQuest向けで、PICOでの動作は未確認です。

## Questで部屋を取り込む

Quest Browserから、このバージョンの「Quest Room Scan」ページをHTTPSで開きます。PCのlocalhost URLはQuestから直接使えません。公開前のバージョンではページの準備が必要です。

1. 端末の部屋設定を済ませ、Room ScanページでCaptureを開始します。
2. 必要な許可を与え、PlaneやMeshを取得できるまで待ちます。未対応・権限拒否の場合は取り込めません。
3. 「.xrift-spatial.json を保存」で結果を保存し、Studioを使っているPCへ移します。
4. StudioのXRパネルで「Spatial Captureを読み込む」からファイルを選びます。
5. 配置されたモデルの寸法・向き・接地を確認し、プロジェクトを保存します。

取得できた形状をGLBとして使い、形状がない物体には基本サンプルを配置します。実物の製品モデルが得られる機能ではありません。部屋全体のMeshが取れなければ、その形状を推測して補完しません。

Room ScanページのGLB保存を使うと、Studio以外へも形状を持ち込めます。床や壁の情報を含むため、公開する前に内容を確認してください。データは自動送信されません。

## 対応状況

永続Anchorの復元・共有、Depthによる遮蔽、自由配置MR UI、Style Packの一括置換は今後の機能です。現在のAnchorやDigital Twinには、データ構造と変更計画のみの部分があります。
