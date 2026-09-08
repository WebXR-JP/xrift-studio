/** 現在の表示名・説明・操作IDを検索する。全角英数字と大文字・小文字は区別しない。 */
export function matchesInteractivityOperation(
  template: { op: string; label: string; description: string },
  query: string,
): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const text = normalize([
    template.label,
    template.description,
    template.op,
  ].join(" "));
  return words.every((word) => text.includes(word));
}
