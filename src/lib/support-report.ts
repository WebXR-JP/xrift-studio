export type SupportReportContext = {
  currentScreen: string;
  /** The action or screen transition during which the problem occurred. */
  failureTiming?: string;
  errorMessage?: string | null;
  /**
   * Verbatim output behind the failure, such as a CLI log. A summary alone
   * tells the reader that something failed but not what, so whatever the
   * failure screen shows has to travel with the report.
   */
  errorDetail?: string | null;
  diagnostics?: string[];
  project?: {
    name: string;
    description?: string;
  };
};

const MAX_ERROR_MESSAGE_LENGTH = 2_000;
/** Tool output is the part a reader needs in full, so it gets a larger budget. */
const MAX_ERROR_DETAIL_LENGTH = 8_000;

export function sanitizeSupportErrorDetail(value: unknown): string | null {
  return sanitizeSupportText(value, MAX_ERROR_DETAIL_LENGTH);
}

export function sanitizeSupportErrorMessage(value: unknown): string | null {
  return sanitizeSupportText(value, MAX_ERROR_MESSAGE_LENGTH);
}

function sanitizeSupportText(value: unknown, maxLength: number): string | null {
  const raw =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : value == null
          ? ""
          : String(value);
  const normalized = raw.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;

  const sanitized = normalized
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [削除]")
    .replace(
      /\b(access[_ -]?token|authorization|cookie|password|secret)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[削除]",
    )
    .replace(/\b[A-Za-z]:\\[^;\r\n]*/g, "[ローカルパス]")
    .replace(/\bfile:\/\/\/[^\s)]+/gi, "[ローカルパス]")
    .replace(/\/(?:Users|home|tmp|var\/folders)\/[^;\r\n]*/g, "[ローカルパス]");

  if (sanitized.length <= maxLength) return sanitized;
  return `${sanitized.slice(0, maxLength)}\n…（長いメッセージを省略しました）`;
}

/**
 * Produces the editable portion of a support request.  Error recovery views
 * supply project context so the report records when the failure happened,
 * instead of making the creator reconstruct the route from memory.
 */
export function createSupportReportDraft(
  context: SupportReportContext | undefined,
  errorMessage: string | null,
): string {
  const project = context?.project;
  const subject = project
    ? `プロジェクト「${project.name}」で${context?.currentScreen ?? "エラー"}が発生しました。`
    : `${context?.currentScreen ?? "現在の画面"}でエラーが発生しました。`;
  const projectDetails = project?.description
    ? `\nプロジェクト一覧では「${project.description}」と表示されています。`
    : "";
  const projectStep = project
    ? `プロジェクトライブラリで「${project.name}」を選ぶ`
    : "問題が発生した画面を開く";
  const actualError = errorMessage
    ? `\n\n発生したエラー: \`${errorMessage}\``
    : "";

  return `## 相談内容
${subject}${projectDetails}

## 再現手順または利用シーン
1. ${projectStep}
2. ${context?.failureTiming ?? context?.currentScreen ?? "対象の画面"}を開く
3. 初期表示・読み込み中にエラーが発生し、エラー画面へ切り替わる
4. 再試行しても同じ状態になる

## 期待する結果
対象の画面が正常に表示され、制作を続けられること。

## 実際の結果・困っていること
エラー画面が表示され、対象の機能を利用できません。${actualError}
`;
}
