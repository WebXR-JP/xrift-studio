import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultPackageManager, DefaultResourceLoader, createCodemodeExtension, createToolSearchExtension, type ExtensionFactory, type SettingsManager } from "@earendil-works/pi-coding-agent";

export type InstalledPackage = { source: string; path: string };
/** Pi loads its own search, codemode and explicitly registered package resources. */
export async function createStudioResources(packages: InstalledPackage[] = [], directory: string | undefined, settings: SettingsManager, systemPrompt: string, extensions: ExtensionFactory[] = []) {
  const temporary = !directory;
  const root = directory ?? await mkdtemp(join(tmpdir(), "xrift-pi-"));
  await mkdir(root, { recursive: true, mode: 0o700 });
  const dispose = async () => { if (temporary) await rm(root, { recursive: true, force: true }); };
  try {
    const manager = new DefaultPackageManager({ cwd: root, agentDir: root, settingsManager: settings });
    const paths = packages.length ? (await manager.resolveExtensionSources(packages.map(item => item.path), { temporary: true })).extensions.filter(item => item.enabled).map(item => item.path) : [];
    if (packages.length && !paths.length) throw new Error("登録したパッケージに制作拡張がありません");
    const loader = new DefaultResourceLoader({ cwd: root, agentDir: root, settingsManager: settings, systemPrompt,
      noContextFiles: true, noSkills: true, noPromptTemplates: true, noThemes: true,
      additionalExtensionPaths: paths, extensionFactories: [createCodemodeExtension({ models: false }), createToolSearchExtension(), ...extensions] });
    await loader.reload();
    const errors = loader.getExtensions().errors;
    if (errors.length) throw new Error(`制作拡張を読み込めませんでした：${errors.map(item => item.error).join(" / ").slice(0, 1000)}`);
    return { loader, dispose };
  } catch (error) { await dispose(); throw error; }
}
