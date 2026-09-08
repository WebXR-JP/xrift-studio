/** セットアップの内部ステップ名を、画面に表示する文言へ変換します。 */
const SETUP_STEP_LABELS: Readonly<Record<string, string>> = {
  download: "ダウンロード中",
  extract: "展開中",
  "npm-install": "インストール中",
  "xrift-update": "アップデート中",
  "node-cached": "Node.jsを確認",
  "xrift-cached": "XRift CLIを確認",
  done: "完了",
};

export function setupProgressLabel(step?: string): string {
  return step && Object.prototype.hasOwnProperty.call(SETUP_STEP_LABELS, step)
    ? SETUP_STEP_LABELS[step]
    : "準備中";
}
