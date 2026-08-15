# ブラウザからのワールド公開

Web 版エディターから XRift へ直接アップロードする仕組み。デスクトップ版とは別経路で、Tauri もシェル実行も公式 CLI も使わない。

- 分岐: `src/lib/visual-editor/upload.ts`
- Web 実装: `src/lib/visual-editor/web-upload.ts`
- ランタイムシェル: `public/xrift-runtime-shell/`

## 仕組み

ブラウザでは `npm run build` を実行できないため、ワールドごとのビルドを無くしてある。

音楽プレイヤーと曲の関係に近い。

| | 中身 | ビルド |
| --- | --- | --- |
| ランタイムシェル | どのワールドでも同一 | 一度だけ |
| `xrift/runtime.json` | ワールドごと | 不要（ただのJSON） |
| 素材 (glb, png, mp3) | ワールドごと | 不要 |

シェルは公式テンプレートから作った中身が空のワールドで、`World` は `<XriftWorld manifest=... />` を描画するだけである。シーンはすべて `runtime.json` 側にあるので、JSON と素材を差し替えれば同じシェルでどのワールドでも動く。

アップロードは `@xrift/sdk` の `client.worlds.upload()` を使う。fetch ベースでブラウザでもそのまま動く。

### シェルの再生成

`@xrift/world-components` やランタイムを更新したときだけ実行する。

```bash
node scripts/build-world-runtime-shell.mjs --out public/xrift-runtime-shell
```

## 未解決: CORS 許可リスト

**現状、ブラウザからのアップロードは最後の送信で止まる。** 組み立てまでは成功し、`POST /api/public/v1/worlds` がブラウザに遮断される。

`api.xrift.net` は `Access-Control-Allow-Origin` を自身のオリジンにしか返さない。実測（2026-08-15）:

| Origin | preflight | `Access-Control-Allow-Origin` |
| --- | --- | --- |
| `https://app.xrift.net` | 204 | `https://app.xrift.net` |
| `https://xrift.net` | 204 | `https://xrift.net` |
| `https://webxr-jp.github.io` | 204 | なし |
| `http://localhost:1420` | 204 | なし |

これはサーバー側の許可リストなので、フロントエンドのコードでは回避できない。

### XRift へ依頼する内容

`api.xrift.net` の CORS 許可オリジンに次を追加してもらう。

```
https://webxr-jp.github.io
```

ローカル開発も通したい場合は `http://localhost:1420` も追加する。

現在返っているヘッダーはそのままでよい。追加の変更は不要である。

```
Access-Control-Allow-Methods: GET,HEAD,PUT,POST,DELETE,PATCH
Access-Control-Allow-Headers: Content-Type,Authorization,X-CSRF-Token
Access-Control-Allow-Credentials: true
```

許可されたかどうかは、ブラウザの devtools ではなく次で確認できる（`ACAO` が返れば通っている）。

```bash
curl -sI -X OPTIONS "https://api.xrift.net/api/public/v1/worlds" -H "Origin: https://webxr-jp.github.io" -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
```

許可リストが使えない場合は中継サーバーを立てる方法もあるが、トークンが中継を経由するため、可能なら許可リストのほうがよい。

## トークン

利用者がアップロードのたびに入力する。保存しない。

- CLI トークン `xrf_`（`xrift login` で取得）
- API キー `xrift_sk_`（設定ページで発行。**`write:worlds` スコープが必要**）

Studio 側でトークンの形式やスコープを判定しない。どの接頭辞が存在するか、どのスコープを持つかは XRift 側が決めることで、文字列からは分からないためである。過去に二度この判定で、公開できる資格情報を誤って弾いた。判定はサーバーに任せ、401 / 403 をそのまま伝える。

## 現在の制約

| | Web | デスクトップ |
| --- | --- | --- |
| 組み込みプリミティブ・マテリアル | 可 | 可 |
| 取り込んだ3Dモデル・テクスチャ・音 | **不可** | 可 |
| Script | **不可** | 可 |
| アイテム | **不可** | 可 |

**素材を含むワールドが公開できない理由**は、素材バイトの読み取り口が `tauri.readProjectFileDataUrl` しかなく、ブラウザに保存先が無いためである。取り込み自体も `projectPath` を要求する。解決するにはブラウザ側の素材ストア（IndexedDB など）を用意し、読み取りを Tauri 経由 / ブラウザ経由で分岐させる必要がある。`readProjectFileDataUrl` の呼び出し箇所すべてが対象になる。

**Script が使えない理由**は、`runtime.json` が実行コードを表現できないためである。コンパイラが `script-unsupported-runtime-output` で明示的に止める。

## 検証状況

確認済み:

- 公式テンプレートからのシェルビルドが通ること
- 実ブラウザでのシェル取得（24ファイル 5.94 MB / 787ms）
- 実ブラウザでの組み立て（`runtime.json` に実シーン、3Dモデルは `model/gltf-binary`、サムネイルは `image/png`）
- エディターからの導線とトークン入力、進捗表示、失敗時の切り分け
- `pnpm typecheck` / `pnpm cli:test`

未確認:

- **アップロードの成功系全体。** CORS が解けた時点が初回になる。
- 署名付き URL のホスト。実 URL をまだ見ていない。

表示されない場合は、devtools の Network で `xrift/runtime.json` がどの URL へ飛んでいるかを見ると原因が分かる。シェルは `import.meta.url` 基準で解決するため、ワールド自身の保存先を指しているのが正しい。
