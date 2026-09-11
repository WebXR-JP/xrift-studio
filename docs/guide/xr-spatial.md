# XRと部屋の取り込み

XRパネルでは、PCのVR環境を診断し、編集したワールドを外部ブラウザで確認できます。Quest Browserで取得した部屋の形状も取り込めます。この機能は実機検証中です。

## OpenXR接続中の端末から部屋を取り込む

WindowsのStudioから保存済みの部屋を直接取得できます。ブラウザのHTTPSページやJSONの手動転送は不要です。実機動作は未検証です。

1. Quest単体でRoom Setupを済ませ、Meta Air Link等でPCへ接続します。PC側で空間データの利用を許可してください。
2. Scene Viewの「XR」を開き、「再診断」で現在のRuntimeを確認します。必要な拡張がない場合は不足項目を表示します。
3. XR PreviewとPlayを停止し、「接続中の端末から部屋を取り込む」を押します。
4. 取得後に選択されたEntityの寸法・向き・床位置を確認します。取り込みには既存の保存処理を使います。

取得対象は床・壁の平面、家具などの寸法・分類、対応Runtimeが提供するMeshです。取得中にシーンが変更された場合は、その編集を上書きせず再取得を案内します。「取得を取り消す」はデータ取得中だけ使えます。素材の保存が始まった後は完了を待ってください。

Meta Air Linkでは、既存の部屋の読み取りと新しいRoom Setupを区別します。部屋がなければLinkを切断し、QuestでRoom Setupを済ませて再接続してください。取得のために一時的なOpenXR Sessionを使うので、ヘッドセットの表示が切り替わる場合があります。

SteamVRも接続先として確認しますが、必要なScene拡張を公開していないRuntimeからは部屋を取得できません。接続方式やRuntime名だけで対応を判定しません。未対応時にブラウザ方式へ自動で切り替えることはありません。

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

## 別の方法：Quest Browserから部屋を取り込む

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
