# 「保存エラー」断続発生の調査レポート

対象: xrift-studio ビジュアルエディタの autosave / 手動保存
症状: 保存時にときどき「保存エラー」が出て、再試行すると成功する
環境: Windows、プロジェクト保存先は `%APPDATA%\Roaming\<bundle-id>\projects\...`

---

## 結論（先に3行）

1. **原因は Windows のファイルロック（`ERROR_SHARING_VIOLATION 32` / `ERROR_ACCESS_DENIED 5`）** で、`AppData\Roaming` は Microsoft Defender のリアルタイムスキャンが最も積極的に働く領域。書き込み直後のファイルに Defender がハンドルを保持している間に、次の操作が rename / read / remove すると失敗する。
2. **リトライで直るエラーはファイルシステム系しか存在しない**（検証エラーやロック不可は決定論的で、再試行しても必ず同じ結果になる）。よって症状は 100% この系統。
3. **同じ問題をメンテナが一度診断して、3箇所のうち1箇所だけ直している。** 残り2箇所と、rename 2段コミットが無防備なまま残っている。

**根本原因が「リトライ不足」ではなく「1回のミスが即ユーザー可視のエラーになる設計」である点が重要。** リトライを増やすのではなく、transient エラーを Rust 側で構造的に吸収するのが正しい修正。

---

## 決定的な証拠

### 証拠1: メンテナ自身が同じ現象を診断済み（コミット `0a80151`）

```
0a80151 オートセーブの競合と保存処理を改善   (2026-07-24)
 src-tauri/src/lib.rs | 11 ++++--
```

このコミットで `recover_visual_save_transactions` の中の**1箇所だけ**が best-effort 化され、
フロント側に `AUTOSAVE_MAX_ATTEMPTS` / `AUTOSAVE_RETRY_DELAYS_MS` が追加された。
現在のコード（`lib.rs:2217-2222`）にその痕跡が残っている:

```rust
if transaction_root.join("committed").exists() {
    // A committed journal is inert cache. Best-effort cleanup keeps a
    // transient Windows file lock from blocking project reads/saves.
    let _ = std::fs::remove_dir_all(&transaction_root);
    continue;
}
```

**コメントが "transient Windows file lock" と明言している。** 診断は正しい。問題は適用範囲。

### 証拠2: そのすぐ上と下に、同じ失敗モードの hard error が残っている

`recover_visual_save_transactions` は **保存のたびに毎回実行される**（`lib.rs:1866`）。

```rust
// lib.rs:2210-2216  ← 上（未修正）
if !journal_path.exists() {
    std::fs::remove_dir_all(&transaction_root)
        .map_err(|e| format!("orphaned save staging cannot be cleaned up: {}", e))?;   // ★保存全体が失敗
    continue;
}
if transaction_root.join("committed").exists() {
    let _ = std::fs::remove_dir_all(&transaction_root);   // ← 中（修正済み）
    continue;
}
...
// lib.rs:2236-2237  ← 下（未修正）
std::fs::remove_dir_all(&transaction_root)
    .map_err(|e| format!("recovered save journal cannot be cleaned up: {}", e))?;      // ★保存全体が失敗
```

**削除するのは `.cache/` 配下の使い捨てゴミだけ**なのに、消せないと正常な保存を丸ごとエラーにしている。
しかもこの残骸は、前回保存の best-effort 削除（`lib.rs:2179-2182`）が**部分的に**失敗すると生まれる
（Windows の `remove_dir_all` は1ファイルずつ消すので「journal.json は消えたが staged/ が残る」状態になり得る）。
つまり **1回のロックが次回の保存を失敗させる**、という連鎖構造になっている。

### 証拠3: 保存の直前に、前回書いたばかりのファイルを読み直している

```rust
// lib.rs:1874-1876
let existing_manifest_path = project_root.join(VISUAL_PROJECT_MANIFEST);
let existing_manifest_content = std::fs::read_to_string(&existing_manifest_path)
    .map_err(|_| "existing visual project manifest is missing".to_string())?;
```

