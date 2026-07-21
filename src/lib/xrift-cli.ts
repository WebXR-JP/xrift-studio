import { Command, type Child } from "@tauri-apps/plugin-shell";
import { platform } from "@tauri-apps/plugin-os";
import { tauri, type ProjectKind, type RuntimePaths } from "./tauri";

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

const COMPILER_RUNTIME_PACKAGE_ALLOWLIST = new Set([
  "three-icosa@0.4.2-alpha.18",
  "xrift-studio-runtime@0.1.0",
]);

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
    target = paths.xriftCmd;
    actualArgs = args;
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
        "-lc",
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

function parseWhoami(text: string): Whoami | null {
  const stripped = text.replace(/\u001b\[[0-9;]*m/g, "").trim();
  if (!stripped) return null;

  // Detect "not logged in" states
  if (
    /not\s+logged\s*in|not\s+authenticated|please\s+(log|sign)\s*in|ログインして|ログインされていません|認証されていません|未ログイン|no\s+session|no\s+token/i.test(
      stripped,
    )
  ) {
    return null;
  }

  const idMatch = stripped.match(
    /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
  );

  let displayName: string | null = null;
  const nameLine = stripped
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /(name|user|logged|ログイン|ユーザ)/i.test(l));
  if (nameLine) {
    const m = nameLine.match(/[:：]\s*(\S[^\(]*?)(?:\s*\(|\s*$)/);
    if (m) {
      const candidate = m[1].trim();
      if (!/^(not|no|未|none)$/i.test(candidate)) {
        displayName = candidate;
      }
    }
  }
  if (!displayName) {
    const words = stripped.split(/\s+/).filter((w) => w.length > 2);
    for (const w of words) {
      if (/^(not|null|none|undefined|error|please|you|must|first)$/i.test(w))
        continue;
      if (/^[a-zA-Z][\w\-_.]+$/.test(w)) {
        displayName = w;
        break;
      }
    }
  }

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
      args: ["create", kind, name, "-y"],
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
      args: ["create", request.kind, request.directoryName, "-y"],
      cwd: request.compilerOwnedRoot,
      onLog,
    });
  },
  installCompilerRuntimePackages: (
    projectPath: string,
    packageSpecs: readonly string[],
    onLog: (line: LogLine) => void,
  ) => {
    assertCompilerOwnedProjectPath(projectPath);
    if (
      packageSpecs.length === 0 ||
      packageSpecs.some((spec) => !COMPILER_RUNTIME_PACKAGE_ALLOWLIST.has(spec))
    ) {
      throw new Error("Invalid compiler runtime package request");
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
  checkItem: (projectPath: string, onLog: (l: LogLine) => void) =>
    run({
      bin: "xrift",
      args: ["check", "item", "--build"],
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
    throw new Error("Runtime packages can only be installed in compiler staging");
  }
}

export async function openInVSCode(
  projectPath: string,
  onLog: (l: LogLine) => void,
): Promise<RunResult> {
  return run({ bin: "code", args: [projectPath], onLog });
}

export async function openTerminal(
  projectPath: string,
  onLog: (l: LogLine) => void,
): Promise<void> {
  const win = await isWindows();
  const env = await getEnv();
  onLog(stamp("info", `$ terminal  (cwd: ${projectPath})`));

  if (win) {
    // Prefer Windows Terminal if available; fall back to cmd.
    try {
      const wt = Command.create("cmd", ["/c", "start", "", "wt.exe", "-d", projectPath], { env });
      await wt.spawn();
      return;
    } catch {
      // ignore and fall through
    }
    const fallback = Command.create(
      "cmd",
      ["/c", "start", "XRift Studio Terminal", "cmd.exe", "/k", `cd /d "${projectPath}"`],
      { env },
    );
    await fallback.spawn();
    return;
  }

  // macOS
  const mac = Command.create(
    "sh",
    ["-lc", `open -a Terminal '${projectPath.replace(/'/g, "'\\''")}'`],
    { env },
  );
  await mac.spawn();
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
        "-lc",
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
