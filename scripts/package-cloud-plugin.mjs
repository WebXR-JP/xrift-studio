// Export a portable upload copy using the real, deployed MCP endpoint.
// Public review readiness still requires checking the saved portal draft.
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const [endpoint, output] = process.argv.slice(2);
if (!endpoint || !output) throw new Error('Usage: node scripts/package-cloud-plugin.mjs <deployed HTTPS /mcp URL> <output-directory>');
const url = new URL(endpoint);
if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !url.pathname.endsWith('/mcp')) throw new Error('Use the deployed HTTPS MCP endpoint without credentials, query or fragment');
const directory = path.resolve(output, 'xrift-studio');
await mkdir(directory, { recursive: true });
await cp(new URL('../plugins/xrift-studio', import.meta.url), directory, { recursive: true });
await writeFile(path.join(directory, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { 'xrift-studio': { type: 'streamable-http', url: url.href } } }, null, 2) + '\n');
console.log(directory);
