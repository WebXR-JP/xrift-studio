import type { JsonObject, JsonValue } from "../scene-document";

/**
 * Static extraction of a Script's declared properties.
 *
 * The source is scanned, never executed: the Inspector must be able to show
 * fields for a script the user has not agreed to run yet, and the compiler
 * needs the same declaration without a browser. Anything not expressible as a
 * literal is reported instead of guessed, matching how component-code-import
 * treats non-static expressions.
 */

export type ScriptPropKind =
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "vec2"
  | "vec3"
  | "color"
  | "asset"
  | "entity";

export const SCRIPT_PROP_KINDS: readonly ScriptPropKind[] = [
  "string",
  "number",
  "boolean",
  "enum",
  "vec2",
  "vec3",
  "color",
  "asset",
  "entity",
];

export type ScriptPropDescriptor = {
  name: string;
  kind: ScriptPropKind;
  label?: string;
  description?: string;
  defaultValue?: JsonValue;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  assetKind?: string;
};

export type ScriptContractIssue = {
  code:
    | "missing-define-script"
    | "missing-name"
    | "unreadable-props"
    | "unknown-prop-kind"
    | "duplicate-prop";
  message: string;
  propName?: string;
};

export type ScriptContract = {
  name: string;
  props: ScriptPropDescriptor[];
  /** True when every declaration was readable. */
  complete: boolean;
  issues: ScriptContractIssue[];
};

export function extractScriptContract(source: string): ScriptContract {
  const issues: ScriptContractIssue[] = [];
  const stripped = stripCommentsAndStrings(source);
  const defineIndex = stripped.indexOf("defineScript(");
  if (defineIndex < 0) {
    return {
      name: "",
      props: [],
      complete: false,
      issues: [
        {
          code: "missing-define-script",
          message:
            "defineScript(...) が見つかりません。default export として defineScript を呼んでください。",
        },
      ],
    };
  }

  const body = sliceBalanced(source, source.indexOf("(", defineIndex));
  if (body === null) {
    return {
      name: "",
      props: [],
      complete: false,
      issues: [
        {
          code: "unreadable-props",
          message: "defineScript(...) の括弧が閉じていません。",
        },
      ],
    };
  }

  const name = readStringField(body, "name") ?? "";
  if (!name) {
    issues.push({
      code: "missing-name",
      message: "name を文字列リテラルで指定してください。",
    });
  }

  const propsBody = readObjectField(body, "props");
  if (propsBody === null) {
    return { name, props: [], complete: issues.length === 0, issues };
  }

  const props: ScriptPropDescriptor[] = [];
  const seen = new Set<string>();
  for (const entry of splitTopLevelEntries(propsBody)) {
    const parsed = parsePropEntry(entry, issues);
    if (!parsed) continue;
    if (seen.has(parsed.name)) {
      issues.push({
        code: "duplicate-prop",
        message: `${parsed.name} が重複しています。`,
        propName: parsed.name,
      });
      continue;
    }
    seen.add(parsed.name);
    props.push(parsed);
  }

  return {
    name,
    props,
    complete: issues.length === 0,
    issues,
  };
}

/** Values the Inspector should start from for a freshly attached script. */
export function createDefaultScriptProperties(
  contract: ScriptContract,
): JsonObject {
  const properties: JsonObject = {};
  for (const descriptor of contract.props) {
    properties[descriptor.name] =
      descriptor.defaultValue ?? fallbackDefault(descriptor.kind);
  }
  return properties;
}

function fallbackDefault(kind: ScriptPropKind): JsonValue {
  if (kind === "number") return 0;
  if (kind === "boolean") return false;
  if (kind === "vec2") return [0, 0];
  if (kind === "vec3") return [0, 0, 0];
  if (kind === "color") return "#ffffff";
  return "";
}

