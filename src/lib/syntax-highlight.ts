/**
 * Syntax highlighting for read-only code: the guide's samples, the Script
 * template preview, the Script approval dialog and the Interactivity JSON view.
 *
 * Written here instead of pulled from a highlighting library. The guide is a
 * static site where a full grammar engine would dominate the bundle, and the
 * app already ships Monaco for the one surface where code is edited — a second
 * engine, coloured differently from the editor, is not worth its size for views
 * that only display. The languages that actually appear are TypeScript, TSX,
 * JSON and shell; anything else renders as plain text rather than being guessed
 * at, because wrong colours on code a reader is about to approve are worse than
 * none.
 */

export type TokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "constant"
  | "type"
  | "function"
  | "property"
  | "tag"
  | "attribute"
  | "punctuation"
  | "operator"
  | "command"
  | "flag"
  | "variable";

export type Token = {
  text: string;
  kind: TokenKind;
};

export type SyntaxLanguage = "ts" | "tsx" | "json" | "bash" | "plain";

const LANGUAGE_ALIASES: Record<string, SyntaxLanguage> = {
  ts: "ts",
  typescript: "ts",
  js: "ts",
  javascript: "ts",
  mjs: "ts",
  cjs: "ts",
  tsx: "tsx",
  jsx: "tsx",
  json: "json",
  jsonc: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  powershell: "bash",
  ps1: "bash",
};

/** Map a Markdown fence info string or editor language id to a supported one. */
export function resolveLanguage(name: string | undefined | null): SyntaxLanguage {
  if (!name) return "plain";
  const key = name.trim().toLowerCase().split(/[\s:,]/)[0];
  return LANGUAGE_ALIASES[key] ?? "plain";
}

const TS_KEYWORDS = new Set([
  "abstract", "as", "asserts", "async", "await", "break", "case", "catch",
  "class", "const", "continue", "debugger", "declare", "default", "delete",
  "do", "else", "enum", "export", "extends", "finally", "for", "from",
  "function", "get", "global", "if", "implements", "import", "in", "infer",
  "instanceof", "interface", "is", "keyof", "let", "module", "namespace",
  "new", "of", "override", "private", "protected", "public", "readonly",
  "require", "return", "satisfies", "set", "static", "super", "switch",
  "throw", "try", "type", "typeof", "var", "void", "while", "with", "yield",
]);

const TS_CONSTANTS = new Set([
  "true", "false", "null", "undefined", "NaN", "Infinity", "this",
]);

const TS_BUILTIN_TYPES = new Set([
  "any", "bigint", "boolean", "never", "number", "object", "string", "symbol",
  "unknown",
]);

/**
 * Text after which a `<` starts a JSX element rather than a comparison.
 * `>` and `/>` are in the set so a sibling or closing tag is still recognised
 * once the previous element has ended.
 */
const JSX_OPENERS = new Set([
  "(", ",", "=", "=>", "{", "}", "[", ";", ":", "?", "&&", "||", "return",
  ">", "/>", "|",
]);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

class Scanner {
  readonly source: string;
  index = 0;
  readonly tokens: Token[] = [];
  /** Last token that decides how the next character reads. */
  lastMeaningful: Token | null = null;

  constructor(source: string) {
    this.source = source;
  }

  push(kind: TokenKind, text: string) {
    if (!text) return;
    this.tokens.push({ kind, text });
    if (kind !== "comment" && text.trim()) {
      this.lastMeaningful = { kind, text: text.trim() };
    }
    this.index += text.length;
  }

  peek(offset = 0): string {
    return this.source[this.index + offset] ?? "";
  }

  /** The next character that is not a space, tab or newline. */
  nextNonSpace(from: number): string {
    let cursor = from;
    while (cursor < this.source.length && /\s/.test(this.source[cursor])) {
      cursor += 1;
    }
    return this.source[cursor] ?? "";
  }
}

function readIdentifier(scanner: Scanner): string {
  let end = scanner.index;
  while (end < scanner.source.length && IDENT_PART.test(scanner.source[end])) {
    end += 1;
  }
  return scanner.source.slice(scanner.index, end);
}

