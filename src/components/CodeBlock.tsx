import { Fragment } from "react";
import {
  highlight,
  resolveLanguage,
  type SyntaxLanguage,
} from "../lib/syntax-highlight";

/**
 * Highlighted code as bare children, for a `<pre>` that already has its own
 * styling — the Script template preview, the approval dialog, the Interactivity
 * JSON view. Colours come from `src/syntax-highlight.css`.
 */
export function CodeTokens({
  code,
  language,
}: {
  code: string;
  language: SyntaxLanguage | string | undefined;
}) {
  const resolved: SyntaxLanguage =
    language === "ts" ||
    language === "tsx" ||
    language === "json" ||
    language === "bash" ||
    language === "plain"
      ? language
      : resolveLanguage(language);
  const tokens = highlight(code, resolved);
  return (
    <>
      {tokens.map((token, index) =>
        token.kind === "plain" ? (
          <Fragment key={index}>{token.text}</Fragment>
        ) : (
          <span key={index} className={`tok-${token.kind}`}>
            {token.text}
          </span>
        ),
      )}
    </>
  );
}

/** Labels shown on guide code blocks. A block with no label is plain text. */
const LANGUAGE_LABELS: Partial<Record<SyntaxLanguage, string>> = {
  ts: "TypeScript",
  tsx: "TSX",
  json: "JSON",
  bash: "Shell",
};

/**
 * A complete code block for rendered Markdown.
 *
 * The label says whether the reader is looking at something to paste into a
 * terminal or into a file, which the code alone does not always make obvious.
 */
export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string | undefined;
}) {
  const resolved = resolveLanguage(language);
  const label = LANGUAGE_LABELS[resolved];
  return (
    <pre data-language={label}>
      <code>
        <CodeTokens code={code} language={resolved} />
      </code>
    </pre>
  );
}
