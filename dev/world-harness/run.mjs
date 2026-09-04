import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { runHarness } from './harness.mjs';

const file = process.argv[2];
if (!file) throw new Error('Usage: node dev/world-harness/run.mjs <config.json>');
const configPath = resolve(file);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const base = dirname(configPath);
const adapter = await import(pathToFileURL(resolve(base, config.adapter)).href);
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
const runtime = await adapter.create({ config, signal: controller.signal });
try {
  const result = await runHarness({ ...runtime, goal: config.goal,
    journal: resolve(base, config.journal), maxSteps: config.maxSteps ?? 30, signal: controller.signal });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'complete') process.exitCode = 2;
} finally {
  await runtime.close?.();
}
