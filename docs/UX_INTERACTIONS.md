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

## OpenXRの部屋取り込み

OpenXRパネルは未確認・診断中・拡張不足・取得中・取消待ち・素材保存中・完了・失敗を区別する。診断が成功して必要な拡張を確認するまで取得ボタンを無効にする。拡張の存在は実機取得成功を意味しない。

主操作は「保存済みの部屋を取り込む」。取得中だけ取消を表示し、診断と取得・保存の同時実行を防ぐ。パネルを閉じても進行状態を保持する。成功時は配置Entityを選択し、配置・除外件数と取得時の警告を表示する。全件除外は成功扱いにしない。寸法・向き・床位置の確認へつなぐ。失敗理由を残し、再診断・再試行できるようにする。取得開始からプロジェクト保存・素材保存・Scene適用まで、Scene変更・Play移行・取消・画面終了を確認し、古い結果を適用しない。取得と取消は同じ要求IDを使い、遅延した取消が次の取得へ影響しないようにする。

新規ルームスキャンとPICO Connectの部屋取得は未対応と表示する。ブラウザプレビュー、URL入力、外部のスキャンページへの導線は設けない。
