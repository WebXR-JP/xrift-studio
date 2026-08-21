// Fails when the @xrift/world-components versions drift apart.
//
// Three places must name the same version, and each one reaches authors
// through a different door:
//
//   * package.json `dependencies` — what the editor and Play run against.
//   * COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC (src/lib/xrift-cli.ts) — what a
//     published world's staging installs over the official template.
//   * WORLD_COMPONENTS_SPEC (scripts/build-world-runtime-shell.mjs) — what the
//     prebuilt web-upload shell bundles.
//
// When they disagree, a world that works in Play can fail its publish build or
// run against different Components after upload, and nothing surfaces that
// until an author hits it. The drift shipped once (package.json moved to
// 0.47.0 while both specs stayed at 0.43.0), so the invariant is enforced
// here instead of by comments alone.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const packageVersion = JSON.parse(read("package.json")).dependencies?.[
  "@xrift/world-components"
];
if (!packageVersion || /[~^<>*x]/i.test(packageVersion)) {
  throw new Error(
    `package.json must pin @xrift/world-components to an exact version (found ${packageVersion ?? "nothing"})`,
  );
}

const specPattern = /@xrift\/world-components@([0-9][^"']*)/;

const compilerSpec = read("src/lib/xrift-cli.ts").match(specPattern)?.[1];
const shellSpec = read("scripts/build-world-runtime-shell.mjs").match(
  specPattern,
)?.[1];

const mismatches = [
  ["src/lib/xrift-cli.ts COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC", compilerSpec],
  ["scripts/build-world-runtime-shell.mjs WORLD_COMPONENTS_SPEC", shellSpec],
].filter(([, version]) => version !== packageVersion);

if (mismatches.length > 0) {
  const lines = mismatches
    .map(([label, version]) => `  ${label} = ${version ?? "missing"}`)
    .join("\n");
  throw new Error(
    `@xrift/world-components versions drifted. package.json = ${packageVersion}\n${lines}\n` +
      "Published worlds must build and run against the same version Play uses. " +
      "Update the stale spec(s) to match package.json.",
  );
}

process.stdout.write(
  `@xrift/world-components aligned across editor, publish staging and shell: ${packageVersion}\n`,
);
