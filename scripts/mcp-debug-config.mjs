import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(scriptDirectory, "mcp-debug-server.mjs");

// The absolute path makes the output usable from clients whose working
// directory is not the XRift Studio repository.
const configuration = {
  mcpServers: {
    "xrift-studio-debug": {
      command: process.execPath,
      args: [serverPath],
    },
  },
};

process.stdout.write(`${JSON.stringify(configuration, null, 2)}\n`);
