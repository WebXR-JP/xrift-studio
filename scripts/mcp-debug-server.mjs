import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const isWindows = process.platform === "win32";
const pnpmCommand = isWindows ? "pnpm.cmd" : "pnpm";
const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : pnpmCommand;
const argumentsForCommand = isWindows
  ? ["/d", "/s", "/c", `${pnpmCommand} --silent dlx @hypothesi/tauri-mcp-server`]
  : ["--silent", "dlx", "@hypothesi/tauri-mcp-server"];

// Keep this wrapper free of stdout logging: stdout is the MCP JSON-RPC stream.
const server = spawn(
  command,
  argumentsForCommand,
  {
    cwd: repositoryRoot,
    stdio: "inherit",
    windowsHide: true,
  },
);

const forwardSignal = (signal) => {
  if (!server.killed) server.kill(signal);
};

process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));

server.once("error", (error) => {
  console.error(`XRift Studio Tauri MCP server could not start: ${error.message}`);
  process.exitCode = 1;
});

server.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
