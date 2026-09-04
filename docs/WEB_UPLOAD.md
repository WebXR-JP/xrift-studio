# ブラウザからのワールド公開

Web 版エディターから XRift へ直接アップロードする仕組みを示す。デスクトップ版とは別経路である。Tauri もシェル実行も公式 CLI も使わない。

- 分岐: `src/lib/visual-editor/upload.ts`
- Web 実装: `src/lib/visual-editor/web-upload.ts`
- ランタイムシェル: `public/xrift-runtime-shell/`

## 仕組み

ブラウザでは `npm run build` を実行できない。このため、ワールドごとのビルドをなくしている。

再生する側とワールドごとの内容を分けている。

| | 中身 | ビルド |
| --- | --- | --- |
| ランタイムシェル | どのワールドでも同一 | 一度だけ |
| `xrift/runtime.json` | ワールドごと | 不要（ただのJSON） |
| 素材 (glb, png, mp3) | ワールドごと | 不要 |

シェルは公式テンプレートから作った中身が空のワールドである。`World` は `<XriftWorld manifest=... />` を描画するだけである。シーンはすべて `runtime.json` 側にある。このため、JSON と素材を差し替えれば同じシェルを再利用できる設計である。

ただし、これはまだ設計上の想定であって実証はしていない。シェルは Module Federation の remote である。`vite.config.ts` の `name`（`xrift_shellworld`）がビルド時に埋め込まれる。XRift のプレイヤーが remote を URL と `./World` だけで読み込むなら、ワールドごとに同じ名前でも問題ない。名前を識別に使っている場合は影響し得る。初回のアップロードで確認が必要な項目である。

アップロードは `@xrift/sdk` の `client.worlds.upload()` を使う。fetch ベースであるためブラウザでもそのまま動く。

### シェルの再生成

`@xrift/world-components` やランタイムを更新したときだけ実行する。

```bash
node scripts/build-world-runtime-shell.mjs --out public/xrift-runtime-shell
```

## 未解決: 最後の送信が CORS で止まる

**組み立てまでは成功する。`POST /api/public/v1/worlds` のレスポンスをブラウザが読めない。**残っているのはこの一点だけである。

`api.xrift.net` は `Access-Control-Allow-Origin` を自身のオリジンにしか返さない。実測（2026-08-15）:

| Origin | preflight | `Access-Control-Allow-Origin` |
| --- | --- | --- |
| `https://app.xrift.net` | 204 | `https://app.xrift.net` |
| `https://xrift.net` | 204 | `https://xrift.net` |
| `https://webxr-jp.github.io` | 204 | なし |
| `http://localhost:1420` | 204 | なし |

preflight は 204 を返す。`Access-Control-Allow-Methods` と `Access-Control-Allow-Headers` も必要なものが揃っている。`Access-Control-Allow-Origin` だけが返らない。サーバー側の許可リストであるため、フロントエンドのコードでは回避できない。

### 案A: ZIP 書き出し + 別手段でアップロード

ブラウザ側は既に完全なファイル一式を組み立てられる状態である（実測 26ファイル 5.95 MB）。送信せずに ZIP としてダウンロードできるようにする。利用者は展開して `xrift upload world` を実行する。別途アップローダーへ渡す方法もある。

- ネットワークを使わないため CORS の影響を受けない
- 他者の対応を待たず、このリポジトリだけで完結する
- 手順が 2 段階になる

### 案B: CORS 許可オリジンの追加を依頼

`https://webxr-jp.github.io`（必要なら `http://localhost:1420` も）を許可リストへ追加してもらう。既存ヘッダーの変更は不要である。追加はオリジンのみである。

- 実装済みのコードがそのまま動く。追加実装は要らない
- 相手の対応待ちになる

追加されたかどうかは次で確認できる。`access-control-allow-origin` が返れば通っている。

```bash
curl -sI -X OPTIONS "https://api.xrift.net/api/public/v1/worlds" -H "Origin: https://webxr-jp.github.io" -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
```

### 案C: 中継サーバー

Cloudflare Worker などを立てて経由させる。どのオリジンからでも動く。ただし、トークンが中継を経由するため運用の責任が増える。一度実装したが方針変更で削除済みである。

### 進め方

案Aはこのリポジトリだけで完結する。このため、まず案Aを入れると Web 版が単体で使えるようになる。並行して案Bを依頼する。許可されれば案Aは残したまま、直接送信も選べるようにする。

## トークン

利用者がアップロードのたびに入力する。保存しない。

- CLI トークン `xrf_`（`xrift login` で取得）
- API キー `xrift_sk_`（設定ページで発行。**`write:worlds` スコープが必要**）

Studio 側でトークンの形式やスコープを判定しない。どの接頭辞が存在するか、どのスコープを持つかは XRift 側が決める。このため、文字列だけでは分からない。過去に二度この判定で、公開できる資格情報を誤って拒否した。判定はサーバーに任せる。401 / 403 はそのまま伝える。

## 現在の制約

| | Web | デスクトップ |
| --- | --- | --- |
| 組み込みプリミティブ・マテリアル | 可 | 可 |
| 取り込んだ3Dモデル・テクスチャ・音 | **不可** | 可 |
| Script | **不可** | 可 |
| アイテム | **不可** | 可 |

**素材を含むワールドが公開できない理由**は、素材バイトの読み取り経路が `tauri.readProjectFileDataUrl` しかなく、ブラウザに保存先が無いためである。取り込み自体も `projectPath` を要求する。解決するにはブラウザ側の素材ストア（IndexedDB など）を用意する必要がある。読み取りを Tauri 経由 / ブラウザ経由で分岐させる必要もある。`readProjectFileDataUrl` の呼び出し箇所すべてが対象になる。

**Script が使えない理由**は、`runtime.json` が実行コードを表現できないためである。コンパイラが `script-unsupported-runtime-output` で明示的に止める。

## 検証状況

確認済み:

- 公式テンプレートからのシェルビルドが通ること
- 実ブラウザでのシェル取得（24ファイル 5.94 MB / 787ms）
- 実ブラウザでの組み立て（`runtime.json` に実シーン、3Dモデルは `model/gltf-binary`、サムネイルは `image/png`）
- エディターからの導線とトークン入力、進捗表示、失敗時の切り分け
- `pnpm typecheck` / `pnpm cli:test`

未確認:

- **アップロードの成功系全体。**上記のいずれかの案が入った時点が初回になる。
- 署名付き URL のホスト。実 URL をまだ見ていない。
- **同じシェルを複数ワールドで使い回せるか。**
- **公開後のワールドの URL 形式。**SDK の完了レスポンスに URL が含まれない。`app.xrift.net` はどのパスでも 200 を返す SPA である。このため、外部からは確認できなかった。現在の画面はワールド ID を表示する。リンク先はアプリのルートにしてある。形式が分かれば直接開けるようにできる。

表示されない場合は、devtools の Network で `xrift/runtime.json` がどの URL へ飛んでいるかを見ると原因が分かる。シェルは `import.meta.url` 基準で解決する。このため、ワールド自身の保存先を指しているのが正しい。
