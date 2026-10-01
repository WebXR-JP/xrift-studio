# インストールして起動する

アプリをインストールし、初回セットアップを済ませると制作を始められます。必要なツールはセットアップ中に自動で用意されるため、インストーラーを使う場合はコードやコマンドの入力は不要です。

## 1. アプリをダウンロードする

[XRift Studioのダウンロード案内](https://webxr-jp.github.io/xrift-studio/#download)から、お使いのパソコンに合うインストーラーをダウンロードしてください。見つからない場合は、[配布ファイルの一覧](https://github.com/WebXR-JP/xrift-studio/releases/latest)を確認します。「Source code」のZIPは、アプリを開発するためのファイルです。

### Windows

Windows用の`.msi`または`.exe`を開き、画面の案内に従ってインストールしてください。完了後は、スタートメニューからXRift Studioを起動できます。

### macOS

`.dmg`を開き、XRift Studioをアプリケーションフォルダーへ移してください。配布しているuniversal版は、Apple SiliconとIntelのどちらでも使えます。

Homebrewを使っている場合は、次のコマンドでもインストールできます。

```bash
brew tap webxr-jp/xrift-studio https://github.com/WebXR-JP/xrift-studio.git
brew install --cask webxr-jp/xrift-studio/xrift-studio
```

インストール後は、アプリケーションフォルダーからXRift Studioを起動してください。Homebrewで更新・削除する方法は、[Homebrewの導入手順](https://github.com/WebXR-JP/xrift-studio/blob/main/docs/PACKAGE_MANAGERS.md#homebrew)で説明しています。

開発元に関する警告で起動できない場合は、[アプリを開けないとき](./installation-problems.md#macosで開けない)を参照してください。警告の内容を確認し、保護機能を一括で無効にする操作は避けてください。

### Linux

`.deb`、`.rpm`、`.AppImage`のうち、お使いの環境に合う形式を選んでください。起動できない場合は、[インストールで困ったとき](./installation-problems.md)を参照してください。

## 2. セットアップする

初回起動の画面で「セットアップを開始」を押してください。インターネットに接続したまま、必要なツールのダウンロードとインストールが終わるまで待ちます。

![初回画面のセットアップ開始ボタンと準備するツール](./media/installation.png "セットアップ")

*セットアップが完了すると、プロジェクト一覧が開きます。*

途中で失敗した場合は、表示されたエラーを確認して「セットアップを再試行」を押してください。

アプリの更新後に「制作ツールの更新が必要です」と表示されたら、画面のバージョンを確認して「制作ツールを更新」を押してください。必要なNode.jsやXRift CLIが更新され、保存した作品とログイン情報は引き継がれます。推奨版より新しいCLIを使っている場合は、現在のバージョンが維持されます。

## 3. ビジュアルエディターを開く

プロジェクト一覧の「新規プロジェクト」から、ワールドのビジュアルエディターを選んでください。すでに一覧を開いている方は、この手順から始められます。

[最初のワールドを作る](./first-world.md)では、素材を一つ置き、色を変え、自動保存とPlayでの動作を確認します。

XRiftへのログインは、作品を公開するときに必要です。[公開の手順](./publishing.md)を参照してください。

## 途中で止まったら

起動できない場合は[インストールで困ったとき](./installation-problems.md)、起動後の操作が分からない場合は[画面の見方](./editor-basics.md)を参照してください。