function readNumber(scanner: Scanner): string {
  const rest = scanner.source.slice(scanner.index);
  const match = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(\d[\d_]*)?\.?\d[\d_]*([eE][+-]?\d+)?)n?/.exec(rest);
  return match ? match[0] : rest[0];
}

function readQuoted(scanner: Scanner, quote: string): string {
  let end = scanner.index + 1;
  while (end < scanner.source.length) {
    const char = scanner.source[end];
    if (char === "\\") {
      end += 2;
      continue;
    }
    if (char === quote) return scanner.source.slice(scanner.index, end + 1);
    if (char === "\n" && quote !== "`") {
      return scanner.source.slice(scanner.index, end);
    }
    end += 1;
  }
  return scanner.source.slice(scanner.index);
}

/**
 * Consume a `{ ... }` expression, already positioned on the opening brace or
 * on the `${` of a template interpolation, and emit its contents as code.
 * `openDepth` is 1 because the caller has emitted the opener itself.
 */
function scanBracedExpression(scanner: Scanner, jsx: boolean) {
  let depth = 1;
  while (depth > 0 && scanner.index < scanner.source.length) {
    const before = scanner.index;
    if (scanner.peek() === "}") {
      depth -= 1;
      if (depth === 0) {
        scanner.push("punctuation", "}");
        return;
      }
    } else if (scanner.peek() === "{") {
      depth += 1;
    }
    scanTypeScriptToken(scanner, jsx);
    if (scanner.index === before) {
      // No scanner branch matched. Emit the character so the caller cannot spin.
      scanner.push("plain", scanner.peek());
    }
  }
}

/**
 * Read a template literal, emitting `${ ... }` as code rather than string.
 * Interpolations carry the identifiers a reader most wants to see.
 */
function scanTemplate(scanner: Scanner, jsx: boolean) {
  scanner.push("string", "`");
  let literal = "";
  while (scanner.index + literal.length < scanner.source.length) {
    const at = scanner.index + literal.length;
    const char = scanner.source[at];
    if (char === "\\") {
      literal += scanner.source.slice(at, at + 2);
      continue;
    }
    if (char === "`") {
      scanner.push("string", literal);
      scanner.push("string", "`");
      return;
    }
    if (char === "$" && scanner.source[at + 1] === "{") {
      scanner.push("string", literal);
      scanner.push("punctuation", "${");
      scanBracedExpression(scanner, jsx);
      literal = "";
      continue;
    }
    literal += char;
  }
  scanner.push("string", literal);
}

function classifyIdentifier(scanner: Scanner, word: string): TokenKind {
  const after = scanner.nextNonSpace(scanner.index + word.length);
  const afterDot = scanner.lastMeaningful?.text === ".";
  if (TS_KEYWORDS.has(word) && !afterDot) return "keyword";
  if (TS_CONSTANTS.has(word) && !afterDot) return "constant";
  if (afterDot) return after === "(" ? "function" : "property";
  if (after === "(") return "function";
  if (TS_BUILTIN_TYPES.has(word)) return "type";
  if (after === ":") return "property";
  if (/^[A-Z]/.test(word)) return "type";
  return "plain";
}

/** True when a `<` here opens a JSX element instead of comparing two values. */
function startsJsxElement(scanner: Scanner): boolean {
  const next = scanner.peek(1);
  if (!IDENT_START.test(next) && next !== ">" && next !== "/") return false;
  const previous = scanner.lastMeaningful;
  if (!previous) return true;
  if (previous.kind === "keyword") return previous.text === "return";
  return JSX_OPENERS.has(previous.text);
}

function scanJsxTagName(scanner: Scanner) {
  let end = scanner.index;
  while (end < scanner.source.length && /[A-Za-z0-9_$.\-]/.test(scanner.source[end])) {
    end += 1;
  }
  scanner.push("tag", scanner.source.slice(scanner.index, end));
}

