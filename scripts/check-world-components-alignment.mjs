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

// World Play mounts the parts DevEnvironment composes rather than a Studio
// rewrite of them, so Play walks, jumps, grabs and aims by the same numbers a
// world author gets from `npm run dev`. Those parts are reached by path because
// the package's entry point exports only `DevEnvironment` itself, which opens
// its own Canvas and cannot be nested in the Scene View. A package upgrade that
// moves or renames them must fail here rather than at runtime, where the
// symptom is a Play session with no player in it.
const PLAY_PLAYER_MODULES = [
  "components/DevEnvironment/constants",
  "components/DevEnvironment/components/PhysicsPlayer",
  "components/DevEnvironment/components/Crosshair",
  "components/DevEnvironment/components/GrabSystem/index",
  "components/DevEnvironment/components/GrabSystem/store",
];

const missingPlayModules = PLAY_PLAYER_MODULES.filter((relativePath) =>
  ["js", "d.ts"].some(
    (extension) =>
      !fs.existsSync(
        path.join(
          repoRoot,
          "node_modules/@xrift/world-components/dist",
          `${relativePath}.${extension}`,
        ),
      ),
  ),
);

if (missingPlayModules.length > 0) {
  throw new Error(
    "World Play's player parts are missing from @xrift/world-components " +
      `${packageVersion}:\n${missingPlayModules.map((name) => `  dist/${name}`).join("\n")}\n` +
      "src/components/visual-editor/WorldPlayPlayer.tsx imports these by path. " +
      "Update the imports to the new layout, or take the parts from the " +
      "package's public entry point if it now exports them.",
  );
}

process.stdout.write(
  `@xrift/world-components aligned across editor, publish staging and shell: ${packageVersion}\n`,
);
process.stdout.write(
  `World Play player parts resolved: ${PLAY_PLAYER_MODULES.length} modules\n`,
);
