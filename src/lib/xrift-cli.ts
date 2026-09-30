import { Command, type Child } from "@tauri-apps/plugin-shell";
import { platform } from "@tauri-apps/plugin-os";

import runtimePackageManifest from "../../packages/xrift-studio-runtime/package.json";
import { tauri, type ProjectKind, type RuntimePaths } from "./tauri";
import { COMPILER_REACT_PACKAGE_SPECS, COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC } from "./visual-editor/compiler/runtime-packages";

export type LogKind = "stdout" | "stderr" | "info" | "exit";
export type LogLine = { kind: LogKind; text: string; ts: number };

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/** The shell process was never created, so no remote operation could begin. */
export class CommandSpawnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandSpawnError";
  }
}

export type CompilerStagingTemplateRequest = {
  /** App-owned directory whose final segment is `xrift-studio-staging`. */
  compilerOwnedRoot: string;
  kind: ProjectKind;
  /** Must be the compiler-generated `xrift-studio-*` directory name. */
  directoryName: string;
};

/**
 * Re-exported for the publish pipeline. The spec itself lives with the
 * compiler so the Node CLI can read it without the Tauri bindings.
 */
export { COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC };

// The compiler overlays src/World.tsx or src/Item.tsx. Select the matching
// official template explicitly; CLI 0.24.4 defaults worlds to xrift-test-world.
const XRIFT_PROJECT_TEMPLATES: Record<ProjectKind, string> = {
  world: "WebXR-JP/xrift-world-template",
  item: "WebXR-JP/xrift-item-template",
};

/**
 * The npm specs publish staging and Classic export are allowed to install.
 *
 * This set has to cover everything the compiler can put in
 * `stagingPlan.runtimePackageSpecs`. A requested spec this set omits does not
 * fall back to anything: the publish stops before npm runs and the author is
 * told only "Invalid compiler runtime package request". That is what shipped
 * for `troika-three-text` — the Text component's compile step requested it
 * while this set still listed only the two older runtime packages, so every
 * world containing Text failed to publish.
 *
 * The optional runtime dependencies are read from the runtime package's own
 * manifest, which is the same source `TEXT_PANEL_RUNTIME_PACKAGE` and
 * `OPEN_BRUSH_RUNTIME_PACKAGE` derive their specs from. Bumping a version
 * there moves the request and the allowance together instead of letting them
 * drift apart again.
 */
const COMPILER_RUNTIME_PACKAGE_ALLOWLIST = new Set([
  `@pixiv/three-vrm@${runtimePackageManifest.dependencies["@pixiv/three-vrm"]}`,
  `three-icosa@${runtimePackageManifest.dependencies["three-icosa"]}`,
  `troika-three-text@${runtimePackageManifest.dependencies["troika-three-text"]}`,
  `${runtimePackageManifest.name}@${runtimePackageManifest.version}`,
  COMPILER_WORLD_COMPONENTS_PACKAGE_SPEC,
  ...COMPILER_REACT_PACKAGE_SPECS,
]);

/**
 * Whether publish staging may install `spec`.
 *
 * Exported so a fixture can assert the compiler never asks for a package the
 * installer would refuse, which is otherwise only discoverable by publishing.
 */
export function isAllowedCompilerRuntimePackage(spec: string): boolean {
  return COMPILER_RUNTIME_PACKAGE_ALLOWLIST.has(spec);
}

const stamp = (kind: LogKind, text: string): LogLine => ({
  kind,
  text,
  ts: Date.now(),
});

let cachedIsWindows: boolean | null = null;
async function isWindows(): Promise<boolean> {
  if (cachedIsWindows === null) {
    try {
      cachedIsWindows = (await platform()) === "windows";
    } catch {
      cachedIsWindows = navigator.userAgent.toLowerCase().includes("windows");
    }
  }
  return cachedIsWindows;
}

let cachedPaths: RuntimePaths | null = null;
async function getPaths(): Promise<RuntimePaths> {
  if (!cachedPaths) cachedPaths = await tauri.runtimePaths();
  return cachedPaths;
}