/**
 * A JSX tag head: `<mesh name={...} position={[0, 1, 0]}>`. Bare words are
 * attributes; anything inside `{ }` goes back through the normal scanner.
 */
function scanJsxTag(scanner: Scanner) {
  while (scanner.index < scanner.source.length) {
    const char = scanner.peek();
    if (char === "/" && scanner.peek(1) === ">") {
      scanner.push("punctuation", "/>");
      return;
    }
    if (char === ">") {
      scanner.push("punctuation", ">");
      return;
    }
    if (/\s/.test(char)) {
      scanner.push("plain", char);
      continue;
    }
    if (char === "=") {
      scanner.push("operator", "=");
      continue;
    }
    if (char === '"' || char === "'") {
      scanner.push("string", readQuoted(scanner, char));
      continue;
    }
    if (char === "{") {
      scanner.push("punctuation", "{");
      scanBracedExpression(scanner, true);
      continue;
    }
    if (IDENT_START.test(char)) {
      let end = scanner.index;
      while (end < scanner.source.length && /[A-Za-z0-9_$\-:]/.test(scanner.source[end])) {
        end += 1;
      }
      scanner.push("attribute", scanner.source.slice(scanner.index, end));
      continue;
    }
    scanner.push("punctuation", char);
  }
}

function scanTypeScriptToken(scanner: Scanner, jsx: boolean) {
  const char = scanner.peek();

  if (/\s/.test(char)) {
    let end = scanner.index;
    while (end < scanner.source.length && /\s/.test(scanner.source[end])) end += 1;
    scanner.tokens.push({ kind: "plain", text: scanner.source.slice(scanner.index, end) });
    scanner.index = end;
    return;
  }

  if (char === "/" && scanner.peek(1) === "/") {
    const end = scanner.source.indexOf("\n", scanner.index);
    const stop = end === -1 ? scanner.source.length : end;
    scanner.push("comment", scanner.source.slice(scanner.index, stop));
    return;
  }

  if (char === "/" && scanner.peek(1) === "*") {
    const end = scanner.source.indexOf("*/", scanner.index + 2);
    const stop = end === -1 ? scanner.source.length : end + 2;
    scanner.push("comment", scanner.source.slice(scanner.index, stop));
    return;
  }

  if (char === '"' || char === "'") {
    scanner.push("string", readQuoted(scanner, char));
    return;
  }

  if (char === "`") {
    scanTemplate(scanner, jsx);
    return;
  }

  if (/\d/.test(char) || (char === "." && /\d/.test(scanner.peek(1)))) {
    scanner.push("number", readNumber(scanner));
    return;
  }

  if (jsx && char === "<" && startsJsxElement(scanner)) {
    if (scanner.peek(1) === "/") {
      scanner.push("punctuation", "</");
      scanJsxTagName(scanner);
      if (scanner.peek() === ">") scanner.push("punctuation", ">");
      return;
    }
    scanner.push("punctuation", "<");
    if (scanner.peek() === ">") {
      scanner.push("punctuation", ">");
      return;
    }
    scanJsxTagName(scanner);
    scanJsxTag(scanner);
    return;
  }

  if (IDENT_START.test(char)) {
    const word = readIdentifier(scanner);
    scanner.push(classifyIdentifier(scanner, word), word);
    return;
  }

  const operator = /^(=>|\.\.\.|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|[+\-*/%!<>=&|^~?])/.exec(
    scanner.source.slice(scanner.index),
  );
  if (operator) {
    scanner.push("operator", operator[0]);
    return;
  }

  scanner.push("punctuation", char);
}

function highlightTypeScript(source: string, jsx: boolean): Token[] {
  const scanner = new Scanner(source);
  while (scanner.index < scanner.source.length) {
    const before = scanner.index;
    scanTypeScriptToken(scanner, jsx);
    if (scanner.index === before) {
      scanner.push("plain", scanner.peek());
    }
  }
  return scanner.tokens;
}

