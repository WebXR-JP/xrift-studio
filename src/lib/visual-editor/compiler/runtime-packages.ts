/**
 * The `@xrift/world-components` version a Classic output is built against.
 *
 * The official XRift template declares its own range, so a world exported from
 * Studio would otherwise type-check and bundle against a different version
 * than the one Studio Play runs. That breaks the Play/publish parity contract
 * in docs/SCRIPTING.md: a Component or Hook that exists in Play is missing at
 * build time. Publish staging installs this spec over the template, and the
 * Classic export (desktop dialog and `xrift-studio convert`) records it in the
 * target's package.json for the same reason.
 *
 * Lives here, away from the Tauri shell bindings, because the CLI runs in
 * plain Node and must read the same spec without pulling in `@tauri-apps/*`.
 *
 * Update this together with `@xrift/world-components` in package.json. The two
 * must always name the same version — `pnpm cli:test` fails when they drift
 * (scripts/check-world-components-alignment.mjs).
 */
export const COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC =
  "@xrift/world-components@0.47.0";

/** Splits an exact npm spec (`name@version`) into its two halves. */
export function parsePackageSpec(spec: string): { name: string; version: string } {
  const splitAt = spec.lastIndexOf("@");
  if (splitAt <= 0 || splitAt === spec.length - 1) {
    throw new Error(`Invalid exact package spec: ${spec}`);
  }
  return { name: spec.slice(0, splitAt), version: spec.slice(splitAt + 1) };
}

/**
 * Whether a declared dependency range already reaches `required`.
 *
 * Only the numeric part of the declared range is compared: `^0.47.0`,
 * `~0.47.2` and `0.48.0` all satisfy a `0.47.0` requirement, while `^0.43.0`
 * does not. Anything that is not a plain version (a git URL, a tag, a
 * workspace link) is treated as not satisfying, so the export pins it.
 */
export function declaredVersionReaches(
  declared: string | undefined,
  required: string,
): boolean {
  if (typeof declared !== "string") return false;
  const parse = (value: string): number[] | null => {
    const match = value.trim().match(/^[\^~>=\s]*v?(\d+)\.(\d+)\.(\d+)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  const have = parse(declared);
  const need = parse(required);
  if (!have || !need) return false;
  for (let index = 0; index < 3; index += 1) {
    if (have[index] !== need[index]) return have[index] > need[index];
  }
  return true;
}
