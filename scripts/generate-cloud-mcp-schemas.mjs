// Reuse JSON-only tool definitions from the desktop MCP; omit native schema helpers.
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const rust = fs.readFileSync(new URL('src-tauri/src/mcp.rs', root), 'utf8').split('fn tool_definitions() -> Value {')[1].split('#[cfg(test)]')[0];
const registry = fs.readFileSync(new URL('src/lib/visual-editor/mcp-tool-registry.ts', root), 'utf8');
const documentNames = new Set([...registry.matchAll(/name: "([a-z_]+)", surface: "document"/g)].map((m) => m[1]));
const schemas = [];
// Top-level tools start at this exact indentation; nested property schemas do not.
for (const part of rust.split(/\n        \{\n            "name": /).slice(1)) {
  const candidate = '{"name": ' + part.slice(0, part.indexOf('\n        }') + '\n        }'.length);
  try {
    const parsed = JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
    if (documentNames.has(parsed.name)) schemas.push(parsed);
  } catch { /* Rust helper expressions need a native implementation; exclude them. */ }
}
if (schemas.length < 50 || !schemas.some((s) => s.name === 'create_primitive')) throw new Error('Cloud schema extraction failed');
const target = new URL('packages/xrift-studio-cloud/document-tools.json', root);
const text = JSON.stringify(schemas, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== text) throw new Error('Cloud MCP schemas are stale');
} else fs.writeFileSync(target, text);
console.log(`Cloud MCP: ${schemas.length} shared document schemas`);
