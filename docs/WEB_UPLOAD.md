# ブラウザ公開の試験実装

ブラウザからの直接公開は試験段階で、配布版の公開手順ではない。通常の公開は [利用者向けガイド](./wiki/publishing.md) に従う。成功系の受け入れが完了するまで、デスクトップ版と同等の対応とは表示しない。

## 実装の場所

- 経路の分岐: `src/lib/visual-editor/upload.ts`
- ブラウザ実装: `src/lib/visual-editor/web-upload.ts`
- ランタイムシェル: `public/xrift-runtime-shell/`

ブラウザはワールドごとのビルドを行わず、事前にビルドしたシェル、`xrift/runtime.json`、素材を組み合わせる。シェルは `XriftWorld` で manifest を描画し、送信には `@xrift/sdk` の `client.worlds.upload()` を使う。Tauri や公式 CLI は実行しない。

ランタイムや `@xrift/world-components` の変更時にシェルを再生成する。本番ビルドの実行条件は `AGENT.md` に従う。

`node scripts/build-world-runtime-shell.mjs --out public/xrift-runtime-shell`

## 制約と未確認事項

| 項目 | 確認内容 |
| --- | --- |
| CORS | 2026-08-15 の調査では GitHub Pages と localhost に `Access-Control-Allow-Origin` が返らず、送信結果をブラウザから読めなかった。着手時に許可オリジンを再確認する。フロントエンドだけでは回避できない。 |
| 素材 | 読み取りが Tauri と projectPath に依存する。ブラウザ向けの素材保存先と読み取り経路が必要。 |
| Script | Runtime JSON は実行コードを表せない。compiler は `script-unsupported-runtime-output` で拒否する。 |
| Item | この経路の対象外。 |
| シェルの再利用 | Module Federation の remote 名を複数ワールドで共用できるか、公開先での確認が必要。 |
| 公開結果 | 送信から公開後の再生までの成功系、署名付き URL のホスト、公開 URL の形式は未確認。URL を推測せず、SDK が返す ID と結果を表示する。 |

シェルの生成・取得、JSON とファイルの組み立て、進捗・失敗表示までは過去に確認している。これをアップロード成功の根拠にはしない。

## 認証

資格情報はアップロード時だけ受け取り、保存しない。トークンの接頭辞だけで有効性やスコープを判定せず、サーバーの 401 / 403 をそのまま伝える。ブラウザへ長期トークンを配布する構成にはしない。

## 再開時の判断

CORS の対応可否と素材の保存方法を先に確認する。直接送信が成立しなければ、ファイル一式の書き出しと別手段によるアップロードを検討する。認証情報を扱う中継サーバーは採用済みの構成ではない。追加する場合は、認証と運用の設計を別途行う。

表示の調査では Network で `xrift/runtime.json` の取得先を確認する。シェルは `import.meta.url` を基準に、ワールド自身の保存先から manifest を読む。
