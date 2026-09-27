# ブラウザからのワールド公開

ブラウザ版βはワールドを XRift へ直接送信する経路を持つ。パソコン・iPad・スマートフォンで同じ公開操作を試せる。利用手順は [利用者向けガイド](./guide/publishing.md) に記す。実送信と XRift 上でのシーン描画は確認済みで、Collider 修正後の衝突動作は再送して確認する。

## 実装の場所

- 経路の分岐: `src/lib/visual-editor/upload.ts`
- ブラウザ実装: `src/lib/visual-editor/web-upload.ts`
- 公開画面: `src/preview/WebUploadDialog.tsx`
- ブラウザのプロジェクトと素材: `src/lib/browser-project-storage.ts`
- ランタイムシェル: `public/xrift-runtime-shell/`

ブラウザはワールドごとのビルドを行わず、事前にビルドしたシェル、`xrift-runtime.json`、素材を組み合わせる。シェルは `XriftWorld` で manifest を描画し、送信には `@xrift/sdk` の `client.worlds.upload()` を使う。Tauri や公式 CLI は実行しない。アイテムとスクリプトを含むワールドはこの経路の対象外。

ランタイムや `@xrift/world-components` の変更時にシェルを再生成する。本番ビルドの実行条件は `AGENT.md` に従う。

`node scripts/build-world-runtime-shell.mjs --out public/xrift-runtime-shell`

## 制約と未確認事項

| 項目 | 確認内容 |
| --- | --- |
| CORS | [Issue #12](https://github.com/WebXR-JP/xrift-studio/issues/12) への開発元対応後、2026-09-24 に localhost のブラウザから SDK の署名付き URL を含む送信を完了した。GitHub Pages オリジンからの API への OPTIONS も通る。GitHub Pages 上での実送信は別途確認する。 |
| 素材 | ブラウザの素材は IndexedDB に保存する。公開時に `readBrowserFile` で必要なファイルを読み、送信したファイルが XRift 上でも読み込めるか確認する。 |
| スクリプト | Runtime JSON は実行コードを表せない。compiler は `script-unsupported-runtime-output` で拒否する。 |
| アイテム | ワールド用のランタイムシェルだけを同梱しているため、この経路の対象外。 |
| シェルの再利用 | Module Federation の remote 名を複数ワールドで共用できるか、公開先での確認が必要。シェルが読む `xrift-runtime.json` はアップロード先のワールド直下に置く。 |
| 公開結果 | SDK の `upload()` は送信結果の ID を返すが、後続の審査状態を返さない。送信完了を再生可能と表示しない。2026-09-24 の実機試験では、権限宣言、Federation の直接参照ファイル、Vite が返した HTML の混入を順に修正した。v8 は XRift 側で審査通過・使用中となり、`xrift-runtime.json`、モデル、テクスチャ、DRACO/KTX2 の応答とシーン描画を確認した。次の Collider 修正は別途再送と衝突確認が必要。URL を推測せず、結果不明の送信は即時に繰り返さない。 |

シェルの生成・取得、JSON とファイルの組み立て、進捗・失敗表示、API へのファイル送信、XRift 側でのシーン描画を確認した。シェルのファイルは送信前に HTML 応答を拒否し、manifest の SHA-256 バージョンと照合する。

## 認証

XRift の[設定画面](https://app.xrift.net/settings)で `write:worlds` 権限付きの API キーを発行し、公開画面で入力する。XRift Studio はキーをプロジェクト、IndexedDB、`localStorage`、ログへ保存しない。対応ブラウザでは、送信完了画面で利用者が「APIキーをブラウザに保存」を押したときにパスワード管理機能へ保存を依頼する。保存 API の完了だけでは利用者が保存を承諾したか分からないため、ブラウザのキー選択で読み戻せた場合だけ保存済みと表示する。読み戻せなければ再試行を残す。ブラウザは初回から無操作で資格情報を渡すとは限らないため、次回の公開時は「保存済みキーを選ぶ」からも読み込める。保存はサイトのオリジン単位で、端末間同期はブラウザの設定に従う。キーは公開画面を開いている間だけメモリーに保持し、閉じると消す。ブラウザの資格情報 API に非対応の場合は、手入力またはブラウザの通常の自動入力を使う。トークンの接頭辞だけで有効性やスコープを判定せず、サーバーの 401 / 403 を伝える。

[Public API v1 の資料](https://docs.xrift.net/public-api/v1)は API キーの認証方法を説明しているが、現時点のスコープ表には読み取り権限だけが載っている。ここでの公開は Public API v1 の `GET /worlds` ではなく、`@xrift/sdk` の `client.worlds.upload()` を使う。資料の表だけから公開権限の有無を判断しない。

## 再開時の判断

CORS と素材の読み取り経路を確認したうえで、実際の API キーを使う試験は既存作品と分離したワールドで行う。直接送信が成立しなければ、プロジェクトを書き出してデスクトップ版から公開する。認証情報を扱う中継サーバーは採用済みの構成ではない。追加する場合は、認証と運用の設計を別途行う。

表示の調査では Network で `xrift-runtime.json` の取得先を確認する。シェルは `import.meta.url` を基準に、ワールド自身の保存先から manifest を読む。
