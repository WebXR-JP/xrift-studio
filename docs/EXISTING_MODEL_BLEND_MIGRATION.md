# 既存GLBにBlenderの編集元を追加する

既存作品に Blender の編集元ファイルを追加するための開発用ツールです。実行前に Studio で対象プロジェクトを閉じてください。

このツールは元の GLB・Scene・Model ID・マテリアル割り当てを変更せず、検証済みの `.blend` と `blenderSource` だけを追加します。なお、元の制作時に使われていたモディファイアや編集履歴を復元する機能ではありません。

```powershell
& $blender --background --factory-startup --disable-autoexec --offline-mode --python-exit-code 1 --python scripts/prepare-existing-model-blends.py -- --project $project --output $prepared
& $blender --background --factory-startup --disable-autoexec --offline-mode --python-exit-code 1 --python scripts/verify-existing-model-blends.py -- $prepared
node scripts/commit-existing-model-blends.mjs $prepared
```

## 実行時の仕様と注意点

- `$prepared` には、プロジェクト外の新しい作業用ディレクトリを指定します。`--model <Asset ID>` を複数回指定すると対象モデルを絞り込めます。
- 既存の編集元ファイルは上書きしません。未対応の形式や拡張は `report.json` に記録します。
- 各ファイルは再度 Blender で開き、アプリと同じ書き出し処理を通してボーン名・MToon 設定・ジオメトリの存在を検証したうえで移行します。
- 移行前の `assets.json` は、同じディレクトリに `assets.json.before-blender-*.bak` としてバックアップされます。
- 準備後に作品や元 GLB が変更されていた場合は処理を停止します。保存途中で失敗しても元のマニフェストはそのまま残り、書き込み途中に残った未参照の `.blend` が作品に反映されることはありません。
- Studio を開いたままの並行編集には対応していません。

## MToon の扱い

テクスチャ参照を持たない `VRMC_materials_mtoon` は、Blender のカスタムプロパティとして保存します。MToon テクスチャや専用のインポーターを必要とする拡張を推測で変換することはしません。

Blender 上のマテリアル表示は MToon の見え方とは異なるため、最終的な描画結果は Studio 側で確認してください。この MToon の往復変換には、本変更を含む Studio ビルドが必要です。

Blender のカスタムプロパティと glTF extras の仕様: [Blender glTF importer/exporter](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst)

## 検証

```powershell
node --test scripts/commit-existing-model-blends.test.mjs
& $blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/blender-material-roundtrip.test.py
```

実モデルのコピーを変形・保存して再取り込みまで検証する場合は、次のコマンドを実行します。

```powershell
& $blender --background --factory-startup --disable-autoexec --offline-mode --python-exit-code 1 --python scripts/prepare-blender-edit-smoke.py -- $prepared $editSmoke
$env:XRIFT_BLENDER_EDIT_SMOKE = $editSmoke
cargo test --manifest-path src-tauri/Cargo.toml installed_blender_reimports_edited_mtoon_source --lib
pnpm exec playwright test e2e/blender-mtoon-edit.spec.ts
```

`$editSmoke` には新しい検証用ディレクトリを指定します。元の作品は変更せず、コピーの全メッシュ頂点の X 座標を 10% 広げて保存したうえで、インストール済みの Blender による書き出し、Rust の再取り込みコマンド、Studio の素材更新処理を順に確認します。