`xrift-studio.project.json` は前回保存の**最後**に rename で置き換わったファイル
（`lib.rs:1598-1600` の設計コメント: マニフェストを最後にコミットする）。
autosave のデバウンスは **250ms**（`VisualEditorPrototype.tsx:301`）なので、
「Defender が rename 直後のファイルをスキャンしている最中に、次の保存が開こうとする」窓が極めて頻繁に開く。

**さらに悪いのは `map_err(|_| ...)` で OS エラーを完全に捨てていること。**
実際は「共有違反で開けなかった」なのに、ユーザーには「マニフェストが存在しません」と表示される。
os error 番号が一切残らないので、原因調査が不可能になっていた。

### 証拠4: コミットの 2段 rename にリトライが一切ない

```rust
// lib.rs:2148-2156
if entry.original_existed {
    std::fs::rename(&target, &backup)          // ★生きているファイルを動かす
        .map_err(|e| format!("existing visual document cannot be journaled: {}", e))?;
}
if let Some(parent) = target.parent() {
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
}
std::fs::rename(&staged, &target)              // ★数ms前に fsync/close したファイル
    .map_err(|e| format!("staged visual document cannot be committed: {}", e))?;
```

Rust の `std::fs::rename` は Windows では `MoveFileExW`。ソースを DELETE アクセスで開く必要があるため、
AV / インデクサ / エクスプローラのプレビューが `FILE_SHARE_DELETE` なしで掴んでいると共有違反になる。
**この rename は 1 保存あたり「ドキュメント数 × 2 回」実行される**（scene + prefab群 + asset manifest + project manifest）。
被弾機会がファイル数に比例して増える。

### 証拠5: リトライ付きヘルパが同じファイル内に既にあるのに、保存経路で使われていない

```rust
// lib.rs:4777  force_remove_dir_all — 300/600/900ms バックオフ + read-only 属性クリア付き
```

アセットインポート側では使われているが、保存経路からの参照はゼロ。

---

## フロントエンド側の増幅要因

### 増幅1: 編集を続けているとリトライが機能しない

```ts
// autosave-coordinator.ts:35, 45
if (attempt >= maxAttempts || latestValue !== value) throw error;
```

`AUTOSAVE_MAX_ATTEMPTS = 4` / 遅延 `[300, 900, 1800]ms`（計3秒）というリトライ予算があるが、
**リトライ待機中にユーザーが1回でも編集すると `latestValue !== value` になり即座に放棄して throw する。**

結果として、リトライ予算をフルに使えるのは「編集が止まった後の最後のスナップショット」だけ。
これは症状の見え方とぴったり一致する — **作業中は静かに失敗し、手を止めた瞬間に「保存エラー」が出る。**

なお、supersede 単独ではエラーになりません（`save()` が実際に reject して初めて throw に到達し、
受け手の `latestRequested() === savingBundle` ガードも効く）。あくまで「一時障害の吸収力を奪う」増幅器です。

### 増幅2: デバウンス 250ms が短すぎる + terrain ストロークが抑止対象外

```tsx
// VisualEditorPrototype.tsx:1768-1772
autosaveTimerRef.current = window.setTimeout(() => {
  autosaveTimerRef.current = null;
  if (transformScrubRef.current) return;      // ← transform scrub しか見ていない
  void requestAutosave(bundle);
}, AUTOSAVE_DELAY_MS);                        // ← 250
```

地形ブラシは pointermove ごとに新 bundle を作る（`useTerrainAuthoring.ts`）が、
ここのガードは transform scrub しか抑止しない。**ストローク中に full save が連発する。**

（別件のバグ）ガードで `return` したとき**タイマーを再スケジュールしていない**ので、
scrub 中にスキップされた変更は次の bundle 変更まで保存されないまま残る。