function parsePropEntry(
  entry: string,
  issues: ScriptContractIssue[],
): ScriptPropDescriptor | null {
  const separator = entry.indexOf(":");
  if (separator < 0) return null;
  const name = entry.slice(0, separator).trim().replace(/^["']|["']$/g, "");
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const value = entry.slice(separator + 1).trim();
  const kindMatch = /^prop\s*\.\s*([A-Za-z]+)\s*\(/.exec(value);
  if (!kindMatch) {
    issues.push({
      code: "unreadable-props",
      message: `${name} は prop.<kind>(...) の形で宣言してください。`,
      propName: name,
    });
    return null;
  }
  const kind = kindMatch[1] as ScriptPropKind;
  if (!SCRIPT_PROP_KINDS.includes(kind)) {
    issues.push({
      code: "unknown-prop-kind",
      message: `${name} の種別 ${kind} は未対応です。`,
      propName: name,
    });
    return null;
  }

  const optionsBody =
    sliceBalanced(value, value.indexOf("(", kindMatch[0].length - 1)) ?? "";
  const descriptor: ScriptPropDescriptor = { name, kind };
  const label = readStringField(optionsBody, "label");
  if (label) descriptor.label = label;
  const description = readStringField(optionsBody, "description");
  if (description) descriptor.description = description;
  const assetKind = readStringField(optionsBody, "kind");
  if (assetKind && kind === "asset") descriptor.assetKind = assetKind;
  for (const numeric of ["min", "max", "step"] as const) {
    const value = readNumberField(optionsBody, numeric);
    if (value !== null) descriptor[numeric] = value;
  }
  const options = readStringArrayField(optionsBody, "options");
  if (options) descriptor.options = options;
  const defaultValue = readDefaultField(optionsBody);
  if (defaultValue !== undefined) descriptor.defaultValue = defaultValue;
  return descriptor;
}

function readDefaultField(body: string): JsonValue | undefined {
  const raw = readRawField(body, "default");
  if (raw === null) return undefined;
  return parseLiteral(raw);
}

function parseLiteral(raw: string): JsonValue | undefined {
  const text = raw.trim();
  if (/^["'].*["']$/s.test(text)) return text.slice(1, -1);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    const parts = splitTopLevel(inner, ",");
    const values = parts.map((part) => parseLiteral(part));
    if (values.some((value) => value === undefined)) return undefined;
    return values as JsonValue[];
  }
  return undefined;
}

function readRawField(body: string, field: string): string | null {
  const pattern = new RegExp(`(^|[,{\\s])${field}\\s*:`, "m");
  const match = pattern.exec(body);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const [value] = splitTopLevel(rest, ",");
  return value?.trim() ?? null;
}

function readStringField(body: string, field: string): string | null {
  const raw = readRawField(body, field);
  if (raw === null) return null;
  const value = parseLiteral(raw);
  return typeof value === "string" ? value : null;
}

function readNumberField(body: string, field: string): number | null {
  const raw = readRawField(body, field);
  if (raw === null) return null;
  const value = parseLiteral(raw);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArrayField(body: string, field: string): string[] | null {
  const raw = readRawField(body, field);
  if (raw === null) return null;
  const value = parseLiteral(raw);
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === "string")
    ? (value as string[])
    : null;
}

function readObjectField(body: string, field: string): string | null {
  const pattern = new RegExp(`(^|[,{\\s])${field}\\s*:\\s*\\{`, "m");
  const match = pattern.exec(body);
  if (!match) return null;
  const braceIndex = body.indexOf("{", match.index + match[0].length - 1);
  return sliceBalanced(body, braceIndex);
}

/** Returns the text between a bracket at `open` and its match, or null. */
function sliceBalanced(source: string, open: number): string | null {
  if (open < 0) return null;
  const opener = source[open];
  const closer = opener === "(" ? ")" : opener === "{" ? "}" : "]";
  let depth = 0;
  let quote: string | null = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === opener) depth += 1;
    else if (char === closer) {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

function splitTopLevelEntries(body: string): string[] {
  return splitTopLevel(body, ",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") depth -= 1;
    else if (char === separator && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

/** Blanks comments and string bodies so keyword scans cannot match inside them. */
function stripCommentsAndStrings(source: string): string {
  let output = "";
  let quote: string | null = null;
  let comment: "line" | "block" | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];
    if (comment === "line") {
      if (char === "\n") {
        comment = null;
        output += char;
      } else output += " ";
      continue;
    }
    if (comment === "block") {
      if (char === "*" && next === "/") {
        comment = null;
        output += "  ";
        index += 1;
      } else output += char === "\n" ? char : " ";
      continue;
    }
    if (quote) {
      if (char === "\\") {
        output += "  ";
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      output += char === "\n" ? char : " ";
      continue;
    }
    if (char === "/" && next === "/") {
      comment = "line";
      output += "  ";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      comment = "block";
      output += "  ";
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      output += char;
      continue;
    }
    output += char;
  }
  return output;
}
