@AGENT.md

## Claude Codeの設定

ブラウザのプレビューには、`.claude/launch.json`の`web`設定をpreview_startで使ってください。ポート1420で開発サーバーが起動済みなら、そのサーバーを使い、`http://localhost:1420/preview.html`を開きます。

よく使うコマンドとTauri MCPの読み取り操作は、`.claude/settings.json`で事前に許可しています。

作業に合う資料を読んでください。機能追加・IPC連携は`docs/AGENT_IMPLEMENTATION.md`、画面設計は`xrift-studio-ux`、動作確認とデバッグは`xrift-studio-verify`、MCPでのワールド制作・調整は`xrift-world-direction`を使います。日本語の作成・推敲では、`AGENT.md`の文章と用語の方針に従ってください。
