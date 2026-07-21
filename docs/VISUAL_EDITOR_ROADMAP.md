# XRift Studio Visual Editor Roadmap

最終更新: 2026-07-21

## 目標

XRift Studioだけで、World／Itemの作成、素材の取り込み、Scene編集、Play、保存、検査、XRift向け変換、Uploadまでを途切れず進められる制作環境にする。

Visual projectはコードを隠すだけの画面ではなく、Scene、Asset、Material、Prefabなどの型付きデータを正本として保存する。開発版のClassic export CLIでは、その制作データを通常のXRiftコードプロジェクトへ一方向に引き渡せる。

## 現在地

状態は次の3種類で表す。

- **利用可能**: デスクトップ版の主要導線に接続済み。
- **検証中**: 実装はあるが、対応データや実機での受け入れを継続中。
- **計画中**: 仕様または実装順序を整理した段階。

| 制作領域 | 状態 | 現在できること |
| --- | --- | --- |
| Visual project | 利用可能 | World／Itemの作成、保存、再読込、autosave、reference validation。 |
| Scene編集 | 利用可能 | Hierarchy、Scene View、Inspector、Assets、選択、transform、親子関係、複製、削除、Undo／Redo。 |
| Model import | 利用可能 | GLB、自己完結glTF、OBJ、VRM 0.x／1.xをModel Assetとして取り込む。 |
| Avatar pose | 利用可能 | 取り込んだボーンのXYZ回転とshape keyの値をEntityごとに保存し、Scene Viewと生成コードへ反映する。 |
| Open Brush | 検証中 | Open Brush／Tilt Brush由来のglTFを判定し、`three-icosa`でブラシ表現を読み込む。ブラシごとの受け入れ確認を継続する。 |
| Unity import | 検証中 | UnityPackage、`.unity`、`.prefab`を解析し、対応するScene、Prefab、Model、Textureへ変換する。Unity固有機能の完全互換ではない。 |
| Texture／Material | 利用可能 | PNG、JPG、WebP、KTX2を取り込み、PBR Material、slot binding、thumbnailを編集する。 |
| Audio | 利用可能 | MP3をAudio Assetとして取り込み、Audio Sourceへ割り当ててSceneと生成物へ保存する。 |
| 表現と再利用 | 利用可能 | Primitive、Material、Particle、Prefab、Collider、XRift Componentを作成・配置する。 |
| Play | 利用可能 | 編集状態を保持してPlay／Stopし、WorldはWASD移動、Itemは単体表示を確認する。runtime受け入れは継続する。 |
| Compile／Upload | 利用可能 | Visual documentの保存、検査、XRift向けTSX生成、staging、World／ItemのUpload導線。 |
| AI connection | 検証中 | アプリ内の接続パネルからMCP serverを登録し、Scene読取・編集の限定toolを呼び出す。sidecar同梱を含む配布確認を継続する。 |
| Animation timeline | 計画中 | ボーンとshape keyのkeyframe、再生、補間、clip保存、XRift runtimeへの出力。 |
| Visualから通常開発への書き出し | 開発版あり | project JSONとAssets一式を指定し、Runtime JSON付きの新規Classic projectへ安全に書き出す`npx`コマンド。 |

## 今回広がった範囲

- GLB／glTFに加えてOBJとVRM 0.x／1.xのimport、preview、再import、compileを接続した。
- Model Assetからボーンとshape keyを抽出し、Entityごとの静的ポーズを保存できるようにした。
- UnityPackage、Unity Scene、Prefabの解析と、対応Asset／Sceneへの変換経路を追加した。
- MP3 Audio AssetとAudio Sourceの参照、配置、compileを追加した。
- Open Brush／Tilt Brushの判定と専用rendererへの接続を追加し、ブラシ表現の受け入れを開始した。
- AIクライアントからEditorを扱うためのMCP broker、接続パネル、限定Editor tool、配布用sidecar準備を追加した。
- ビジュアルエディターの遅延読込失敗を識別し、アプリ再読込へ戻れる回復導線を追加した。

## 現在の制約

