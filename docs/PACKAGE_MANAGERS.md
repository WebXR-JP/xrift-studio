# Homebrewでの配布

XRift StudioのmacOS Universal版を、このリポジトリのCaskから配布します。Apple SiliconとIntelに対応します。初回起動時は[セットアップ](./guide/installation.md#2-セットアップする)を完了してください。

## Homebrew

### インストールする

```bash
brew tap webxr-jp/xrift-studio https://github.com/WebXR-JP/xrift-studio.git
brew install --cask webxr-jp/xrift-studio/xrift-studio
open -a "XRift Studio"
```

初回はリポジトリのURLも指定します。配布版は[Cask定義](../Casks/xrift-studio.rb)のバージョンです。新しいリリースを公開した後、その定義を更新してマージするとHomebrewにも反映されます。[Homebrewのtap仕様](https://docs.brew.sh/Taps)

開発元の確認で起動が止まった場合は、[macOSで開けないとき](./guide/installation-problems.md#macosで開けない)を参照してください。Homebrewでのインストールは、Appleの署名や公証の代わりにはなりません。

### 更新する

アプリを終了してから実行します。

```bash
brew update
brew upgrade --cask --greedy webxr-jp/xrift-studio/xrift-studio
```

アプリ内更新にも対応するため、Caskには`auto_updates true`を指定しています。Homebrewで更新するときは`--greedy`を付けます。[更新コマンド](https://docs.brew.sh/Manpage#upgrade-options-formulacask-)

### アンインストールする

```bash
brew uninstall --cask webxr-jp/xrift-studio/xrift-studio
```

作品やアプリの保存データを消す処理は含めていません。保存場所は[データの保存とリセット](./guide/recovery.md)で確認できます。

## 配布定義を更新する

### 手動で生成する

Node.js 22以上で、リポジトリのルートから実行します。

```bash
node scripts/update-package-managers.mjs
node scripts/update-package-managers.mjs --check
node --test scripts/update-package-managers.test.mjs
```

GitHubの`releases/latest`から公開済みの安定版を取得し、`Casks/xrift-studio.rb`と`packaging/release.json`を更新します。macOSのDMGが1つだけ存在し、アップロードが完了していること、URLとSHA-256の形式が正しいことを確認します。下書き・プレリリース・旧版への巻き戻り・同じ版のファイル差し替えは拒否します。

`--check`は保存したリリース情報と生成物の一致を確認します。ネット接続は使いません。生成後は2ファイルを更新PRに含め、macOSのCIが成功した後にマージします。

### リリース後の自動更新

**Update Homebrew** は安定版の公開と手動実行に対応します。**Release** workflowから公開するときは、全OSのビルドと`finalize-release`による公開が完了してから直接呼び出します。下書きを手動で公開した場合も対象になります。

生成・検証した定義をActions artifactに保存し、`automation/package-managers`ブランチの更新PRを作成します。Homebrewに反映されるのはPRをマージした後です。公開しただけではCaskのバージョンは変わりません。

自動PR作成には **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** を有効にします。このworkflowにはPRを承認・マージする処理はありません。追加のSecretsは不要です。[GitHubの設定](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests)

設定が無効の場合、生成物はActions実行結果の **Artifacts** に残ります。ZIPを取得して手動の更新PRに反映するか、設定後に **Update Homebrew → Run workflow** で再実行してください。

### Homebrew本家との違い

この配布方法はプロジェクト独自のtapです。Homebrew本家の`homebrew/cask`への登録とは別です。本家へ提出する場合は、Gatekeeperの検証、署名・公証、採用基準を別途確認します。Tauriの自動更新用署名はAppleの署名・公証とは異なります。[Homebrewの採用基準](https://docs.brew.sh/Acceptable-Casks)

## 検証の範囲

PRのmacOS CIでCaskの書式、DMGの取得とSHA-256、インストール、アプリの配置、アンインストールを確認します。GUI起動、Gatekeeper、既存版からの更新は別途確認が必要です。