### 増幅3: 保存コストが毎回フル

差分保存が一切なく、scene だけ変わっても全ドキュメントを書き直す。加えて:

- `serializeChecked`（`persistence.ts:563-572`）が **serialize した JSON をもう一度 parse して再検証**
- Rust 側 `validate_visual_write_request`（`lib.rs:1475`）が**さらにもう一度** parse + 検証
- `stableSerializeJson`（`serialization.ts:102`）が pretty print するため、地形の `heights: number[]`
  （最大解像度で 66,049 要素）が **1要素1行** になり、terrain 1つで scene JSON が数 MB になる

書き込み時間が長いほどロックに晒される窓も広がるので、これも発生確率を押し上げている。

### 増幅4: サムネイル生成キューが保存と並行して同じツリーに書く

`commit_visual_asset_import`（`lib.rs:4079`）は `VISUAL_ASSET_IMPORT_IO_LOCK` しか取らず、
`VISUAL_PROJECT_IO_LOCK` を取らない。`MaterialThumbnailGenerationQueue` /
`EnvironmentTextureThumbnailGenerationQueue` がバックグラウンドから呼ぶため、autosave と完全並行で走る。

書き込み先パスは分離されているので直接衝突はしないが、同一ツリーへの AV スキャン負荷を上げる。
さらに `onGenerated` が manifest を書き換えて `dirty` にするので、**ユーザーが何もしなくても autosave が連発する。**

---

## ロック競合は原因ではない（除外できたもの）

3つのグローバル Mutex（`lib.rs:32-34`）はすべて `std::sync::Mutex::lock()` で、
**競合時はブロックして待つ**。エラーを返さない。publish 中の autosave も待つだけ。

- `transaction_root/owner`（`lib.rs:2078`）は排他リースではなく「自分が作ったディレクトリか」の目印。
  不一致なら `continue` するだけでエラーにならない（`lib.rs:2199-2208`）。安全な設計。
- compiler staging owner は `save_visual_project` から一切参照されない。
- Mutex poisoning（`visual project I/O lock is unavailable`）は一度起きると**恒久的に**失敗するので、
  「再試行で直る」症状とは合致しない。ただし「アプリ再起動で直った」場合はこちらを疑うこと。

---

## 修正案

### 修正1【最優先・最小】OS エラーを呼び出し元へ返す

```rust
// lib.rs:1875-1876  現状
let existing_manifest_content = std::fs::read_to_string(&existing_manifest_path)
    .map_err(|_| "existing visual project manifest is missing".to_string())?;
```
```rust
// 提案
let existing_manifest_content = retry_transient_io(|| {
    std::fs::read_to_string(&existing_manifest_path)
})
.map_err(|error| match error.kind() {
    std::io::ErrorKind::NotFound => "existing visual project manifest is missing".to_string(),
    _ => format!(
        "existing visual project manifest cannot be read: {} ({})",
        error,
        existing_manifest_path.display()
    ),
})?;
```

これだけで、次に症状が出たとき **os error 番号が表示される**ので仮説の確定ができる。

### 修正2【本命】transient I/O リトライの共有ヘルパを導入する

