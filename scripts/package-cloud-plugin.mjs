// Export publication materials; the Site's existing plugin is installed separately.
// An export neither provisions OAuth nor makes a public review ready to submit.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const [endpoint, output] = process.argv.slice(2);
if (!endpoint || !output) throw new Error('Usage: node scripts/package-cloud-plugin.mjs <deployed HTTPS /mcp URL> <output-directory>');
const url = new URL(endpoint);
if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !url.pathname.endsWith('/mcp')) throw new Error('Use the deployed HTTPS MCP endpoint without credentials, query or fragment');
const directory = path.resolve(output, 'xrift-studio');
await mkdir(path.dirname(directory), { recursive: true });
// Never merge into an older archive that could retain a private .app.json or token.
try { await mkdir(directory); } catch (error) {
  if (error.code === 'EEXIST') throw new Error('Output already contains xrift-studio; choose a fresh output directory');
  throw error;
}
await cp(new URL('../plugins/xrift-studio', import.meta.url), directory, {
  recursive: true,
  filter: source => path.basename(source) !== '.app.json',
});
const manifestPath = path.join(directory, 'plugin.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
delete manifest.apps;
if (manifest.extensions?.['com.openai']) delete manifest.extensions['com.openai'].apps;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(directory, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { 'xrift-studio': { type: 'streamable-http', url: url.href } } }, null, 2) + '\n');
console.log(directory);
console.log('Publication export only. Install/connect the existing Site plugin; confirm OAuth and scan in the saved submission draft.');
