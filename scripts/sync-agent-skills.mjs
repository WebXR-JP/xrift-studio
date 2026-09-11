import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node scripts/sync-agent-skills.mjs [--check]');
const source = join(root, '.agents/skills');
const target = join(root, '.claude/skills');
let differences = 0;
async function sync(from, to) {
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name), dst = join(to, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'agents') await sync(src, dst); continue; }
    if (!entry.isFile()) throw new Error(`Unsupported entry: ${src}`);
    const content = await readFile(src);
    let previous;
    try { previous = await readFile(dst); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous?.equals(content)) continue;
    differences++;
    console.log(`${check ? 'DIFF' : 'SYNC'} ${dst.slice(root.length)}`);
    if (!check) { await mkdir(dirname(dst), { recursive: true }); await writeFile(dst, content); }
  }
}
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isDirectory()) await sync(join(source, entry.name), join(target, entry.name));
}
// Deliberately preserve client-only skills and files; deletion requires an explicit review.
console.log(`${differences} differences${check ? '' : ' synchronized'}`);
if (check && differences) process.exitCode = 1;