```rust
/// Windows の AV / インデクサ / 同期クライアントは、書き込み直後のファイルに
/// 短時間ハンドルを保持する。共有違反やアクセス拒否は恒久的な失敗ではないので、
/// 短いバックオフで吸収する。合計待機は最大 545ms。
fn is_transient_io_error(error: &std::io::Error) -> bool {
    #[cfg(windows)]
    {
        const ERROR_ACCESS_DENIED: i32 = 5;
        const ERROR_SHARING_VIOLATION: i32 = 32;
        const ERROR_LOCK_VIOLATION: i32 = 33;
        const ERROR_DIR_NOT_EMPTY: i32 = 145;
        if matches!(
            error.raw_os_error(),
            Some(ERROR_ACCESS_DENIED)
                | Some(ERROR_SHARING_VIOLATION)
                | Some(ERROR_LOCK_VIOLATION)
                | Some(ERROR_DIR_NOT_EMPTY)
        ) {
            return true;
        }
    }
    matches!(
        error.kind(),
        std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::Interrupted
    )
}

const TRANSIENT_IO_BACKOFF_MS: [u64; 5] = [10, 25, 60, 150, 300];

fn retry_transient_io<T>(
    mut operation: impl FnMut() -> std::io::Result<T>,
) -> std::io::Result<T> {
    let mut last = match operation() {
        Ok(value) => return Ok(value),
        Err(error) => error,
    };
    for delay_ms in TRANSIENT_IO_BACKOFF_MS {
        if !is_transient_io_error(&last) {
            return Err(last);
        }
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        match operation() {
            Ok(value) => return Ok(value),
            Err(error) => last = error,
        }
    }
    Err(last)
}
```

適用先: `lib.rs:2149`（target→backup rename）、`lib.rs:2155`（staged→target rename）、
`lib.rs:1995-1999`（`write_file_synced`）、`lib.rs:2276`（rollback の復元 rename）、
`lib.rs:2191-2195`（recover の `read_dir` / `file_type`）。

同じ「remove_file → rename」パターンが `external_store.rs:814`, `external_store.rs:1258`,
`script_trust.rs:691` にもあるため、`pub(crate)` にして共有すること。

### 修正3【本命】recover のクリーンアップを best-effort に統一する

```rust
// lib.rs:2213-2214  現状 → 提案
let _ = force_remove_dir_all(&transaction_root);   // 孤児 staging は捨ててよいゴミ

// lib.rs:2236-2237  現状 → 提案
let _ = force_remove_dir_all(&transaction_root);   // ロールバック済み journal は不活性
```

`lib.rs:2217-2222` で**既に採用済みの方針**を、同じ関数内の残り2箇所に揃えるだけ。
`force_remove_dir_all`（`lib.rs:4777`）は既存のリトライ付きヘルパ。

同様に `commit_visual_asset_import` の後始末（`lib.rs:4175` 付近）も、
**全ファイル publish 済みの後**なので `let _ =` にすべき。成功を失敗に変えている。

### 修正4 ロールバックの delete-pending 対策

```rust
// lib.rs:2270-2276  現状: remove_file してから rename
std::fs::remove_file(&target).map_err(|e| e.to_string())?;
...
std::fs::rename(&backup, &target)
    .map_err(|e| format!("backup cannot be restored: {}", e))?;
```

Windows の `remove_file` は「削除保留」を作るだけで、他プロセスのハンドルが残っている間は
ディレクトリエントリが消えない。その状態で同名へ rename すると `ERROR_ACCESS_DENIED`。
`std::fs::rename` は Windows では `MOVEFILE_REPLACE_EXISTING` 付きなので、
**`remove_file` を省いて置換窓自体をなくす**のが正しい（通常ファイル判定は残す）。

### 修正5 `exists()` の二重評価（データ損失につながりうる別バグ）

```rust
// lib.rs:2094 と lib.rs:2108 で同じ述語を2回評価。間に write_file_synced が挟まる
if target.exists() { ... }                      // L2094
original_existed: target.exists(),              // L2108
```

`Path::exists()` は I/O エラーを `false` に潰す。一瞬でも `ERROR_ACCESS_DENIED` が返ると
`original_existed = false` が記録され、コミットで **backup を取らずに上書き**し、
以降のロールバックでは「新規作成ファイル」とみなして `remove_file` してしまう。
ファイルの存在判定を `symlink_metadata` の結果に統一して、`NotFound` 以外は明示的にエラーにすべき。

### 修正6 supersede をエラーではなく「委譲」として型で表す