let cachedEnv: Record<string, string> | null = null;
async function getEnv(): Promise<Record<string, string>> {
  if (!cachedEnv) cachedEnv = await tauri.sandboxEnv();
  return cachedEnv;
}

export function clearCaches() {
  cachedPaths = null;
  cachedEnv = null;
}

type RunOptions = {
  bin: "xrift" | "node" | "npm" | "code";
  args: string[];
  cwd?: string;
  onLog: (line: LogLine) => void;
};

async function run({ bin, args, cwd, onLog }: RunOptions): Promise<RunResult> {
  const win = await isWindows();
  const paths = await getPaths();
  const env = await getEnv();

  let target: string;
  let actualArgs: string[];

  if (bin === "xrift") {
    // Use Studio's Node explicitly; the npm shim can resolve a different Node
    // from PATH even when the CLI package itself belongs to Studio.
    target = paths.nodeExe;
    actualArgs = [paths.xriftJs, ...args];
  } else if (bin === "node") {
    target = paths.nodeExe;
    actualArgs = args;
  } else if (bin === "npm") {
    target = paths.nodeExe;
    actualArgs = [paths.npmCliJs, ...args];
  } else {
    // code (system VS Code)
    target = "code";
    actualArgs = args;
  }

  const shellName = win ? "cmd" : "sh";
  const shellArgs = win
    ? ["/c", target, ...actualArgs]
    : [
        bin === "code" ? "-lc" : "-c",
        [target, ...actualArgs]
          .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
          .join(" "),
      ];

  onLog(
    stamp(
      "info",
      `$ ${bin} ${args.join(" ")}${cwd ? `  (cwd: ${cwd})` : ""}`,
    ),
  );

  const command = Command.create(shellName, shellArgs, { cwd, env });

  const stdoutBuf: string[] = [];
  const stderrBuf: string[] = [];

  command.stdout.on("data", (line: string) => {
    stdoutBuf.push(line);
    onLog(stamp("stdout", line));
  });
  command.stderr.on("data", (line: string) => {
    stderrBuf.push(line);
    onLog(stamp("stderr", line));
  });

  return await new Promise<RunResult>((resolve, reject) => {
    command.on("close", (data) => {
      const code = typeof data?.code === "number" ? data.code : -1;
      onLog(stamp("exit", `exit ${code}`));
      resolve({
        code,
        stdout: stdoutBuf.join("\n"),
        stderr: stderrBuf.join("\n"),
      });
    });
    command.on("error", (err) => {
      onLog(stamp("stderr", `error: ${err}`));
      reject(err);
    });
    command.spawn().catch((err) => {
      onLog(stamp("stderr", `spawn failed: ${err}`));
      reject(new CommandSpawnError(String(err)));
    });
  });
}

export type Whoami = {
  raw: string;
  displayName: string | null;
  id: string | null;
};

