# 使い方ガイドの管理

原稿は `docs/guide/*.md`、目次・検索語・関連記事は `docs/guide/manifest.json` で管理します。公開先は `/guide/` です。

## 更新方法

実際の画面に合わせて、操作と結果を短く説明します。記事の先頭見出しとmanifestのタイトルを揃え、新しい記事はmanifestへ登録します。記事間のリンクは `./materials.md#作って割り当てる` の形式で書きます。

Entity / Hierarchy / Inspector / Assets / Componentsやマテリアル名は画面の表記に揃えます。開発手順は `DEVELOPMENT.md` と分野別の開発文書で管理します。

## 表示と公開

`pnpm run build:preview` は紹介ページと `preview-dist/guide/` の静的HTML、検索索引、404ページを生成します。ガイド専用の検査は公開条件に含めません。

ガイドだけを生成するときは `pnpm run build:guide`、開発中の確認には `pnpm run preview:guide` を使います。開発サーバーの `/guide/` から開けます。

アプリ内のヘルプは同じ原稿を使います。`GuideLink` で記事を指定し、公開フォームなどのモーダルからは `GuideExternalLink` で開きます。

## 変更の確認

必要に応じて `pnpm run test:guide` で記事のリンクを確認し、`pnpm run e2e:test -- e2e/guide.spec.ts` で表示や検索を確認できます。変更した記事はブラウザでも読み、リンク先と画面の説明が合っているか確認してください。

## 画像の撮影

記事の画像は `docs/guide/media/` に置き、本文から `![何が写っているか](./media/<slug>.png)` の形式で参照します。画像の直後には、どこを見るかを一文のキャプション（`*...*`）で添えます。必要な撮影の一覧は `scripts/guide/capture-plan.json` で管理します。

撮影には Tauri MCP のデバッグ機能（`webview_screenshot`）を使い、現在のデスクトップ版の画面を写します。OS のファイル選択ダイアログなどネイティブ UI は写らないため、撮影対象に含めません。個人情報やトークンが映らないサンプルプロジェクトで撮影します。

```bash
pnpm tauri:dev
node scripts/guide/capture-guide.mjs list     # 必要な画像と不足の一覧
node scripts/guide/capture-guide.mjs capture  # 計画の手順どおり画面を用意して順に撮影
node scripts/guide/capture-guide.mjs capture --shot first-world.png  # 1枚だけ撮り直す
pnpm run test:guide   # 画像の参照切れを確認
pnpm run build:guide  # 公開用の HTML を生成
```

`capture` は各ショットの用意ができてから Enter で撮影します。`--yes` を付けると確認なしで連続撮影します。撮影時はアプリのウィンドウを 1440x900 にし、画像は幅 1280px 以下で保存します。画像を差し替えた記事は、本文の操作名とキャプションが今の画面と合っているか読み直します。

撮影中は `docs/guide/` へ書き込みません。開発サーバーが変更を検知して再読み込みすると、開いていたプロジェクトが一覧へ戻ります。撮影した画像は一時場所に置き、確認が終わってから `media/` へまとめて配置します。セットアップ画面は初回起動時にしか表示されないため、撮影対象に含めません。OS 側の画面が中心の記事（インストールで困ったときなど）には画像を付けず、その理由を `capture-plan.json` の `omitted` に残します。