```ts
// autosave-coordinator.ts  現状
} catch (error) {
  if (attempt >= maxAttempts || latestValue !== value) throw error;
```
```ts
// 提案
export const AUTOSAVE_SUPERSEDED = Symbol("autosave-superseded");
...
} catch (error) {
  // 新しいスナップショットが待機しているなら、この save は失敗ではなく不要になっただけ。
  if (latestValue !== value) return AUTOSAVE_SUPERSEDED;
  if (attempt >= maxAttempts) throw error;
```

これで `VisualEditorPrototype.tsx:1461` の
`latestRequested() === savingBundle` というタイミング依存のガードが不要になる。
`autosave-coordinator.fixture.ts:80-88` の3つの assert を書き換える必要がある（他4つの性質は維持）。

### 修正7 発火頻度を下げる

- `AUTOSAVE_DELAY_MS` を 250 → 800〜1000ms（1回の保存に数百ms かかるプロジェクトでは 250ms は短すぎる）
- `VisualEditorPrototype.tsx:1770` のガードに terrain ストロークを追加し、**抑止時は再スケジュールする**

### 修正8 変更のないドキュメントを書かない

`save_visual_documents_transaction_with_owner`（`lib.rs:2086-2111`）の prepare ループで、
既存ファイルと内容が同一なら staged 書き込みも rename もスキップする。
典型的な autosave の書き込み対象が 1〜2 ファイルに落ち、**ロックに晒される窓そのものが消える。**
（マニフェストを最後にコミットする順序の不変条件は保たれる。）

---

## テストが1本もない

`save_visual_documents_transaction_with_owner` / `recover_visual_save_transactions` /
`rollback_visual_save_transaction` / `validate_journal_file_name` を直接叩く Rust テストは**ゼロ**。
journal の phase 遷移、committed マーカ、孤児 staging の回収、ロールバックによる復元、
`original_existed=false` 時の削除 — いずれも未カバー。

最低限追加すべきもの:
1. 正常系（コミット順序と `.cache` が空になること）
2. コミット途中失敗時に全 target が元に戻ること
3. recover が (a) journal 無し staging を回収 (b) committed を削除 (c) prepared を rollback
   (d) **未知 owner を触らない** ことの確認
4. `original_existed = false` の entry の rollback が target を削除すること（修正5の回帰防止）
5. `retry_transient_io` の単体テスト（transient は再試行、`NotFound` は即返す）

---

## 推奨する適用順序

1. **修正1**（OS エラーを出す）— 1箇所、これで次回発生時に仮説が確定する
2. **修正3**（recover の best-effort 統一）— 2箇所、既存方針に揃えるだけでリスクほぼゼロ
3. **修正2**（`retry_transient_io` 導入と適用）— 本命
4. **修正7**（デバウンス調整）— 1行 + ガード修正
5. **修正4 / 修正5**（Windows 固有の正しさ）— テスト追加とセットで
6. **修正6**（supersede の型分離）— fixture 更新とセット
7. **修正8**（no-op スキップ）— 効果は大きいが挙動確認が要るので最後

1〜3 だけで症状はほぼ消えるはず。4 以降は再発防止と、見つかった別バグの修正。

---

## 追記（2026-08-09）: 調査対象外だった Asset Import 経路が主因だった

修正1〜3・5・8 は `0a80151` → `60e83d5` で `save_visual_documents_transaction_with_owner` /
`recover_visual_save_transactions` に適用済みになっていた（修正4・6・7 も同コミットで適用済み）。
しかし **この調査は Model / Texture / Shader などの Asset Import を実際にディスクへ確定する
`commit_visual_asset_import`（`lib.rs:4157`）を対象に含めていなかった。** ここは以下の理由で
むしろ最も被弾しやすい経路だった。

- `staged → target` の `std::fs::rename`（`lib.rs:4248` 付近）に `retry_transient_io` が一切なく、
  1回でも共有違反に当たると Import 全体が即失敗していた。
