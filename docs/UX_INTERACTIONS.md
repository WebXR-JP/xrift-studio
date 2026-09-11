# 機能別の操作・状態設計

[文書一覧](./README.md) / [UX 原則](./UX_PRINCIPLES.md)

変更する分野を選び、該当する機能 ID の操作前・処理中・成功・失敗・戻り先を確認する。共通の動きは [MI 一覧](./ux/interactions.md) を参照する。新しい機能は該当分野に追記し、この一覧にも登録する。

## アプリ・プロジェクト

- [F-01 CLI 更新](./ux/app.md#f-01)
- [F-02 プロジェクトライブラリ](./ux/app.md#f-02)
- [F-03 プロジェクト作成](./ux/app.md#f-03)
- [F-04 ローカル実行](./ux/app.md#f-04)
- [F-06 アイテム検査](./ux/app.md#f-06)
- [F-20 XRift Studio本体の更新](./ux/app.md#f-20)
- [F-26 アプリデータのリセット](./ux/app.md#f-26)
- [F-41 紹介ページのダウンロード導線](./ux/app.md#f-41)
- [F-44 プロジェクトの複製・zip書き出し・zip / Git取り込み](./ux/app.md#f-44)

## シーン編集

- [F-07 ビジュアルエディター](./ux/editor.md#f-07)
- [F-09 Command / Shortcut / Prefab](./ux/editor.md#f-09)
- [F-11 Collider authoring / export](./ux/editor.md#f-11)
- [F-12 Scene environment settings](./ux/editor.md#f-12)
- [F-13 XRift Component editor preview](./ux/editor.md#f-13)
- [F-14 Basic Component menu / Audio Source](./ux/editor.md#f-14)
- [F-25 素材とOSファイルエクスプローラー](./ux/editor.md#f-25)
- [F-31 Terrain authoring / MCP](./ux/editor.md#f-31)
- [F-32 Scene post effects](./ux/editor.md#f-32)
- [F-33 Wind Component](./ux/editor.md#f-33)
- [F-34 空の背景シェーダー（手続き的な空）](./ux/editor.md#f-34)
- [F-39 テキストコンポーネント（書体・背景）](./ux/editor.md#f-39)
- [F-44 画像コンポーネント（画像の板）](./ux/editor.md#f-44)

## 素材の取り込み・編集

- [F-08 Visual Asset authoring / import](./ux/assets.md#f-08)
- [F-15 OBJ / VRM import と静的モデルポーズ](./ux/assets.md#f-15)
- [F-16 UnityPackage / Scene / Prefab import](./ux/assets.md#f-16)
- [F-18 OpenBrush import / shader rendering](./ux/assets.md#f-18)
- [F-21 外部リソースStoreと環境テクスチャ](./ux/assets.md#f-21)
- [F-23 公式XRiftのコンポーネントカタログとコード編集 / TSX変換](./ux/assets.md#f-23)
- [F-24 glTF マテリアル制御とBehavior連携](./ux/assets.md#f-24)
- [F-29 カスタムシェーダー authoringとマテリアル適用](./ux/assets.md#f-29)
- [F-30 テクスチャから遠景 / 草カードを作成](./ux/assets.md#f-30)
- [F-36 音声素材試聴](./ux/assets.md#f-36)
- [F-37 テクスチャ解像度変更・圧縮の適用](./ux/assets.md#f-37)
- [F-40 公開時のテクスチャ変換と取り込み時の最大解像度](./ux/assets.md#f-40)
- [F-43 しかけ付き3Dセット（チュートリアル）](./ux/assets.md#f-43)

## 保存・公開・書き出し

- [F-05 公開準備とアップロード](./ux/publishing.md#f-05)
- [F-10 Visual Save / Compile / Preview / Upload](./ux/publishing.md#f-10)
- [F-19 ビジュアル編集からコード編集への書き出し](./ux/publishing.md#f-19)
- [F-27 公開前パフォーマンス概算と素材最適化](./ux/publishing.md#f-27)

## アニメーション・スクリプト

- [F-22 GLB / glTF Animation自動再生](./ux/behavior.md#f-22)
- [F-28 スクリプトとスクリプトのコンポーネント](./ux/behavior.md#f-28)
- [F-38 操作のトリガー](./ux/behavior.md#f-38)

## AI 接続・診断・録画

- [F-17 AI editor integration / MCP](./ux/tools.md#f-17)
- [F-35 ビジュアル編集 QA診断と短時間録画](./ux/tools.md#f-35)
- [F-42 ワールド制作の録画](./ux/tools.md#f-42)

## XR Preview / Spatial Capture

XRパネルは診断前・診断中・検出結果・失敗を分ける。Runtime登録はHMD動作成功と表示しない。XR PlayとCapture読み込みは処理中の二重操作を防ぎ、失敗理由をパネルに残す。Preview開始後は実際のURLをパネルに保持し、コピー・開き直し・停止へ進める。開始前に架空の固定URLを表示しない。停止後はURLを消す。Capture読込成功後は最初のEntityを選択し、配置件数とスキップ件数を示す。取得中に編集されたSceneを古い結果で上書きしない。

OpenXR部屋取得は、未確認・拡張不足・取得中・素材保存中・完了・失敗を区別する。保存済み部屋の読取を主操作とし、HTTPSページへ誘導しない。取得中だけ取消を表示し、保存中は二重操作を防ぐ。完了時は配置Entityを選択して結果を確認できるようにする。Runtime名や接続ソフトの検出だけを取得成功と表示しない。
