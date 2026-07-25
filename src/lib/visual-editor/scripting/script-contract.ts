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
    | "unreadable-prop-default"
    | "unreadable-prop-options"
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
    if (readRawField(body, "props") !== null) {
      issues.push({
        code: "unreadable-props",
        message:
          "props は prop.<kind>(...) を並べたObject literalで宣言してください。",
      });
    }
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
    properties[descriptor.name] = getScriptPropDefaultValue(descriptor);
  }
  return properties;
}

/** Runtime and Inspector fallback for a missing or invalid persisted value. */
export function getScriptPropDefaultValue(
  descriptor: ScriptPropDescriptor,
): JsonValue {
  if (
    descriptor.defaultValue !== undefined &&
    getScriptPropValueValidationError(
      descriptor,
      descriptor.defaultValue,
    ) === null
  ) {
    return descriptor.defaultValue;
  }
  return fallbackDefault(descriptor);
}

export function resolveScriptPropValue(
  descriptor: ScriptPropDescriptor,
  value: unknown,
): JsonValue {
  return getScriptPropValueValidationError(descriptor, value) === null
    ? (value as JsonValue)
    : getScriptPropDefaultValue(descriptor);
}

/**
 * Shared write-boundary validation for Inspector and MCP.
 *
 * `null` means valid. Number limits and the canonical #RRGGBB color format
 * are part of the declared contract rather than browser-only hints.
 */
export function getScriptPropValueValidationError(
  descriptor: ScriptPropDescriptor,
  value: unknown,
): string | null {
  if (
    descriptor.kind === "string" ||
    descriptor.kind === "asset" ||
    descriptor.kind === "entity"
  ) {
    return typeof value === "string" ? null : "文字列で指定してください";
  }
  if (descriptor.kind === "color") {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? null
      : "#RRGGBB形式の色で指定してください";
  }
  if (descriptor.kind === "enum") {
    if (typeof value !== "string") return "選択肢の文字列で指定してください";
    return !descriptor.options || descriptor.options.includes(value)
      ? null
      : `次の選択肢から指定してください: ${descriptor.options.join(", ")}`;
  }
  if (descriptor.kind === "boolean") {
    return typeof value === "boolean" ? null : "booleanで指定してください";
  }
  const validateNumber = (entry: unknown): string | null => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return "有限の数値で指定してください";
    }
    if (descriptor.min !== undefined && entry < descriptor.min) {
      return `${descriptor.min}以上で指定してください`;
    }
    if (descriptor.max !== undefined && entry > descriptor.max) {
      return `${descriptor.max}以下で指定してください`;
    }
    return null;
  };
  if (descriptor.kind === "number") return validateNumber(value);
  const length = descriptor.kind === "vec2" ? 2 : 3;
  if (!Array.isArray(value) || value.length !== length) {
    return `${length}要素の数値配列で指定してください`;
  }
  for (const entry of value) {
    const error = validateNumber(entry);
    if (error) return error;
  }
  return null;
}

/** Initial persisted values and explicit reference gates for a new component. */
export function createDefaultScriptComponentState(
  contract: ScriptContract,
): {
  properties: JsonObject;
  assetReferences: string[];
  entityReferences: string[];
} {
  const properties = createDefaultScriptProperties(contract);
  const references = (kind: "asset" | "entity") => [
    ...new Set(
      contract.props
        .filter((descriptor) => descriptor.kind === kind)
        .map((descriptor) => properties[descriptor.name])
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];
  return {
    properties,
    assetReferences: references("asset"),
    entityReferences: references("entity"),
  };
}

function fallbackDefault(descriptor: ScriptPropDescriptor): JsonValue {
  const numericFallback = Math.min(
    descriptor.max ?? Number.POSITIVE_INFINITY,
    Math.max(descriptor.min ?? Number.NEGATIVE_INFINITY, 0),
  );
  if (descriptor.kind === "number") return numericFallback;
  if (descriptor.kind === "boolean") return false;
  if (descriptor.kind === "enum") return descriptor.options?.[0] ?? "";
  if (descriptor.kind === "vec2") return [numericFallback, numericFallback];
  if (descriptor.kind === "vec3") {
    return [numericFallback, numericFallback, numericFallback];
  }
  if (descriptor.kind === "color") return "#ffffff";
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
  const kindMatch = /^prop\s*\.\s*([A-Za-z][A-Za-z0-9]*)\s*\(/.exec(value);
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

  const callBody =
    sliceBalanced(value, value.indexOf("(", kindMatch[0].length - 1)) ?? "";
  const objectStart = callBody.search(/\S/);
  const optionsBody =
    objectStart >= 0 && callBody[objectStart] === "{"
      ? (sliceBalanced(callBody, objectStart) ?? callBody)
      : callBody;
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
  if (kind === "enum" && (!options || options.length === 0)) {
    issues.push({
      code: "unreadable-prop-options",
      message: `${name} の options は空でない文字列リテラル配列で指定してください。`,
      propName: name,
    });
    return null;
  }
  if (options) descriptor.options = options;
  const rawDefault = readRawField(optionsBody, "default");
  if (rawDefault !== null) {
    const defaultValue = parseLiteral(rawDefault);
    if (
      defaultValue === undefined ||
      getScriptPropValueValidationError(descriptor, defaultValue) !== null
    ) {
      issues.push({
        code: "unreadable-prop-default",
        message: `${name} の default は ${kind} の静的なリテラルで指定してください。`,
        propName: name,
      });
      // Do not persist a guessed fallback. Leaving the property undeclared in
      // the static contract lets the executed Script use its actual default.
      return null;
    }
    descriptor.defaultValue = defaultValue;
  }
  return descriptor;
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
export function stripCommentsAndStrings(source: string): string {
  let output = "";
  let quote: string | null = null;
  let comment: "line" | "block" | null = null;
  let regex = false;
  let regexClass = false;
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
    if (regex) {
      if (char === "\\") {
        output += "  ";
        index += 1;
        continue;
      }
      if (char === "[") regexClass = true;
      else if (char === "]") regexClass = false;
      else if (char === "/" && !regexClass) {
        regex = false;
        output += " ";
        while (/[A-Za-z]/.test(source[index + 1] ?? "")) {
          output += " ";
          index += 1;
        }
        continue;
      }
      output += char === "\n" ? char : " ";
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
    if (char === "/" && isRegexLiteralStart(source, index)) {
      regex = true;
      regexClass = false;
      output += " ";
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

function isRegexLiteralStart(source: string, slashIndex: number): boolean {
  const prefix = source.slice(0, slashIndex);
  const previousIndex = prefix.search(/\S(?=\s*$)/);
  if (previousIndex < 0) return true;
  const previous = prefix[previousIndex]!;
  if ("([{,:;=!?&|+-*%^~<>".includes(previous)) return true;
  const word = prefix.slice(0, previousIndex + 1).match(/[A-Za-z_$][\w$]*$/)?.[0];
  return Boolean(
    word &&
      [
        "await",
        "case",
        "delete",
        "in",
        "instanceof",
        "of",
        "return",
        "throw",
        "typeof",
        "void",
        "yield",
      ].includes(word),
  );
}
