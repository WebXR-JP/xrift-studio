/**
 * Builds the runtime shell that lets Studio publish worlds from a browser.
 *
 * An XRift world is a Module Federation remote: the official template builds
 * `dist/remoteEntry.js` exposing `./World`, and XRift's player loads it with
 * react/three/@xrift/world-components supplied as shared singletons. A browser
 * cannot produce a federated bundle, which is why web upload needs a shell
 * built ahead of time.
 *
 * The shell is world-agnostic. Its `World` renders nothing but
 * `<XriftWorld manifest=... />`, so the scene lives entirely in
 * `xrift/runtime.json` and one shell can host any Studio scene — swap the JSON
 * and the assets, keep the same code.
 *
 *   node scripts/build-world-runtime-shell.mjs --out public/xrift-runtime-shell
 *
 * Requires network and npm. Release-time tooling, not part of `pnpm dev`.
 *
 * Verified against @xrift/cli's world template on 2026-08-15. Two things in
 * here are not obvious and were found by building it:
 *
 * 1. The manifest URL must derive from `import.meta.url`. The runtime resolves
 *    a relative manifest against `document.baseURI`, which inside XRift is the
 *    player page — so a relative or absolute path silently loads the wrong
 *    origin and the world renders empty.
 * 2. `vite-plugin-dts` is dropped. It fails to load under pnpm's strict
 *    resolution (`@rollup/pluginutils` has no `createFilter` export for it),
 *    and an uploaded world has no use for `.d.ts` files anyway.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_PACKAGE_DIR = path.join(repoRoot, "packages", "xrift-studio-runtime");
/**
 * Keep in step with COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC in
 * src/lib/xrift-cli.ts — `pnpm cli:test` fails when they drift
 * (scripts/check-world-components-alignment.mjs).
 */
const WORLD_COMPONENTS_SPEC = "@xrift/world-components@0.47.0";
const SHELL_ENTRY = "remoteEntry.js";
const RUNTIME_CONTRACT_SOURCE = path.join(
  RUNTIME_PACKAGE_DIR,
  "src",
  "schema.ts",
);

/**
 * Scene data and per-world files never belong in the shell: the shell is the
 * fixed part, and shipping a sample thumbnail or manifest would overwrite the
 * real ones at upload time.
 */
const EXCLUDED_FROM_SHELL = new Set([
  "xrift/runtime.json",
  "thumbnail.png",
  "index.html",
]);

/** The world-agnostic entry that replaces the template's sample world. */
const SHELL_WORLD_SOURCE = `import type { FC } from "react";
import { XriftWorld } from "xrift-studio-runtime/react-three-fiber";

export interface WorldProps {
  position?: [number, number, number];
  scale?: number;
}

// The runtime resolves a relative manifest against document.baseURI, which
// inside XRift is the player page, not this world's storage path. Deriving the
// URL from import.meta.url pins it to wherever this chunk was uploaded.
const MANIFEST_URL = new URL("./xrift/runtime.json", import.meta.url).href;

export const World: FC<WorldProps> = ({ position = [0, 0, 0], scale = 1 }) => (
  <group position={position} scale={scale}>
    <XriftWorld manifest={MANIFEST_URL} />
  </group>
);
`;

function parseArguments(argv) {
  const options = { out: path.join("public", "xrift-runtime-shell"), keepTemp: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out") options.out = argv[++index] ?? options.out;
    else if (argument === "--keep-temp") options.keepTemp = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)),
    );
  });
}

