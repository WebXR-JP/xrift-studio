import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultResourceLoader, createCodemodeExtension, createToolSearchExtension, type ExtensionFactory, type SettingsManager } from "@earendil-works/pi-coding-agent";

/** Load only Studio's search, codemode and context hooks. */
export async function createStudioResources(directory: string | undefined, settings: SettingsManager, systemPrompt: string, extensions: ExtensionFactory[] = []) {
  const temporary = !directory;
  const root = directory ?? await mkdtemp(join(tmpdir(), "xrift-pi-"));
  await mkdir(root, { recursive: true, mode: 0o700 });
  const dispose = async () => { if (temporary) await rm(root, { recursive: true, force: true }); };
  try {
    const loader = new DefaultResourceLoader({ cwd: root, agentDir: root, settingsManager: settings, systemPrompt,
      noContextFiles: true, noSkills: true, noPromptTemplates: true, noThemes: true, noExtensions: true,
      extensionFactories: [createCodemodeExtension({ models: false }), createToolSearchExtension(), ...extensions] });
    await loader.reload();
    const errors = loader.getExtensions().errors;
    if (errors.length) throw new Error(`制作ツールを読み込めませんでした：${errors.map(item => item.error).join(" / ").slice(0, 1000)}`);
    return { loader, dispose };
  } catch (error) { await dispose(); throw error; }
}
