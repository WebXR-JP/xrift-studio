/** Uses the existing @playwright/test dev dependency; no production build.
 * node scripts/sky-shaders/verify-webgl.mjs [output-directory] [--thumbnails]
 */
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || path.join(os.tmpdir(), 'xrift-sky-shader-check'));
execFileSync(process.execPath, [path.join(here, 'check.cjs'), out], { stdio: 'inherit' });
const runChecks = createRequire(import.meta.url)('./webgl-checks.cjs');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SKY_CHROMIUM_PATH ? { executablePath: process.env.SKY_CHROMIUM_PATH } : {}),
  args: process.env.SKY_SOFTWARE_GL === '1'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.setContent(fs.readFileSync(path.join(out, 'sky-shader-gallery.html'), 'utf8'));
  await page.waitForFunction(() => !!window.skyGallery);
  const report = await page.evaluate(runChecks);
  report.pageErrors = pageErrors;
  fs.writeFileSync(path.join(out, 'webgl-check.json'), JSON.stringify(report, null, 2));
  if (report.failures.length || pageErrors.length) throw new Error('Sky shader checks failed; see webgl-check.json');
  if (process.argv.includes('--thumbnails')) {
    // Store thumbnails must use the application's Three.js Material path.
    execFileSync(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'),
      'test', 'e2e/sky-shaders.spec.ts', '--grep', '33 sky presets', '--reporter=line'], {
      cwd: root, stdio: 'inherit', env: { ...process.env, SKY_UPDATE_THUMBNAILS: '1' },
    });
  }
  console.log(JSON.stringify({ qualityRenders: report.qualityRenders.length, directionChecks: report.directionChecks, boundaryChecks: report.boundaryChecks, finiteChecks: report.finiteChecks, failures: report.failures.length, outputDirectory: out }));
} finally {
  await browser.close();
}