- Model は埋め込みテクスチャ等で 1 Import あたり最大 512 ファイルを書く（`writes.len() > 512` で拒否、
  最大 320MB）。ファイル数が多いほど、この無防備な rename に被弾する機会が線形に増える。
  「Texture 1枚の Import では起きないが Model の Import で起きる」という報告と整合する。
- 既存ファイルとの重複排除に使う `std::fs::symlink_metadata` / `std::fs::read`
  （`lib.rs:4212-4223` 付近）にもリトライがなく、`if let Ok(metadata) = ...` で
  「メタデータ取得に失敗＝ファイルが存在しない」と誤判定していた
  （NotFound 以外のエラーも黙って「存在しない」扱いにしてしまう、修正5と同種の問題）。
- 同名で前回の Import が残した stale なトランザクションディレクトリの削除
  （`lib.rs:4185` 付近）も、リトライ無しの `remove_dir_all` で Import 全体を失敗させていた。

### 適用した修正

`save_visual_documents_transaction_with_owner` で確立済みのパターンをそのまま横展開した。

1. stale トランザクションディレクトリの削除に `force_remove_dir_all` を使用（`?` で伝播はするが、
   まずリトライしてから失敗するようになった）。
2. 重複排除チェックの判定を `symlink_metadata` の結果に統一する形に書き換え、
   `retry_transient_io` でラップ。`NotFound` 以外のエラーはリトライ後も残れば
   実際の OS エラー文言を含めて返す（修正1と同じくエラーを無視しない）。
3. `staged → target` の `rename` を `retry_transient_io` でラップ。

`commit_visual_asset_import` を使う全ての Import 系（Model 再取り込み含む、Texture、Shader、
Skybox、Unity パッケージ変換、Material/Environment サムネイル生成キュー）が同時に恩恵を受ける。

### 追記2（2026-08-09）: Poly Haven / ambientCG の External Asset Install も同じ穴があった

実際に Poly Haven から Model をダウンロードして「保存エラー」に遭遇し、Scene の未保存編集
（崖・Spawn Point）が失われる実害が発生した。原因は `commit_visual_asset_import` とは別の、
外部アセットダウンロードの確定処理 `external_store.rs` にあった。この投稿の 修正2 で名指しされて
いた `external_store.rs:814` / `external_store.rs:1258`（証拠4・修正2 参照）が未着手のまま
残っていたのが原因そのもの。

- `commit_staged_downloads`（ambientCG 用）と、`install_external_store_asset` 内にほぼ同一の
  コードが複製されている Poly Haven 用のコミットループの、両方に同じ無防備な
  `std::fs::rename(&temporary, &target)` があった。Poly Haven の Model install はこの経路を
  直接使う（`commit_visual_asset_import` は経由しない）。
- 衝突検出の `std::fs::symlink_metadata` / `file_sha256` 内の `std::fs::read` にもリトライがなかった。
- `make_model_self_contained` / `embed_model_uri` が、ダウンロード直後の一時ファイル（glTF 本体・
  依存テクスチャ）を `std::fs::read` で読み直す箇所にもリトライがなかった。ダウンロード直後は
  ファイルサイズが大きいほど AV スキャンに晒される時間も長く、Model は複数の依存ファイルを
  連続で読むため被弾機会も多い。

`lib.rs` の `retry_transient_io` は private だが、`external_store` は crate root の子 module
なので `super::retry_transient_io` で追加の公開範囲変更なしに再利用できた。上と同じパターンを
`file_sha256`、`commit_staged_downloads`、`install_external_store_asset` 内のコミットループ、
`make_model_self_contained`、`embed_model_uri` に適用済み。

**残課題:** `script_trust.rs:691`（Script 承認ストアの `rename`）は同じパターンだが未修正のまま。
書き込み頻度が低く（ユーザーがScript実行を承認/失効した時のみ）、今回の報告とは無関係のため
優先度を下げて見送った。
