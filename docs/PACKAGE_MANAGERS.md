# HomebrewとWinGet

XRift Studioの公開済みインストーラーを、HomebrewとWinGetから使うための手順です。どちらでインストールしても、初回起動時の[セットアップ](./guide/installation.md#2-セットアップする)は必要です。

| 方法 | 対応環境 | 現在の配布方法 |
| --- | --- | --- |
| Homebrew | macOS、Apple Silicon / Intel | このリポジトリを配布元として登録する |
| WinGet | Windows、x64 | 登録準備中。ローカルの定義ファイルから利用する |

初回の定義は[公開済みのv0.10.1](https://github.com/WebXR-JP/xrift-studio/releases/tag/v0.10.1)に対応しています。Homebrew本家とWinGetの公式一覧への登録は、このリポジトリへの追加とは別に行います。

## Homebrew

### インストールする

[Homebrew](https://brew.sh/)を導入したMacで、次のコマンドを実行します。

```bash
brew tap webxr-jp/xrift-studio https://github.com/WebXR-JP/xrift-studio.git
brew install --cask webxr-jp/xrift-studio/xrift-studio
open -a "XRift Studio"
```

最初の行は、このリポジトリをHomebrewの配布元（tap）に登録します。URLを指定する形式を使うので、専用の`homebrew-*`リポジトリは不要です。インストールには[Cask定義](../Casks/xrift-studio.rb)で指定したuniversal DMGを使います。[Homebrewのtap仕様](https://docs.brew.sh/Taps)

開発元の確認で起動が止まった場合は、[macOSで開けないとき](./guide/installation-problems.md#macosで開けない)を参照してください。

### 更新する

アプリを終了してから実行します。

```bash
brew update
brew upgrade --cask --greedy webxr-jp/xrift-studio/xrift-studio
```

XRift Studioはアプリ内からも更新できるため、Caskに`auto_updates true`を指定しています。`--greedy`を付けると、そのようなアプリもHomebrewの更新対象に含まれます。[Homebrewの更新コマンド](https://docs.brew.sh/Manpage#upgrade-options-formulacask-)

### アンインストールする

```bash
brew uninstall --cask webxr-jp/xrift-studio/xrift-studio
```

このCaskにはプロジェクトやアプリの保存データを消す処理を含めていません。保存場所は[データの保存とリセット](./guide/recovery.md)で確認できます。

## WinGet

**`WebXR-JP.XRiftStudio`は公式一覧への登録準備中です。** 登録が反映されるまでは、以下のローカルインストールを使います。アプリをすぐ使いたい場合は、[通常のWindowsインストーラー](https://github.com/WebXR-JP/xrift-studio/releases/latest)も利用できます。

### 登録前にローカルでインストールする

このリポジトリをダウンロードまたはcloneして、ルートフォルダーを開きます。使うのは[バージョンごとの3つのYAMLファイル](../packaging/winget/manifests/w/WebXR-JP/XRiftStudio/)です。Node.jsやアプリのビルド環境は不要です。

まず、管理者として開いたPowerShellで、ローカル定義の利用を一度だけ有効にします。

```powershell
winget settings --enable LocalManifestFiles
```

次に通常のPowerShellを開き、このリポジトリのルートから実行します。

```powershell
$manifest = '.\packaging\winget\manifests\w\WebXR-JP\XRiftStudio\0.10.1'
winget validate --manifest $manifest
winget install --manifest $manifest
```

3つのYAMLは同じフォルダーに置き、そのフォルダーを指定します。インストール後はスタートメニューからXRift Studioを開きます。ローカル定義の有効化と複数ファイル形式の扱いは[WinGetのローカルインストール仕様](https://learn.microsoft.com/en-us/windows/package-manager/winget/install#local-install)に従います。

新しい版の定義が追加されたら、アプリを終了し、`$manifest`をそのバージョンのフォルダーへ変更して更新します。

```powershell
winget upgrade --manifest $manifest
```

ローカル定義からの更新は、[WinGetのupgradeコマンド](https://learn.microsoft.com/en-us/windows/package-manager/winget/upgrade)で指定できます。登録前にアンインストールする場合は、Windowsの「設定」から「アプリ」→「インストールされているアプリ」を開き、XRift Studioを選びます。

### 公式一覧に登録された後

`microsoft/winget-pkgs`での審査を経て、WinGetの検索結果に反映されたら、次のコマンドで利用できます。登録が終わるまでは実行しても見つかりません。

```powershell
winget install --id WebXR-JP.XRiftStudio --exact --source winget
winget upgrade --id WebXR-JP.XRiftStudio --exact --source winget
winget uninstall --id WebXR-JP.XRiftStudio --exact
```

## 配布定義を更新する

ここからは開発者向けの手順です。定義のURLとSHA-256を更新すると、次回のインストールや更新で使う配布ファイルが変わります。

### 手動で生成する

Node.js 20以上を使い、リポジトリのルートで実行します。

```bash
node scripts/update-package-managers.mjs
node scripts/update-package-managers.mjs --check
node --test scripts/update-package-managers.test.mjs scripts/winget-manifest.test.mjs
```

生成処理はGitHubの`releases/latest`から公開済みの通常リリースを取得します。保存先は次のとおりです。

| ファイル | 内容 |
| --- | --- |
| `packaging/release.json` | 生成に使ったリリース情報 |
| `Casks/xrift-studio.rb` | macOSのuniversal DMGを使うHomebrew定義 |
| `packaging/winget/manifests/w/WebXR-JP/XRiftStudio/<version>/` | Windows x64向けのversion・defaultLocale・installer定義 |

`--check`は`packaging/release.json`と生成物が一致するかを確認します。ネット接続は使わないため、GitHub上に新しいリリースがあるかの確認にはなりません。生成後は差分を確認し、上記の生成物をまとめてPRへ含めます。

### リリース後の自動更新

GitHub Actionsの**Update package managers**は、通常リリースの公開と手動実行に対応します。**Release**から直接通常リリースを公開するときは、全OSのビルド・アップロードが終わってから同じ処理を呼び出します。ドラフトやプレリリースは配布定義の更新対象にしません。

処理は公開済みリリースから定義を生成・検証し、このリポジトリに更新PRを作ります。Homebrewの利用者へ新しい定義が届くのは、そのPRがマージされた後です。WinGetの公式一覧へは別途提出します。

PR作成には、リポジトリの**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**が必要です。この処理は`GITHUB_TOKEN`を使い、PRを自動承認・マージする処理は持ちません。組織の設定で変更できない場合は、管理者が設定を確認します。[GitHub ActionsのPR作成設定](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests)

生成した定義は、実行結果の**Artifacts**からZIPで取得できます。生成・検証後にPR作成が失敗した場合は、このZIPの内容を作業ブランチへ反映してPRを作成してください。設定を整えた後は、**Update package managers → Run workflow**で再実行できます。

### Homebrew本家への登録

現在のtapはこのリポジトリで管理します。本家の`homebrew/cask`へ登録する場合は、署名・notarizationを含むGatekeeperの検証と、プロジェクトの採用基準を別途確認してください。Tauriの自動更新用署名は、Appleの開発元署名やnotarizationとは別です。[Homebrewの採用基準](https://docs.brew.sh/Acceptable-Casks)、[TauriのmacOS署名](https://v2.tauri.app/distribute/sign/macos/)

### WinGetへ初回登録する

1. 上記の生成処理を実行し、公開済みインストーラーのバージョン・URL・SHA-256が正しいことを確認します。
2. [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs)を自分のアカウントへforkし、手元へcloneして作業ブランチを作ります。
3. このリポジトリの`packaging/winget/manifests/w/WebXR-JP/XRiftStudio/<version>/`を、forkしたリポジトリの`manifests/w/WebXR-JP/XRiftStudio/<version>/`へコピーします。3つのYAMLを一緒に追加します。
4. Windowsでそのフォルダーに対して`winget validate --manifest <path>`を実行します。続けて、隔離した検証環境でインストール・起動・旧版からの更新・アンインストールを確認します。
5. forkの作業ブランチへcommit・pushし、`microsoft/winget-pkgs`へPRを作ります。インストーラー本体は追加せず、1つのバージョンの定義を提出します。
6. 上流の検証・レビューに対応します。マージ後、`winget show --id WebXR-JP.XRiftStudio --exact --source winget`で公開一覧への反映を確認してから、利用者へ登録完了を案内します。

提出先のフォルダー構成とWindows Sandboxでの検証方法は、[Microsoftのmanifest提出手順](https://learn.microsoft.com/en-us/windows/package-manager/package/repository)を参照してください。新しいバージョンの公開時も、生成した定義を上流へ提出する必要があります。

## 検証の範囲

定義の整合検査とNode.jsのテストは、生成処理の確認です。macOS・Windowsでのインストール成功を保証するものではありません。

今回の追加時点では、Homebrew・WinGetを使った実機のインストール、起動、更新、アンインストールは未検証です。配布を案内する前に、検証用のMacとWindowsで各操作を確認してください。Windowsではアプリ内更新後も同じアプリとして認識されること、macOSではGatekeeperと既存のアプリ内更新が動くことも確認します。
