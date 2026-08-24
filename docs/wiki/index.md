# XRift Studio ユーザーガイド

XRift Studio は、[XRift](https://xrift.net/) のワールドとアイテムの制作を始めるための、非公式デスクトップアプリです。Node.js や `@xrift/cli` の導入、コードまたはビジュアルエディターによる制作、ローカルプレビュー、XRift への公開までをひとつの画面にまとめています。

> **注意**: XRift Studio は XRift 公式とは無関係の有志製ツールです。XRift 本体・公式 CLI・アカウントについては、[XRift 公式サイト](https://xrift.net/)をご確認ください。

この Wiki は、インストールから具体的な利用方法までを、制作の流れに沿ってまとめたものです。

## 目次

### はじめに

- [インストールとセットアップ](./installation.md)
- [プロジェクトの作成とライブラリ](./projects.md)
- [データの保存場所とリセット](./data-and-reset.md)

### 制作

- [クラシックエディター（コード編集）](./classic-editor.md)
- [ビジュアルエディターの概要](./visual-editor.md)
- [3D 素材の取り込み](./importing-assets.md)
- [外部リソースから追加する](./external-resources.md)
- [アセットと表現（Texture / Material / Particle）](./assets-and-materials.md)
- [地形と衝突判定](./terrain-and-colliders.md)
- [空と水をつくる](./sky-and-water.md)
- [ノードで動きをつける（Interactivity）](./interactivity.md)
- [Entity に振る舞いを与える（Scripting）](./scripting.md)

### 確認と公開

- [Play で動作を確認する](./play-mode.md)
- [XRift への公開（アップロード）](./publishing.md)

### 発展

- [AI と一緒に Scene を編集する](./ai-connection.md)
- [Visual project を通常の XRift 開発へ書き出す](./classic-export.md)

### トラブルシューティング

- [トラブルシューティング](./troubleshooting.md)

## 制作の流れ

XRift Studio での制作は、次のような流れで進みます。

```text
セットアップ → プロジェクト作成 → 素材取り込み → Scene 編集 → Play 確認 → 公開
```

1. **セットアップ**: アプリ専用領域に Node.js と `@xrift/cli` を準備します。
2. **プロジェクト作成**: ワールド／アイテムと、クラシック／ビジュアルの 4 通りから選びます。
3. **素材取り込み**: GLB、OBJ、VRM などの 3D 素材や、画像、音声を取り込みます。
4. **Scene 編集**: ビジュアルエディターで Entity を配置し、Inspector で設定します。
5. **Play 確認**: 編集状態を保ったまま動作を確認します。
6. **公開**: 保存・検査・変換を行い、XRift にアップロードします。

## 対応機能の概要

| やりたいこと | 現在できること |
| --- | --- |
| 制作環境を準備する | アプリ専用領域へ Node.js と `@xrift/cli` をセットアップする。システム側の環境と分けて管理できる。 |
| プロジェクトを探して再開する | 種別、サムネイル、名前、説明をカードで一覧表示し、選んだプロジェクトを開く。 |
| 新しいプロジェクトを作る | ワールド／アイテムと、クラシック／ビジュアルの 4 通りから選び、作成後のプロジェクトをそのまま開く。 |
| コードと設定を編集する | 内蔵エディタでテキストファイルを編集・保存する。`xrift.json` はフォームと raw JSON の両方で編集できる。 |
| シーンをビジュアル編集する | Hierarchy、Scene View、Inspector、Assets を使い、Primitive、Model、Prefab、XRift Component を配置してギズモで調整する。 |
| 3D 素材を取り込む | GLB／glTF、OBJ、VRM 0.x／1.x を Model Asset として取り込む。 |
| アセットと表現を作る | Texture、Material、Particle、Prefab を Assets で管理し、Inspector から編集する。 |
| 音を配置する | MP3 を Audio Asset として取り込み、Audio Source へ割り当てて保存・変換する。 |
| 衝突判定を設定する | Primitive には Box Collider、インポート Model には Mesh Collider を初期設定する。 |
| 地形をつくる | 高さサンプル Terrain を追加し、ブラシで編集する。形と草が入ったプリセットからも始められる。 |
| 草を生やす | Terrain へ草の層を重ね、ブラシで塗って生やす・消す。Scene の風で揺れる。 |
| 空と水をつくる | GLSL で描く空と水面の Material を公式カタログから追加し、Uniform values で調整する。 |
| 外部の素材を取り込む | Poly Haven と ambientCG の CC0 素材、XRift 公式の Shader・Terrain・照明・Component をアプリ内から追加する。 |
| ノードで動きをつける | KHR_interactivity 準拠のグラフを組み、開始時・毎フレーム・イベントをきっかけに色や再生を動かす。 |
| Entity に振る舞いを与える | Script Asset を TypeScript で書き、Script Component として Entity へ付けて Play で実行する。 |
| Editor 内で Play 確認する | 編集状態を保持したまま Play へ切り替え、動作を確認する。 |
| ローカルで動作を確認する | 開発サーバーを起動・停止し、プレビュー URL をブラウザで開く。 |
| XRift に公開する | ログイン後、タイトル・説明・サムネイルを確認してアップロードする。 |
| AI と一緒に Scene を編集する | Codex、Claude Code、OpenCode、Cursor などを登録し、限定 MCP tool で Scene を編集する。 |

## まずはブラウザで見る

[**GitHub Pages の Web プレビューを開く →**](https://webxr-jp.github.io/xrift-studio/)

ブラウザ版では、ワールドとアイテムを選べる制作フロー、コード編集画面、3D プレビューに加え、ビジュアルエディターのデモを確認できます。実際のログイン、ローカルファイル操作、CLI 実行、XRift への公開はデスクトップ版の機能です。

## ダウンロード

[**最新版を GitHub Releases からダウンロード →**](https://github.com/WebXR-JP/xrift-studio/releases/latest)

| 対応 OS | 配布形式 |
| --- | --- |
| Windows 10 / 11 | `.msi`（推奨）、`.exe` |
| macOS 12 以降 | `.dmg`（Apple Silicon / Intel） |
| Linux | `.deb`、`.rpm`、`.AppImage` |

リリースがまだない場合は、[Web プレビュー](https://webxr-jp.github.io/xrift-studio/)またはソースからの開発環境をご利用ください。

## 開発者向け

ソースからビルド・改変する場合は、[開発ガイド](../DEVELOPMENT.md) と [AGENT.md](../AGENT.md) を参照してください。