- OBJの外部MTL／Textureは自動取得しない。取り込み後にMaterial Slotへ割り当てる。
- glTFは現時点でGLBまたは自己完結したファイルを基本とし、汎用的な複数sidecar file importは今後対応する。
- VRMの静的ポーズは保存できるが、keyframe、clip、補間、timeline編集はまだない。
- Unity固有Component、Shader、Script、Animationを完全には移植しない。対応内容と未対応内容をimport前に示す方針とする。
- Open Brushはbrushごとの描画差を継続検証中。通常のMaterial overrideとは扱いを分ける。
- Webプレビューは制作体験のデモであり、ローカルファイル操作、CLI実行、Uploadはデスクトップ版だけで行う。

## ロードマップ

| Phase | 到達点 | 状態 | 次の完了条件 |
| --- | --- | --- | --- |
| 1 | Visual document基盤 | 利用可能・継続改善 | migration fixtureと参照修復を増やし、旧projectも決定的に開ける。 |
| 2 | Editor shell／command | 利用可能・継続改善 | 複数選択、検索、shortcut設定、panel restoreを実用水準にする。 |
| 3 | Asset import | 利用可能・検証中 | sidecar付きglTF、reimport差分、欠落参照、Open Brush、Unity importの実データ受け入れを完了する。 |
| 4 | Material／Texture／Audio | 利用可能・継続改善 | Inspector、thumbnail、Scene View、生成コードの見え方と音を一致させる。 |
| 5 | XRift Component／Play | 利用可能・検証中 | Worldのcharacter、collider、spawn、cameraとItem previewを実runtimeで受け入れる。 |
| 6 | Save／Compile／Upload | 利用可能・堅牢化中 | 診断元への移動、認証、再試行、staging provenance、正式result表示を一つの流れにする。 |
| 7 | Static avatar pose | 利用可能・継続改善 | humanoid名、一般bone、shape keyの保存、再読込、生成コードをfixtureと実VRMで一致させる。 |
| 8 | Animation authoring | 計画中 | timeline上でbone／shape key keyframeを編集・再生し、clipとして保存できる。 |
| 9 | Classic export CLI／Runtime | 開発版あり | Runtime JSON、Three.js／R3F adapter、dry-run、衝突検知、Asset copy、provenanceを実装済み。未対応Runtime Componentとnpm公開を完了する。 |
| 10 | Production readiness | 計画中 | 大規模Scene性能、accessibility、失敗回復、security、release checklistを満たす。 |

## 通常のXRift開発へ渡すCLI

Visual projectのmanifestまたはproject rootを指定し、新しいXRift Classic projectへ一方向に書き出す。

```bash
npx xrift-studio convert ./my-visual-project --to classic --out ./my-xrift-world
```

repository内の開発版はRuntime JSON、Three.js／R3F adapter、dry-run、未改変exportのupdateまで接続済みである。npm公開、Runtime Componentの対応範囲、desktopのExport画面は[Visual Project Classic Export CLI](./VISUAL_PROJECT_MIGRATION_CLI.md)にまとめる。

## 現在の優先順

1. Open Brush、UnityPackage、OBJ、VRMを実データで受け入れ、保存後の再読込とcompileまで一致させる。
2. Model再importへ別source選択、sidecar付きglTF、変更差分、消失slot参照一覧を追加する。
3. VRM／skinned modelの静的ポーズを実機で磨き、timeline用のpose／clip data contractを先に固定する。
4. AI connectionの認証境界、timeout、sidecar同梱、失敗後の再接続をrelease環境で確認する。
5. `xrift-studio-runtime`のAudio、Particle、Collider physics、XRift固有Component adapterを追加し、ClassicとEditor Previewの結果を一致させる。
6. Material、Play、XRift Component、Uploadを同じVisual documentから通しで受け入れる。

## 完了判定

ファイルやbuttonが存在するだけでは完了としない。各機能は、実データによる操作、保存後の再読込、Undo／Redo、失敗時の復帰、compiler出力まで一致した時に完了とする。CLI移植は、dry-runの内容が決定的で、手書きファイルを既定で上書きせず、同じ入力を再実行しても不要な差分を出さないことを完了条件に含める。
