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
