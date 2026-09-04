import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile, realpath, stat } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';

export async function attachCaptureImage(result, directory) {
  if (result.isError) return result;
  if (!directory) throw new Error('Configure captureDirectory for XRift image access.');
  const root = await realpath(directory);
  const file = await realpath(result.structuredContent.path);
  const rel = relative(root, file);
  if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) {
    throw new Error('Capture is outside captureDirectory.');
  }
  const info = await stat(file);
  if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('Invalid capture file size.');
  const bytes = await readFile(file);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Capture must be a PNG.');
  }
  return { ...result, content: [...(result.content ?? []), { type: 'image', mimeType: 'image/png', data: bytes.toString('base64') }] };
}

// A deliberately small stdio transport for the existing XRift MCP binary.
export class McpClient {
  constructor(command, args = [], { signal, timeoutMs = 60000 } = {}) {
    this.pending = new Map();
    this.sequence = 0;
    this.timeoutMs = timeoutMs;
    this.process = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true, signal });
    this.failure = null;
    const fail = error => {
      this.failure = error;
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    };
    this.process.on('error', fail);
    this.process.stdin.on('error', fail);
    this.process.on('exit', () => fail(new Error('MCP process exited.')));
    this.lines = createInterface({ input: this.process.stdout });
    this.lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { fail(new Error('Invalid MCP JSON.')); return; }
      if (message.method && message.id !== undefined) {
        this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id,
          error: { code: -32601, message: 'Client requests are not supported.' } }) + '\n');
        return;
      }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }
  request(method, params) {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async initialize() {
    const server = await this.request('initialize', {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'xrift-world-harness-prototype', version: '0.1.0' },
    });
    this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return server;
  }
  close() { this.lines.close(); this.process.kill(); }
}

async function askModel(command, args, input, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args ?? [], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true, signal });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Model adapter timed out.')); }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.stdin.on('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', data => {
      output += data;
      if (output.length > 4 * 1024 * 1024) { child.kill(); reject(new Error('Model action exceeds 4 MiB.')); }
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Model adapter exited with ${code}.`));
      try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export async function create({ config, signal }) {
  // Effects are supplied by the operator, not guessed from tool name prefixes.
  if (!config.effects || !config.cameras?.spawn || !config.cameras?.iso || !config.model?.command) {
    throw new Error('Configure effects, spawn/iso cameras and the model command.');
  }
  const scope = config.captureArguments;
  if (!scope?.projectId || !scope?.sceneId ||
      ['spawn', 'iso'].some(view => config.cameras[view].projectId !== scope.projectId || config.cameras[view].sceneId !== scope.sceneId)) {
    throw new Error('Both cameras and captureArguments must target the same project and scene.');
  }
  const client = new McpClient(config.mcp.command, config.mcp.args, { signal });
  try {
    const server = await client.initialize();
    const call = (name, args) => client.request('tools/call', { name, arguments: args });
    return {
      model: { next: ({ signal: nextSignal, ...input }) => askModel(config.model.command, config.model.args,
        { ...input, instructions: server.instructions ?? '', protocol: ACTION_PROTOCOL }, nextSignal,
        config.model.timeoutMs ?? 120000) },
      tools: {
        async context() {
          const result = await call('get_editor_context', {});
          const context = result.structuredContent;
          if (result.isError || context?.projectId !== scope.projectId || context?.sceneId !== scope.sceneId ||
              !Number.isInteger(context.revision)) throw new Error('Open the configured project and scene before continuing.');
          return { projectId: context.projectId, sceneId: context.sceneId, revision: context.revision, editorMode: context.editorMode };
        },
        async list() {
          const tools = [];
          let cursor;
          do {
            const page = await client.request('tools/list', cursor ? { cursor } : {});
            tools.push(...page.tools);
            cursor = page.nextCursor;
          } while (cursor);
          return tools.filter(tool => Object.hasOwn(config.effects, tool.name))
            .map(tool => ({ ...tool, effect: config.effects[tool.name] }));
        },
        call(name, args) {
          if ((args.projectId && args.projectId !== scope.projectId) || (args.sceneId && args.sceneId !== scope.sceneId)) {
            return { isError: true, content: [{ type: 'text', text: 'The call targets another project or scene.' }] };
          }
          return call(name, args);
        },
        async capture(view) {
          const camera = await call('set_scene_view_camera', config.cameras[view]);
          if (camera.isError) return camera;
          return attachCaptureImage(await call('capture_scene_view', config.captureArguments ?? {}), config.captureDirectory);
        },
      },
      close: () => client.close(),
    };
  } catch (error) { client.close(); throw error; }
}

const ACTION_PROTOCOL = `Return one JSON object, without markdown.
Actions:
{"type":"tool","name":"tool_name","arguments":{}}
{"type":"capture","view":"spawn"} or view "iso"
{"type":"review","criterion":"exact criterion","passed":true,"reason":"specific observations from both images and any required metrics"}
{"type":"finish","summary":"result and remaining limitations"}
{"type":"pause","reason":"approval, login, publication or user input required"}
Read the blueprint, server instructions, tool descriptions and all results. Preserve projectId, sceneId and revision checks.
Image content is in result events: render it as actual image input to the model, never replace it with a text description of bytes.
After edits capture both views and review every criterion. Failed reviews require further work. Do not bypass approval gates.`;