function highlightJson(source: string): Token[] {
  const scanner = new Scanner(source);
  while (scanner.index < scanner.source.length) {
    const char = scanner.peek();
    if (/\s/.test(char)) {
      let end = scanner.index;
      while (end < scanner.source.length && /\s/.test(scanner.source[end])) end += 1;
      scanner.tokens.push({ kind: "plain", text: scanner.source.slice(scanner.index, end) });
      scanner.index = end;
      continue;
    }
    if (char === '"') {
      const text = readQuoted(scanner, '"');
      const after = scanner.nextNonSpace(scanner.index + text.length);
      scanner.push(after === ":" ? "property" : "string", text);
      continue;
    }
    if (/[\d-]/.test(char)) {
      const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(scanner.source.slice(scanner.index));
      if (match) {
        scanner.push("number", match[0]);
        continue;
      }
    }
    if (IDENT_START.test(char)) {
      const word = readIdentifier(scanner);
      scanner.push(TS_CONSTANTS.has(word) ? "constant" : "plain", word);
      continue;
    }
    scanner.push("punctuation", char);
  }
  return scanner.tokens;
}

/** Words after which the next bare word is a command again, not an argument. */
const SHELL_COMMAND_BOUNDARY = /(^|[|;&]|&&|\|\||\$\()\s*$/;

function highlightShell(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let lineStart = 0;

  const push = (kind: TokenKind, text: string) => {
    if (!text) return;
    tokens.push({ kind, text });
    index += text.length;
  };

  while (index < source.length) {
    const char = source[index];

    if (char === "\n") {
      push("plain", char);
      lineStart = index;
      continue;
    }
    if (/\s/.test(char)) {
      push("plain", char);
      continue;
    }
    if (char === "#") {
      const end = source.indexOf("\n", index);
      push("comment", source.slice(index, end === -1 ? source.length : end));
      continue;
    }
    if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < source.length && source[end] !== char) {
        end += source[end] === "\\" ? 2 : 1;
      }
      push("string", source.slice(index, Math.min(end + 1, source.length)));
      continue;
    }
    if (char === "$") {
      const match = /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.exec(source.slice(index));
      if (match) {
        push("variable", match[0]);
        continue;
      }
    }
    if (char === "-") {
      const match = /^--?[A-Za-z0-9][A-Za-z0-9-]*/.exec(source.slice(index));
      if (match) {
        push("flag", match[0]);
        continue;
      }
    }
    if (/[|;&<>()]/.test(char)) {
      push("punctuation", char);
      continue;
    }

    const word = /^[^\s|;&<>()"'#]+/.exec(source.slice(index))?.[0] ?? char;
    const precedingText = source.slice(lineStart, index);
    const isCommand = SHELL_COMMAND_BOUNDARY.test(precedingText) || precedingText.trim() === "";
    push(isCommand ? "command" : "plain", word);
  }

  return tokens;
}

/** Merge neighbours of the same kind so the output is fewer, larger spans. */
function collapse(tokens: Token[]): Token[] {
  const merged: Token[] = [];
  for (const token of tokens) {
    if (!token.text) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === token.kind) {
      previous.text += token.text;
      continue;
    }
    merged.push({ ...token });
  }
  return merged;
}

/**
 * Tokenize `code`. Never throws and never drops characters: concatenating the
 * returned token texts reproduces the input exactly, so a language this does
 * not understand degrades to one plain token instead of mangled output.
 */
export function highlight(code: string, language: SyntaxLanguage): Token[] {
  if (!code) return [];
  try {
    let tokens: Token[];
    switch (language) {
      case "ts":
        tokens = highlightTypeScript(code, false);
        break;
      case "tsx":
        tokens = highlightTypeScript(code, true);
        break;
      case "json":
        tokens = highlightJson(code);
        break;
      case "bash":
        tokens = highlightShell(code);
        break;
      default:
        return [{ kind: "plain", text: code }];
    }
    const rebuilt = tokens.reduce((total, token) => total + token.text, "");
    if (rebuilt !== code) return [{ kind: "plain", text: code }];
    return collapse(tokens);
  } catch {
    return [{ kind: "plain", text: code }];
  }
}
