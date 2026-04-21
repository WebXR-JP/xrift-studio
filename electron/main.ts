import { app, BrowserWindow, ipcMain, shell, protocol, net } from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawn, exec, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

let mainWindow: BrowserWindow | null = null;

// Projects root — ~/xrift-projects
const PROJECTS_ROOT = path.join(app.getPath("home"), "xrift-projects");

// Track running dev server processes
const devProcesses = new Map<number, ChildProcess>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:1420");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Register custom protocol for serving local files
function registerLocalFileProtocol() {
  protocol.handle("atom", (request) => {
    const url = new URL(request.url);
    // atom://local-file/<encoded-absolute-path>
    const filePath = decodeURIComponent(url.pathname.replace(/^\//, ""));
    return net.fetch(`file://${filePath}`);
  });
}

app.whenReady().then(() => {
  registerLocalFileProtocol();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Kill all dev server processes
  for (const [, proc] of devProcesses) {
    proc.kill("SIGTERM");
  }
  devProcesses.clear();

  if (process.platform !== "darwin") app.quit();
});

// ─── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle("get-versions", () => {
  return {
    appVersion: app.getVersion(),
    nodeVersion: process.versions.node,
  };
});

ipcMain.handle("get-projects-root", () => PROJECTS_ROOT);

ipcMain.handle("ensure-dir", async (_event, dirPath: string) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
});

ipcMain.handle("list-projects", async (_event, root: string) => {
  try {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      const projectPath = path.join(root, entry.name);
      let title: string | null = null;
      let description: string | null = null;
      try {
        const xriftJson = JSON.parse(
          await fs.promises.readFile(path.join(projectPath, "xrift.json"), "utf-8"),
        );
        title = xriftJson.title ?? null;
        description = xriftJson.description ?? null;
      } catch {
        // No xrift.json or invalid JSON
      }
      projects.push({
        name: entry.name,
        path: projectPath,
        title,
        description,
      });
    }
    return projects;
  } catch {
    return [];
  }
});

ipcMain.handle("list-files", async (_event, projectPath: string, rel: string) => {
  const dirPath = rel ? path.join(projectPath, rel) : projectPath;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    let size: number | null = null;
    if (!entry.isDirectory()) {
      try {
        const stat = await fs.promises.stat(path.join(dirPath, entry.name));
        size = stat.size;
      } catch {
        // ignore
      }
    }
    result.push({
      name: entry.name,
      rel: entryRel,
      isDir: entry.isDirectory(),
      size,
    });
  }
  // Sort: directories first, then alphabetically
  result.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });
  return result;
});

ipcMain.handle("read-text-file", async (_event, projectPath: string, rel: string) => {
  const filePath = path.join(projectPath, rel);
  return fs.promises.readFile(filePath, "utf-8");
});

ipcMain.handle("write-text-file", async (_event, projectPath: string, rel: string, content: string) => {
  const filePath = path.join(projectPath, rel);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, "utf-8");
});

ipcMain.handle("read-world-file", async (_event, projectPath: string) => {
  const filePath = path.join(projectPath, "xrift.json");
  return fs.promises.readFile(filePath, "utf-8");
});

ipcMain.handle("write-world-file", async (_event, projectPath: string, content: string) => {
  const filePath = path.join(projectPath, "xrift.json");
  await fs.promises.writeFile(filePath, content, "utf-8");
});

ipcMain.handle("read-thumbnail", async (_event, projectPath: string) => {
  const filePath = path.join(projectPath, "public", "thumbnail.png");
  try {
    const data = await fs.promises.readFile(filePath);
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
});

ipcMain.handle("write-thumbnail", async (_event, projectPath: string, dataUrl: string) => {
  const filePath = path.join(projectPath, "public", "thumbnail.png");
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
});

ipcMain.handle("read-image-data-url", async (_event, projectPath: string, rel: string) => {
  const filePath = path.join(projectPath, rel);
  const data = await fs.promises.readFile(filePath);
  const ext = path.extname(rel).toLowerCase().slice(1);
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    bmp: "image/bmp",
  };
  const mime = mimeMap[ext] ?? "application/octet-stream";
  return `data:${mime};base64,${data.toString("base64")}`;
});

ipcMain.handle("write-binary-file", async (_event, projectPath: string, rel: string, dataUrl: string) => {
  const filePath = path.join(projectPath, rel);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
});

ipcMain.handle("delete-path", async (_event, projectPath: string, rel: string) => {
  const target = path.join(projectPath, rel);
  await fs.promises.rm(target, { recursive: true, force: true });
});

ipcMain.handle("rename-path", async (_event, projectPath: string, oldRel: string, newRel: string) => {
  const oldPath = path.join(projectPath, oldRel);
  const newPath = path.join(projectPath, newRel);
  await fs.promises.mkdir(path.dirname(newPath), { recursive: true });
  await fs.promises.rename(oldPath, newPath);
});

ipcMain.handle("open-url", async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle("open-in-vscode", async (_event, projectPath: string) => {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    exec(`code "${projectPath}"`, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
});

ipcMain.handle("open-terminal", async (_event, projectPath: string) => {
  if (process.platform === "darwin") {
    spawn("open", ["-a", "Terminal", projectPath], { detached: true });
  } else if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "cmd.exe", "/k", `cd /d "${projectPath}"`], {
      detached: true,
      shell: true,
    });
  } else {
    // Linux — try common terminal emulators
    spawn("x-terminal-emulator", [], { cwd: projectPath, detached: true });
  }
});

ipcMain.handle("start-dev-server", async (event, projectPath: string) => {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCmd, ["run", "dev"], {
    cwd: projectPath,
    shell: true,
    env: { ...process.env },
  });

  const pid = child.pid!;
  devProcesses.set(pid, child);

  const urlRe = /https?:\/\/localhost:\d+\S*/i;
  let urlEmitted = false;

  const handleData = (stream: "stdout" | "stderr") => (data: Buffer) => {
    const text = data.toString();
    const lines = text.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      event.sender.send("dev-server-log", {
        kind: stream,
        text: line,
        ts: Date.now(),
      });
      if (!urlEmitted) {
        const stripped = line.replace(/\u001b\[[0-9;]*m/g, "");
        const match = stripped.match(urlRe);
        if (match) {
          urlEmitted = true;
          const url = match[0].replace(/\/$/, "") + "/";
          event.sender.send("dev-server-url", url);
        }
      }
    }
  };

  child.stdout?.on("data", handleData("stdout"));
  child.stderr?.on("data", handleData("stderr"));

  child.on("close", (code) => {
    devProcesses.delete(pid);
    event.sender.send("dev-server-log", {
      kind: "exit",
      text: `dev server exit ${code ?? -1}`,
      ts: Date.now(),
    });
  });

  return { pid };
});

ipcMain.handle("stop-dev-server", async (_event, pid: number) => {
  const proc = devProcesses.get(pid);
  if (proc) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/f", "/t"]);
    } else {
      process.kill(-pid, "SIGTERM");
    }
    devProcesses.delete(pid);
  }
});

ipcMain.handle("reset-app-data", async (_event, scope: string) => {
  if (scope === "all" || scope === "projects") {
    await fs.promises.rm(PROJECTS_ROOT, { recursive: true, force: true });
  }
  // For runtime scope, nothing to do in Electron mode (no separate runtime)
});
