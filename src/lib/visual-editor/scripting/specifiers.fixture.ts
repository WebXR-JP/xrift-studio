import {
  collectScriptSpecifiers,
  describeScriptSpecifierRejection,
  isAllowedScriptSpecifier,
  isRemoteScriptSpecifier,
  rewriteScriptSpecifiers,
  type ScriptSpecifierResolution,
} from "./specifiers";

/** Filesystem-free assertions for Script import specifier handling. */
export function runScriptSpecifierFixtureAssertions(): void {
  assertCollection();
  assertRewrite();
  assertRejections();
  assertStringsUntouched();
}

function assertCollection(): void {
  const source = [
    `import { defineScript } from "xrift:script";`,
    `import * as THREE from 'three';`,
    `import { useFrame } from "@react-three/fiber";`,
    `export * from "./helpers";`,
    `const lazy = await import("https://esm.sh/canvas-confetti");`,
  ].join("\n");
  const found = collectScriptSpecifiers(source).map((use) => use.specifier);
  assertEqual(
    found.join(","),
    "xrift:script,three,@react-three/fiber,./helpers,https://esm.sh/canvas-confetti",
    "specifier collection missed or reordered a module",
  );
  assert(
    isAllowedScriptSpecifier("three") &&
      !isAllowedScriptSpecifier("node:fs"),
    "allowlist did not gate bare specifiers",
  );
  assert(
    isRemoteScriptSpecifier("https://esm.sh/x") &&
      !isRemoteScriptSpecifier("three"),
    "remote specifier detection is wrong",
  );
}

function assertRewrite(): void {
  const source = [
    `import { defineScript } from "xrift:script";`,
    `import * as THREE from 'three';`,
    `export { Vector3 } from "three";`,
  ].join("\n");
  const result = rewriteScriptSpecifiers(source, (specifier) =>
    isAllowedScriptSpecifier(specifier)
      ? { kind: "resolved", url: `blob:fake/${specifier}` }
      : { kind: "rejected", reason: "unknown-module" },
  );
  assertEqual(result.rejected.length, 0, "allowed specifiers were rejected");
  assert(
    result.source.includes(`from "blob:fake/xrift:script"`),
    "double-quoted specifier was not rewritten",
  );
  assert(
    result.source.includes(`from 'blob:fake/three'`),
    "single-quoted specifier was not rewritten or lost its quote style",
  );
  assert(
    !result.source.includes(`"three"`),
    "re-export specifier was left unrewritten",
  );
}

function assertRejections(): void {
  const source = [
    `import a from "https://esm.sh/a";`,
    `import b from "./b";`,
    `import c from "node:fs";`,
    `import d from "https://esm.sh/a";`,
  ].join("\n");
  const result = rewriteScriptSpecifiers(source, (specifier) => reject(specifier));
  assertEqual(
    result.rejected.length,
    3,
    "duplicate rejected specifiers were not collapsed",
  );
  assertEqual(
    result.rejected.map((entry) => entry.reason).join(","),
    "remote-not-allowed,relative-not-supported,unknown-module",
    "rejection reasons were misclassified",
  );
  assertEqual(
    result.source,
    source,
    "rejected specifiers must be left exactly as authored",
  );
  assert(
    describeScriptSpecifierRejection(
      "https://esm.sh/a",
      "remote-not-allowed",
    ).includes("公開はできません"),
    "remote rejection message does not state the publish limit",
  );
}

/**
 * The scan must not corrupt ordinary strings. `getAssetUrl("three")` is a
 * plausible line in a real script and has nothing to do with an import.
 */
function assertStringsUntouched(): void {
  const source = [
    `import * as THREE from "three";`,
    `const label = "imported from three";`,
    `ctx.log("three");`,
  ].join("\n");
  const result = rewriteScriptSpecifiers(source, (specifier) =>
    specifier === "three"
      ? { kind: "resolved", url: "blob:fake/three" }
      : { kind: "rejected", reason: "unknown-module" },
  );
  assert(
    result.source.includes(`const label = "imported from three";`),
    "a plain string containing 'from' was rewritten",
  );
  assert(
    result.source.includes(`ctx.log("three");`),
    "a plain string argument was rewritten",
  );
  assert(
    result.source.includes(`from "blob:fake/three"`),
    "the real import was not rewritten",
  );
}

function reject(specifier: string): ScriptSpecifierResolution {
  if (isRemoteScriptSpecifier(specifier)) {
    return { kind: "rejected", reason: "remote-not-allowed" };
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return { kind: "rejected", reason: "relative-not-supported" };
  }
  return { kind: "rejected", reason: "unknown-module" };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Script specifier fixture failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Script specifier fixture failed: ${message} (expected ${String(expected)}, got ${String(actual)})`,
    );
  }
}