export function parseWhoami(text: string): Whoami | null {
  const stripped = text.replace(/\u001b\[[0-9;]*m/g, "").trim();
  if (!stripped) return null;

  // CLI 0.24.4 exits successfully for an invalid token as well as for a
  // missing token. Status text, not just the exit code, determines the state.
  // Exclude labelled fields so a user's display name is never a status.
  const status = stripped
    .split("\n")
    .filter((line) => !/^\s*(?:Display Name|User ID|Email)\s*[:：]/i.test(line))
    .join("\n");
  if (
    /not\s+logged\s*in|not\s+authenticated|please\s+(log|sign)\s*in|token\s+(?:is\s+)?invalid|invalid\s+token|ログインして|ログインされていません|認証されていません|未ログイン|no\s+session|no\s+token/i.test(
      status,
    )
  ) {
    return null;
  }

  const idMatch =
    stripped.match(/^\s*User ID\s*[:：]\s*(\S+)\s*$/im) ??
    stripped.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  const nameMatch = stripped.match(
    /^\s*(?:Display Name|Name|User(?:name)?|Logged in as|ユーザー名|ユーザ名)\s*[:：]\s*(\S[^\r\n]*)$/im,
  );
  const displayName = nameMatch?.[1].trim() || null;

  // Version notices and spinner messages are not account information.
  if (!displayName && !idMatch) return null;

  return { raw: stripped, displayName, id: idMatch?.[1] ?? null };
}

export const xrift = {
  login: (onLog: (l: LogLine) => void) =>
    run({ bin: "xrift", args: ["login"], onLog }),
  logout: (onLog: (l: LogLine) => void) =>
    run({ bin: "xrift", args: ["logout"], onLog }),
  version: async (onLog: (l: LogLine) => void): Promise<string | null> => {
    const r = await run({ bin: "xrift", args: ["--version"], onLog }).catch(
      () => null,
    );
    if (!r || r.code !== 0) return null;
    const clean = r.stdout.replace(/\u001b\[[0-9;]*m/g, "").trim();
    const m = clean.match(/\d+\.\d+\.\d+[\w\-.]*/);
    return m?.[0] ?? clean;
  },
  whoami: async (onLog: (l: LogLine) => void): Promise<Whoami | null> => {
    const result = await run({ bin: "xrift", args: ["whoami"], onLog }).catch(
      () => null,
    );
    if (!result || result.code !== 0) return null;
    return parseWhoami(result.stdout + "\n" + result.stderr);
  },
  createProject: (
    root: string,
    kind: ProjectKind,
    name: string,
    onLog: (l: LogLine) => void,
  ) =>
    run({
      bin: "xrift",
      args: ["create", kind, name, "--template", XRIFT_PROJECT_TEMPLATES[kind], "-y"],
      cwd: root,
      onLog,
    }),
  /**
   * Creates an XRift template only in a compiler-owned staging root. Overlay
   * application is a separate step; this function never receives or writes an
   * authoring project path.
   */
  createCompilerStagingTemplate: (
    request: CompilerStagingTemplateRequest,
    onLog: (line: LogLine) => void,
  ) => {
    assertCompilerStagingTarget(request);
    return run({
      bin: "xrift",
      // Keep the CLI's network-only template fetch separate from dependency
      // installation. The latter is run below through the same controlled
      // command boundary as the rest of the compiler staging pipeline.
      args: [
        "create",
        request.kind,
        request.directoryName,
        "--template",
        XRIFT_PROJECT_TEMPLATES[request.kind],
        "--skip-install",
        "-y",
      ],
      cwd: request.compilerOwnedRoot,
      onLog,
    });
  },
  installCompilerStagingDependencies: (
    projectPath: string,
    packageSpecs: readonly string[],
    onLog: (line: LogLine) => void,
  ) => {
    assertCompilerOwnedProjectPath(projectPath);
    if (
      packageSpecs.some(
        (spec) => !COMPILER_RUNTIME_PACKAGE_ALLOWLIST.has(spec),
      )
    ) {
      throw new Error("Invalid compiler runtime package request");
    }
    return run({
      bin: "npm",
      args: [
        "install",
        "--no-audit",
        "--no-fund",
        ...(packageSpecs.length > 0 ? ["--save-exact", ...packageSpecs] : []),
      ],
      cwd: projectPath,
      onLog,
    });
  },
  installClassicExportPackages: (
    projectPath: string,
    packageSpecs: readonly string[],
    onLog: (line: LogLine) => void,
  ) => {
    const normalizedPath = projectPath.trim();
    if (
      !normalizedPath ||
      normalizedPath.includes("\0") ||
      packageSpecs.length === 0 ||
      packageSpecs.some((spec) => !COMPILER_RUNTIME_PACKAGE_ALLOWLIST.has(spec))
    ) {
      throw new Error("Invalid Classic export package request");
    }
    return run({
      bin: "npm",
      args: [
        "install",
        "--save-exact",
        "--no-audit",
        "--no-fund",
        ...packageSpecs,
      ],
      cwd: normalizedPath,
      onLog,
    });
  },
  /**
   * Runs the staging project's own build, to recover the errors the check hid.
   *
   * `xrift check --build` reports a failed build as `Command failed: npm run
   * build` and keeps the compiler's output to itself, so the author is told a
   * build failed without being told why. Running the same build here puts the
   * real Vite and TypeScript diagnostics in front of them. Same staging guard
   * as every other command: this can only ever run in a compiler-owned
   * directory, never in an authoring project.
   */
  runCompilerStagingBuild: (
    projectPath: string,
    onLog: (line: LogLine) => void,
  ) => {
    assertCompilerOwnedProjectPath(projectPath);
    return run({
      bin: "npm",
      args: ["run", "build"],
      cwd: projectPath,
      onLog,
    });
  },
  checkItem: (projectPath: string, onLog: (l: LogLine) => void) =>
    run({
      bin: "xrift",
      // XRift CLI through 0.24.4 defines --build on both parent and subcommands.
      // Supplying a subcommand leaves the action's build option unset, so let
      // the CLI detect the single project kind from xrift.json instead.
      args: ["check", "--build"],
      cwd: projectPath,
      onLog,
    }),
  checkWorld: (projectPath: string, onLog: (l: LogLine) => void) =>
    run({
      bin: "xrift",
      args: ["check", "--build"],
      cwd: projectPath,
      onLog,
    }),
  upload: (
    projectPath: string,
    kind: ProjectKind,
    onLog: (l: LogLine) => void,
    verbose = false,
  ) =>
    run({
      bin: "xrift",
      args: verbose ? ["--verbose", "upload", kind] : ["upload", kind],
      cwd: projectPath,
      onLog,
    }),
};

export function assertCompilerStagingTarget(
  request: CompilerStagingTemplateRequest,
): void {
  const root = request.compilerOwnedRoot.trim().replace(/\\/g, "/");
  const finalSegment = root.split("/").filter(Boolean).pop();
  if (finalSegment !== "xrift-studio-staging") {
    throw new Error("Compiler staging root must end with xrift-studio-staging");
  }
  if (
    !/^xrift-studio-[a-z0-9._-]+$/i.test(request.directoryName) ||
    request.directoryName.includes("..")
  ) {
    throw new Error("Invalid compiler staging directory name");
  }
}

export function assertCompilerOwnedProjectPath(projectPath: string): void {
  const segments = projectPath
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  const directoryName = segments[segments.length - 1] ?? "";
  const parentName = segments[segments.length - 2] ?? "";
  if (
    parentName !== "xrift-studio-staging" ||
    !/^xrift-studio-[a-z0-9._-]+$/i.test(directoryName) ||
    directoryName.includes("..")
  ) {
    throw new Error("Compiler commands can only run in compiler staging");
  }
}

export async function openInVSCode(
  projectPath: string,
  onLog: (l: LogLine) => void,
): Promise<RunResult> {
  const result = await run({ bin: "code", args: [projectPath], onLog });
  if (result.code !== 0) {
    throw new Error(
      "VS Codeを起動できませんでした。VS Codeをインストールし、ターミナルでcodeコマンドを使えることを確認してください。",
    );
  }
  return result;
}

export async function openTerminal(
  projectPath: string,
  onLog: (l: LogLine) => void,
): Promise<void> {
  const os = platform();
  const env = await getEnv();
  onLog(stamp("info", `$ terminal  (cwd: ${projectPath})`));

  if (os === "windows" || os === "macos") {
    // Keep the user's path in cwd, outside the command string. In particular,
    // %, &, and quotes in a Windows folder name must never become cmd syntax.
    const command = os === "windows"
      ? Command.create("cmd", ["/d", "/c", 'where wt.exe >nul 2>nul && start "" wt.exe -d . || start "XRift Studio Terminal" cmd.exe /d /k'], { cwd: projectPath, env })
      : Command.create("sh", ["-c", 'open -a Terminal "$PWD"'], { cwd: projectPath, env });
    const result = await command.execute();
    if (result.stdout) onLog(stamp("stdout", result.stdout));
    if (result.stderr) onLog(stamp("stderr", result.stderr));
    onLog(stamp("exit", `exit ${result.code ?? -1}`));
    if (result.code !== 0) {
      throw new Error(`ターミナルを起動できませんでした。${result.stderr.trim()}`);
    }
    return;
  }

  if (os !== "linux") {
    throw new Error("このOSではターミナルを開く操作に対応していません。");
  }

  // The old non-Windows branch called macOS `open` on Linux too. Discover
  // an installed desktop terminal before spawning the long-lived GUI process.
  const candidates = ["gnome-terminal", "konsole", "xfce4-terminal", "x-terminal-emulator", "xterm"];
  const probe = await Command.create("sh", ["-c",
    'for terminal do if command -v "$terminal" >/dev/null 2>&1; then printf "%s" "$terminal"; exit 0; fi; done; exit 127',
    "xrift-terminal", ...candidates,
  ], { cwd: projectPath, env }).execute();
  const terminal = probe.stdout.trim();
  if (probe.code !== 0 || !candidates.includes(terminal)) {
    throw new Error("ターミナルが見つかりません。GNOME Terminal、Konsole、Xfce Terminal、xtermのいずれかをインストールしてください。");
  }
  const args = terminal === "gnome-terminal" || terminal === "xfce4-terminal"
    ? ["--working-directory", projectPath]
    : terminal === "konsole" ? ["--workdir", projectPath] : [];
  // Positional arguments preserve spaces and shell characters in the path.
  const command = Command.create("sh", ["-c", 'exec "$@"', "xrift-terminal", terminal, ...args], { cwd: projectPath, env });
  command.stdout.on("data", (line) => onLog(stamp("stdout", line)));
  command.stderr.on("data", (line) => onLog(stamp("stderr", line)));
  command.on("error", (error) => onLog(stamp("stderr", `terminal failed: ${error}`)));
  command.on("close", ({ code }) => {
    if (code !== 0) onLog(stamp("stderr", `terminal exited with code ${code ?? -1}`));
  });
  await command.spawn();
}

export type DevHandle = {
  child: Child;
  pid: number;
  stop: () => Promise<void>;
};

export async function startDevServer(
  projectPath: string,
  onLog: (l: LogLine) => void,
  onUrl: (url: string) => void,
): Promise<DevHandle> {
  const win = await isWindows();
  const paths = await getPaths();
  const env = await getEnv();

  const npmArgs = ["run", "dev"];
  const targetArgs = [paths.npmCliJs, ...npmArgs];
  const shellName = win ? "cmd" : "sh";
  const shellArgs = win
    ? ["/c", paths.nodeExe, ...targetArgs]
    : [
        "-c",
        [paths.nodeExe, ...targetArgs]
          .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
          .join(" "),
      ];

  onLog(stamp("info", `$ npm run dev  (cwd: ${projectPath})`));

  const command = Command.create(shellName, shellArgs, {
    cwd: projectPath,
    env,
  });

  let urlEmitted = false;
  const urlRe = /https?:\/\/localhost:\d+\S*/i;
  const handleLine = (line: string) => {
    if (urlEmitted) return;
    const stripped = line.replace(/\u001b\[[0-9;]*m/g, "");
    const m = stripped.match(urlRe);
    if (m) {
      urlEmitted = true;
      const url = m[0].replace(/\/$/, "") + "/";
      onUrl(url);
    }
  };

  command.stdout.on("data", (line: string) => {
    onLog(stamp("stdout", line));
    handleLine(line);
  });
  command.stderr.on("data", (line: string) => {
    onLog(stamp("stderr", line));
    handleLine(line);
  });
  command.on("close", (data) => {
    const code = typeof data?.code === "number" ? data.code : -1;
    onLog(stamp("exit", `dev server exit ${code}`));
  });
  command.on("error", (err) => {
    onLog(stamp("stderr", `dev error: ${err}`));
  });

  const child = await command.spawn();
  const pid = child.pid;

  const stop = async () => {
    try {
      await tauri.killPidTree(pid);
    } catch (e) {
      onLog(stamp("stderr", `kill_pid_tree failed: ${e}`));
    }
    try {
      await child.kill();
    } catch {
      // ignore
    }
  };

  return { child, pid, stop };
}
