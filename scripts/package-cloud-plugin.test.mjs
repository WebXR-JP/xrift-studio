import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('./package-cloud-plugin.mjs', import.meta.url);
const run = (endpoint, output) => spawnSync(process.execPath, [script.pathname, endpoint, output], { encoding: 'utf8' });

test('publication export uses the actual HTTPS endpoint and preserves a previous output', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'xrift-plugin-export-'));
  try {
    const exported = run('https://studio.example/mcp', output);
    assert.equal(exported.status, 0, exported.stderr);
    const directory = path.join(output, 'xrift-studio');
    const mcp = JSON.parse(await readFile(path.join(directory, 'mcp.json'), 'utf8'));
    assert.deepEqual(mcp.mcpServers['xrift-studio'], { type: 'streamable-http', url: 'https://studio.example/mcp' });
    const manifest = JSON.parse(await readFile(path.join(directory, 'plugin.json'), 'utf8'));
    assert.equal(manifest.apps, undefined);
    assert.equal(manifest.extensions['com.openai'].apps, undefined);
    assert.equal((await readdir(directory)).includes('.app.json'), false);
    assert.equal(manifest.extensions['com.openai'].interface.category, 'Creativity');
    await writeFile(path.join(directory, 'keep.txt'), 'previous output');
    const repeated = run('https://other.example/mcp', output);
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /fresh output directory/);
    assert.equal(await readFile(path.join(directory, 'keep.txt'), 'utf8'), 'previous output');
    assert.equal(JSON.parse(await readFile(path.join(directory, 'mcp.json'), 'utf8')).mcpServers['xrift-studio'].url, 'https://studio.example/mcp');
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('publication export rejects credentials and non-MCP endpoints', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'xrift-plugin-invalid-'));
  try {
    for (const endpoint of ['http://studio.example/mcp', 'https://user:password@studio.example/mcp', 'https://studio.example/mcp?token=secret', 'https://studio.example/editor.html']) {
      assert.notEqual(run(endpoint, output).status, 0);
    }
    assert.deepEqual(await readdir(output), []);
  } finally { await rm(output, { recursive: true, force: true }); }
});