async function collectFiles(root, prefix = "") {
  const found = [];
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await collectFiles(root, relative)));
    else found.push(relative);
  }
  return found;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      "Usage: node scripts/build-world-runtime-shell.mjs [--out <dir>] [--keep-temp]\n",
    );
    return 0;
  }

  const outputDir = path.resolve(repoRoot, options.out);
  const runtimeContract = await readRuntimeContractVersion();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "xrift-shell-"));
  const projectName = "xrift-studio-runtime-shell";
  const projectDir = path.join(tempRoot, projectName);

  try {
    process.stdout.write("1/6 XRift公式テンプレートを取得しています\n");
    await run(
      "npx",
      ["--yes", "@xrift/cli", "create", "world", projectName, "--skip-install", "-y"],
      tempRoot,
    );

    process.stdout.write("2/6 テンプレートをシェル用に置き換えています\n");
    await fs.writeFile(
      path.join(projectDir, "src", "World.tsx"),
      SHELL_WORLD_SOURCE,
      "utf8",
    );
    // The sample world's components and assets would otherwise be built into
    // every published world.
    await fs.rm(path.join(projectDir, "src", "components"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(projectDir, "src", "constants.ts"), { force: true });
    for (const sample of ["duck.glb", "bunny.drc", "tokyo-station.jpg"]) {
      await fs.rm(path.join(projectDir, "public", sample), { force: true });
    }
    await removeDtsPlugin(path.join(projectDir, "vite.config.ts"));

    process.stdout.write("3/6 xrift-studio-runtime をパックしています\n");
    await run("npm", ["pack", "--pack-destination", tempRoot], RUNTIME_PACKAGE_DIR);
    const tarball = (await fs.readdir(tempRoot)).find((name) => name.endsWith(".tgz"));
    if (!tarball) throw new Error("xrift-studio-runtime のtarballを作成できませんでした");

    process.stdout.write("4/6 依存関係をインストールしています\n");
    await run("npm", ["install", "--no-audit", "--no-fund"], projectDir);
    await run(
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--save-exact",
        WORLD_COMPONENTS_SPEC,
        path.join(tempRoot, tarball),
      ],
      projectDir,
    );

    process.stdout.write("5/6 シェルをビルドしています\n");
    await run("npm", ["run", "build"], projectDir);

    process.stdout.write("6/6 シェル成果物を書き出しています\n");
    const distDir = path.join(projectDir, "dist");
    const built = await collectFiles(distDir);
    // Apply the template's own ignore rules with the SDK's matcher so the
    // shell holds exactly what an upload would send. That drops the
    // __federation_shared_* chunks (~5 MB), which XRift's player supplies as
    // shared singletons rather than reading from the world.
    const { filterFiles, DEFAULT_IGNORE_PATTERNS } = await import("@xrift/sdk");
    const templateConfig = JSON.parse(
      await fs.readFile(path.join(projectDir, "xrift.json"), "utf8"),
    );
    const shellFiles = filterFiles(
      built.filter(
        (file) => !EXCLUDED_FROM_SHELL.has(file) && !file.endsWith(".map"),
      ),
      [...DEFAULT_IGNORE_PATTERNS, ...(templateConfig.world?.ignore ?? [])],
    );
    if (!shellFiles.includes(SHELL_ENTRY)) {
      throw new Error(
        `ビルド結果に ${SHELL_ENTRY} がありません。テンプレートのfederation設定を確認してください。`,
      );
    }

    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });
    const digest = createHash("sha256");
    let totalBytes = 0;
    for (const file of shellFiles.sort()) {
      const bytes = await fs.readFile(path.join(distDir, file));
      const target = path.join(outputDir, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
      digest.update(file).update(bytes);
      totalBytes += bytes.byteLength;
    }

    // Content-derived so a changed shell is detectable and an identical
    // rebuild stays stable.
    const version = digest.digest("hex").slice(0, 12);
    await fs.writeFile(
      path.join(outputDir, "shell-manifest.json"),
      `${JSON.stringify(
        {
          version,
          runtimeContract,
          entry: SHELL_ENTRY,
          files: shellFiles.sort(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    process.stdout.write(
      `\nランタイムシェルを書き出しました\n  出力: ${path.relative(repoRoot, outputDir)}\n  version: ${version}\n  ファイル数: ${shellFiles.length}\n  合計: ${(totalBytes / 1024 / 1024).toFixed(2)} MB\n`,
    );
    return 0;
  } finally {
    if (options.keepTemp) {
      process.stdout.write(`一時ディレクトリを残しました: ${tempRoot}\n`);
    } else {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function readRuntimeContractVersion() {
  const source = await fs.readFile(RUNTIME_CONTRACT_SOURCE, "utf8");
  const match = source.match(
    /XRIFT_RUNTIME_CONTRACT_VERSION\s*=\s*[\r\n\s]*"([^"]+)"/,
  );
  if (!match?.[1]) {
    throw new Error(
      `Runtime contract version could not be read from ${RUNTIME_CONTRACT_SOURCE}`,
    );
  }
  return match[1];
}

/** See the note at the top of this file for why dts has to go. */
async function removeDtsPlugin(configPath) {
  const source = await fs.readFile(configPath, "utf8");
  const patched = source
    .replace(/^\s*import dts from 'vite-plugin-dts'\r?\n/m, "")
    .replace(/\s*dts\(\{[^}]*\}\),/, "");
  await fs.writeFile(configPath, patched, "utf8");
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exit(1);
  },
);
