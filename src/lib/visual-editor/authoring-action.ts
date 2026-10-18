import { sha256Utf8 } from "./compiler/hash";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Revision and routing are admission facts, not a change in the requested
 * action. Only a digest of the remaining complete arguments is retained. */
export function authoringActionFingerprint(tool: string, args: unknown): string {
  const body = args !== null && typeof args === "object" && !Array.isArray(args)
    ? Object.fromEntries(Object.entries(args).filter(([key]) => !["projectId", "sceneId", "expectedRevision"].includes(key))) : args;
  return sha256Utf8(JSON.stringify(canonical({ tool, arguments: body })));
}
