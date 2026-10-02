import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

for (const config of ['vite.preview.config.ts', 'vite.chatgpt.config.ts', 'vite.sites.config.ts']) {
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', config], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const clientOutput = resolve('dist/client');
if (!clientOutput.startsWith(resolve('.') + sep) || clientOutput !== resolve('dist', 'client')) throw new Error('Invalid generated output path');
rmSync(clientOutput, { recursive: true, force: true });
mkdirSync(clientOutput, { recursive: true });
cpSync('preview-dist', 'dist/client', { recursive: true });
cpSync('chatgpt-dist', 'dist/client', { recursive: true });
let appHtml = readFileSync('chatgpt-dist/chatgpt.html', 'utf8');
appHtml = appHtml.replace(/<script\b[^>]*src="\.\/([^\"]+)"[^>]*><\/script>/g, (_, path) => {
  // Keep exactly the common editor code, but fit the host's HTML resource limit.
  // Decode locally; no anonymous request to the private Site is required.
  const source = readFileSync(`chatgpt-dist/${path}`);
  const packed = gzipSync(source, { level: 9 });
  if (!gunzipSync(packed).equals(source)) throw new Error('Editor package integrity failed');
  return `<script type="module">
try {
  const packed = Uint8Array.from(atob('${packed.toString('base64')}'), char => char.charCodeAt(0));
  const source = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const entry = document.createElement('script'); entry.type = 'module'; entry.textContent = source; document.head.appendChild(entry);
} catch (error) {
  const root = document.getElementById('root'); root.textContent = 'Studioを読み込めませんでした。プラグインを開き直してください。'; root.setAttribute('role', 'alert'); console.error(error);
}
</script>`;
});
appHtml = appHtml.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="\.\/([^\"]+)"[^>]*>/g, (_, path) =>
  `<style>${readFileSync(`chatgpt-dist/${path}`, 'utf8').replace(/<\/style/gi, '<\\/style')}</style>`);
if (Buffer.byteLength(appHtml) >= 10 * 1024 * 1024) throw new Error('ChatGPT HTML resource exceeds the release budget');
writeFileSync('dist/client/chatgpt.html', appHtml);
// The public website opens the official introduction. The MCP resource keeps
// chatgpt.html for the host bridge, and editor.html runs without that bridge.
copyFileSync('dist/client/preview.html', 'dist/client/index.html');
mkdirSync('dist/.openai', { recursive: true });
copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Sites Worker and editor assets are ready.');
