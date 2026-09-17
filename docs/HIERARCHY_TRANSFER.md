# Hierarchyの受け渡し契約

基礎実装: 2026-09-14。今回の統合: PR #101相当のUI調整版。対象: ビジュアルプロジェクトのEntity選択範囲。操作は[利用者向けガイド](./guide/hierarchy-transfer.md)、画面の状態は[F-46](./ux/editor.md#f-46)、実施した検証は[検証記録](./AUTHORING_WORKFLOW_VERIFICATION.md)を参照する。

## 目的と境界

ワールド→アイテム、アイテム→ワールド、ワールド→ワールド、アイテム→アイテムを同じ追加処理で扱う。別プロジェクトを開く操作と、今のHierarchyへEntityを追加する操作を分離する。公開済みワールドからの抽出や、コードプロジェクトの任意ソース解析は行わない。

追加Importでは追加先の `projectKind` を切り替えない。書き出し時だけ、本人がワールド／アイテムを選べる。種類を変える際も既存の追加計画と同じComponent制約を適用する。例えばワールドの家具をアイテムにする場合は、アイテムプロジェクトを作成して、そのHierarchyへ家具を追加する。以降の編集・公開は既存のアイテム向け経路を使う。

## .xriftstudioとの互換性

ZIPコンテナー、`.xrift-studio/package-manifest.json` の `formatVersion: 1`、編集documentの `schemaVersion: 0.1.0` を維持する。新しい拡張子や移行必須のschemaは導入しない。

部分書き出しは選択範囲を一つの通常のビジュアルプロジェクトにする。新しいprojectIdとsceneIdを付け、`scenes/hierarchy.scene.json`、`assets/manifest.json` と参照ファイルを格納する。独立したプロジェクトとして開くこともできる。追加で次の補助情報を含める。

```json
{
  "format": "xrift-studio-hierarchy",
  "formatVersion": 1,
  "sourceProjectKind": "world",
  "warnings": []
}
```

格納先は `.xrift-studio/hierarchy-transfer.json`。これは既存documentを置き換えず、注意事項と形式の識別を補う。読み込み時は未来の形式や不正な注意事項を拒否する。補助情報のない従来のビジュアル `.xriftstudio` / `.zip` も読み込める。複数シーンのパッケージでは一度に一つのシーンから選ぶ。

元の `lastPublication`、公開記録sidecar、シーン全体の設定、未使用素材、キャッシュを選択範囲へ持ち込まない。Assetの著作者・提供元など、素材に付随する属性はコピーする。既存package manifestのファイル一覧とSHA-256は既存writerが生成するものであり、署名や安全なScriptの保証ではない。

## 選択範囲と依存素材

親と子を同時に選んだ場合は祖先を一つのrootとして扱う。子孫は全て含める。親のチェックから子だけ外した場合は親の選択も解除し、残した子・兄弟を独立したrootにする。Entityがない、親子が循環する、子が重複する、参照が欠ける場合は明示的に中止する。

参照フィールドからAssetの依存関係を辿り、Model→Material→Texture、Script、Audio、Font、Graph、Shaderなどの必要な素材とフォルダーの祖先を含める。元のModelへの編集履歴リンクは、それだけでは依存素材にしない。派生thumbnailは再生成対象にする。最適化前のバックアップを参照する場合はその元ファイルも含める。

glTFの相対buffer/image、OBJのMTL、MTLのtextureは元の相対構成ごと収集する。外部HTTP参照、絶対パス、プロジェクト外へ出るパスは取得しない。オプション付きMTLはGLBへ変換するよう案内する。任意のScript本文を解析・評価して依存ファイルを探す処理は行わない。

Prefab Instanceは既存resolverで現在のEntityへ展開し、元Prefabとのリンクを切る。無効な親の中など、resolverが展開しないInstanceを黙って消さず中止する。実行時Templateの参照は、Hierarchyへの展開が必要なものとして拒否する。Model内部のEntityは所有Modelを一緒に選ぶ。

## 参照の再割り当て

追加のたびにEntity、Component、Asset、AssetフォルダーのIDを生成する。Component IDはEntity単位なので、マップのキーには元のEntity IDとComponent IDを両方含める。ファイルは新しい `assets/imported/hierarchy-<id>/` 以下へ元の相対構成を保って格納する。同名のAsset、同じID、同じファイル名を理由に既存の内容を上書きしない。

