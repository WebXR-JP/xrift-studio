export type SupportReportContext = {
  currentScreen: string;
  errorMessage?: string | null;
  diagnostics?: string[];
};

const MAX_ERROR_MESSAGE_LENGTH = 2_000;

export function sanitizeSupportErrorMessage(value: unknown): string | null {
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

  if (sanitized.length <= MAX_ERROR_MESSAGE_LENGTH) return sanitized;
  return `${sanitized.slice(0, MAX_ERROR_MESSAGE_LENGTH)}\n…（長いメッセージを省略しました）`;
}
