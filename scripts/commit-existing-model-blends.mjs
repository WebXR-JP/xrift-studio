import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function managedPath(root, relative) {
  if (!relative.startsWith('assets/imported/') || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..' || p.includes(':'))) throw new Error('Invalid managed path');
  const target = path.join(root, relative);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (stat?.isSymbolicLink()) throw new Error('Linked asset paths are not supported');
  }
  return target;
}

export async function commitExistingBlends(preparedDirectory) {
  const prepared = await fs.realpath(preparedDirectory);
  const report = JSON.parse(await fs.readFile(path.join(prepared, 'report.json'), 'utf8'));
  const root = await fs.realpath(report.project);
  const manifestPath = path.join(root, 'assets', 'assets.json');
  if ((await fs.lstat(path.join(root, 'assets'))).isSymbolicLink() || (await fs.lstat(manifestPath)).isSymbolicLink()) throw new Error('Linked manifest is not supported');
  const original = await fs.readFile(manifestPath);
  if (hash(original) !== report.manifestSha256) throw new Error('Project changed after preparation; prepare again');
  const oldManifest = JSON.parse(original);
  const candidateBytes = await fs.readFile(path.join(prepared, 'candidate-assets.json'));
  const candidate = JSON.parse(candidateBytes);
  const expected = structuredClone(oldManifest);
  const copies = [];
  const seen = new Set();
  for (const model of report.models) {
    const asset = expected.assets[model.id];
    if (seen.has(model.id) || asset?.kind !== 'model' || asset.blenderSource || asset.source.kind !== 'project' || asset.source.relativePath !== model.source) throw new Error('Invalid model candidate');
    seen.add(model.id);
    if (!model.blend.endsWith('.blend')) throw new Error('Expected Blender source');
    const sourcePath = await managedPath(root, model.source);
    if (hash(await fs.readFile(sourcePath)) !== model.sourceSha256) throw new Error('Model changed after preparation');
    const bytes = await fs.readFile(await managedPath(prepared, model.blend));
    if (hash(bytes) !== model.blendSha256 || hash(bytes) !== model.verifiedBlendSha256) throw new Error('Blender source must pass roundtrip verification');
    copies.push({target: await managedPath(root, model.blend), bytes});
    asset.blenderSource = {kind: 'project', relativePath: model.blend};
  }
  if (JSON.stringify(expected) !== JSON.stringify(candidate)) throw new Error('Candidate changes more than Blender sources');
  if (!copies.length) return {models: 0};
  // Immutable source copies first; a failure never installs a partial manifest.
  for (const {target, bytes} of copies) {
    await fs.mkdir(path.dirname(target), {recursive: true});
    try { await fs.writeFile(target, bytes, {flag: 'wx'}); }
    catch (error) {
      if (error.code !== 'EEXIST' || hash(await fs.readFile(target)) !== hash(bytes)) throw error;
    }
  }
  const temporary = manifestPath + '.' + randomUUID() + '.tmp';
  const backup = manifestPath + '.before-blender-' + randomUUID() + '.bak';
  await fs.writeFile(temporary, candidateBytes, {flag: 'wx'});
  try {
    if (hash(await fs.readFile(manifestPath)) !== hash(original)) throw new Error('Project changed during conversion; close Studio and prepare again');
    await fs.writeFile(backup, original, {flag: 'wx'});
    await fs.rename(temporary, manifestPath);
  } catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
  return {models: copies.length, backup};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/commit-existing-model-blends.mjs <prepared-directory> (close Studio first)');
  console.log(JSON.stringify(await commitExistingBlends(process.argv[2])));
}