型付きの参照フィールド、Componentの `entityReferences` / `assetReferences` で宣言されたproperties、GraphのEntity・Component・Asset設定を変換する。表示名、文章、コード、URL、shaderソースを一括文字列置換しない。Graphのscene/self/player用特殊IDを保持する。

選択範囲にないEntityへの参照は空にし、そのComponentを無効にする。Graphの参照は空にして未設定状態とし、注意事項を示す。追加先の偶然一致するIDに結び付けない。登録されたComponentの `uniqueWithinScene` な文字列も新しくする。コードに直接書いたIDや独自の一意キーは作者による確認が必要。

追加先の種類で使えない、または定義がないXRift Componentは設定を残して無効にする。標準Spawn Pointは追加先に応じて `player` / `item-preview` にする。全てのギミックが別種別でも同じ動作をするという保証ではない。

Scriptの `play-and-edit` は受け渡すsnapshotで `play` にし、直接のimport planでも再確認する。元のScript Asset本文と元プロジェクトの実行設定は変更しない。受け渡し操作からPlayを開始しない。既存Script runtimeはsandboxではなく、Play時の安全性はコード内容による。

## 座標

`world` は選択rootをワールド座標へ変換する。追加先に親がある場合は親のワールド行列の逆行列を使ってローカル座標へ変換する。`local` は元のローカルTRSをそのまま使う。`origin` はworld変換後の先頭rootの位置を全rootから引き、親またはSceneの原点へ移す。回転・大きさとroot間の相対配置は保持する。

行列を再構成できないshear、逆変換できない大きさ0は拒否する。近似して形を壊さない。既に部分書き出ししたファイルは、その保存時のTRSを基準にする。切り離した元の親は復元しない。

## 追加とUndo

`createHierarchyTransfer` → `prepareHierarchyTransferFiles` → `planHierarchyImport` → `applyHierarchyImportPlan` の順で処理する。計画段階は元bundleと追加先bundleを変更しない。

素材バイト列を読み終え、既存codecでdocumentを検証し、確認を得てから既存 `commitVisualAssetImport` で素材を書き込む。書き込みの前後で対象bundle・projectPath・編集状態を確認する。変わっていた場合はdocumentを追加しない。既存のEntityは参照を維持し、追加先の親のみimmutableに更新する。更新後のbundle全体を一つの履歴へ入れる。

UndoはEntityとAssetの登録を一緒に戻す。Redoのため書き込んだ素材ファイル自体は削除しない。書き込み後に別操作でrevisionが変わって追加を中止した場合も、未参照の管理ファイルが残り得る。原子的なdocument・ファイル・永続保存の一括DB transactionを新設したわけではない。追加後の永続保存は既存autosaveを使い、保存エラーは既存UIで扱う。

## UIと入出力

同一window/tabのモジュール内clipboardに素材バイト列付きsnapshotを保持する。プロジェクト切り替えでは消さない。OS clipboard、別window/tab、再起動、他アプリへの貼り付けには対応しない。長期・端末間の受け渡しはファイルを使う。

部分書き出しはScene / Hierarchy共通の右クリックから、追加Importは上部の「素材を追加」から確認dialogへ入る。dialogはnative `<dialog>` のmodal/focus管理を使い、処理中は変更・終了・二重実行を防ぐ。Entityの選択一覧は描画数を制限し、検索に対応する。Import完了までは確認画面を閉じず、失敗理由を残す。

ブラウザでは準備後にdownloadリンクを本人が押す。保存開始と保存完了を混同しない。デスクトップは型付きIPC `saveHierarchyPackage` から明示的な保存先選択を行い、新規 `save_hierarchy_package` でサイズ・形式を確認した後、一時ファイルとrenameで保存する。既存の全プロジェクト書き出しを置き換えない。

## 制限

| 対象 | 上限・扱い |
| --- | --- |
| 選択Entity | 20,000件 |
| 素材ファイル | 512件、1ファイル128 MB、合計256 MB |
| ZIP | ファイル本体と展開後256 MB、既存readerの20,000 entries制限 |
| 対象 | 編集可能なビジュアルプロジェクトのみ |
| 複数シーン | 入力で選択可能。一度の追加・書き出しは一つのシーン |
| 同期リンク | 元Prefab・元プロジェクトとの継続同期なし |

MCP向けの新しい選択範囲import/export toolは追加していない。UIのファイル選択・download・セッションクリップボードは人の操作と権限に依存するため公開しない。独立した機械操作APIを追加する場合は、バイト列の受け渡し・管理パス・revision・実行承認を別途契約化する。現在の147 toolの成功条件を変更しない。
