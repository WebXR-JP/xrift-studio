# Homebrew での配布

XRift Studio の macOS Universal 版を、このリポジトリの Cask から配布しています。Apple Silicon と Intel の両方に対応しています。初回起動時は [セットアップ](./guide/installation.md#2-セットアップする) を完了してください。

## Homebrew

### インストールする

```bash
brew tap webxr-jp/xrift-studio https://github.com/WebXR-JP/xrift-studio.git
brew install --cask webxr-jp/xrift-studio/xrift-studio
open -a "XRift Studio"
```

初回はリポジトリの URL も指定します。配布されるバージョンは [Cask 定義](../Casks/xrift-studio.rb) に記載されたものです。新しいリリースを公開したあと、その定義を更新してマージすると Homebrew にも反映されます（[Homebrew の tap 仕様](https://docs.brew.sh/Taps)）。

開発元の確認で起動が止まった場合は、[macOS で開けないとき](./guide/installation-problems.md#macosで開けない) を参照してください。Homebrew からのインストールは、Apple の署名や公証の代わりにはなりません。

### 更新する

アプリを終了してから実行します。

```bash
brew update
brew upgrade --cask --greedy webxr-jp/xrift-studio/xrift-studio
```

アプリ内更新にも対応するため、Cask には `auto_updates true` を指定しています。Homebrew で更新するときは `--greedy` を付けてください（[更新コマンド](https://docs.brew.sh/Manpage#upgrade-options-formulacask-)）。

### アンインストールする

```bash
brew uninstall --cask webxr-jp/xrift-studio/xrift-studio
```

作品やアプリの保存データを削除する処理は含めていません。保存場所は [データの保存とリセット](./guide/recovery.md) で確認できます。

## 配布定義を更新する

### 手動で生成する

Node.js 22 以上で、リポジトリのルートから実行します。

```bash
node scripts/update-package-managers.mjs
node scripts/update-package-managers.mjs --check
node --test scripts/update-package-managers.test.mjs
```

GitHub の `releases/latest` から公開済みの安定版を取得し、`Casks/xrift-studio.rb` と `packaging/release.json` を更新します。macOS 用の DMG が 1 つだけ存在してアップロードが完了していること、および URL と SHA-256 の形式が正しいことを検証します。下書き、プレリリース、旧版への巻き戻り、同じバージョンでのファイル差し替えは拒否します。

`--check` は保存済みのリリース情報と生成物の一致をオフラインで確認します。生成後は 2 ファイルを更新 PR に含め、macOS の CI が成功してからマージしてください。

### リリース後の自動更新

**Update Homebrew** ワークフローは、安定版の公開時と手動実行の両方に対応しています。**Release** ワークフローから公開する場合は、全 OS のビルドと `finalize-release` による公開が完了したあとに直接呼び出されます。下書きを手動で公開した場合も対象です。

生成・検証した定義は GitHub Actions のアーティファクトに保存され、`automation/package-managers` ブランチから更新 PR が作成されます。Homebrew に反映されるのはこの PR をマージしたあとです。リリースを公開しただけでは Cask のバージョンは変わりません。

自動 PR 作成を使うには、**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** を有効にしてください。このワークフローには PR を承認・マージする処理はなく、追加のシークレットも不要です（[GitHub の設定](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests)）。

設定が無効な場合、生成物は Actions 実行結果の **Artifacts** に残ります。ZIP を取得して手動の更新 PR に反映するか、設定を有効にしたうえで **Update Homebrew → Run workflow** から再実行してください。

### Homebrew 本家との違い

この配布方法はプロジェクト独自の tap であり、Homebrew 本家の `homebrew/cask` への登録とは異なります。本家へ提出する場合は、Gatekeeper の検証、署名・公証、採用基準を別途確認する必要があります。Tauri の自動更新用署名は Apple の署名・公証とは別物です（[Homebrew の採用基準](https://docs.brew.sh/Acceptable-Casks)）。

## 検証の範囲

PR の macOS CI では、Cask の書式、DMG の取得と SHA-256、インストール、アプリの配置、アンインストールを確認します。GUI 起動、Gatekeeper、既存版からの更新は別途確認が必要です。
