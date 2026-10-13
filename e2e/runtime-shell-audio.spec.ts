import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const silence = readFileSync(new URL("./fixtures/otogura-silence.ogg", import.meta.url));

for (const kind of ["item", "world"] as const) {
  test(`built ${kind} shell installs audio cleanup by itself and survives replay and teardown`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/e2e.html?scenario=ready");
    const manifest = await page.evaluate(async ({ kind, byteLength }) => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
      const { createAudioSourceComponent } = await load("/src/lib/visual-editor/scene-document.ts");
      const { compileVisualProject } = await load("/src/lib/visual-editor/compiler/compile.ts");
      const bundle = createPrototypeProject(kind, "Runtime shell audio teardown");
      const assetId = "asset-shell-audio";
      bundle.assets.assets[assetId] = { id: assetId, name: "Silent audio", kind: "audio", status: "ready",
        source: { kind: "project", relativePath: "Assets/silence.ogg" },
        importMetadata: { sourceFormat: "ogg", mimeType: "audio/ogg", byteLength } };
      const entity = Object.values(bundle.scene.entities).find((entity: any) => entity.components.some((component: any) => component.type === "mesh")) as any;
      if (!entity) throw new Error("The runtime audio fixture needs a Mesh Entity");
      entity.components.push({ ...createAudioSourceComponent("component-shell-audio", assetId, true), volume: 0, loop: true, autoplay: true });
      const compilation = compileVisualProject({ project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene },
        assets: bundle.assets, prefabs: bundle.prefabs }, { outputMode: "classic-runtime" });
      if (!compilation.canStage || !compilation.runtimeManifestFile) throw new Error(JSON.stringify(compilation.diagnostics));
      return compilation.runtimeManifestFile.content;
    }, { kind, byteLength: silence.byteLength });
    await page.route("**/xrift-runtime-shell/xrift-runtime.json", route => route.fulfill({ body: manifest, contentType: "application/json" }));
    await page.route("**/xrift-runtime-shell/*.ogg", route => route.fulfill({ body: silence, contentType: "audio/ogg" }));
    const result = await page.evaluate(async kind => {
      const url = "/e2e/vrm-mtoon-render.fixture.ts";
      const m = await import(/* @vite-ignore */ url);
      const T = m.THREE;
      m.extend(T);
      // No explicit installer and no other World/Item render precedes this one.
      const originalDisconnect = T.PositionalAudio.prototype.disconnect;
      const Component = await m.loadBuiltShellWorld(`${location.origin}/xrift-runtime-shell/remoteEntry.js`, kind === "item" ? "./Item" : "./World");
      const rounds = [];
      for (let round = 0; round < 2; round++) {
        const renderer = new T.WebGLRenderer(); renderer.setSize(64, 64);
        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(60, 1, 0.1, 100); camera.position.set(0, 2, 4);
        const root = m.createRoot(document.createElement("canvas"));
        await root.configure({ gl: renderer, scene, camera, frameloop: "never",
          size: { width: 64, height: 64, top: 0, left: 0 }, events: undefined });
        const authored = m.React.createElement(Component);
        const content = kind === "world" ? m.React.createElement(m.Physics, { paused: true }, authored) : authored;
        root.render(m.React.createElement(m.XRiftProvider, { baseUrl: `${location.origin}/xrift-runtime-shell/` }, content));
        let sound: import("three").PositionalAudio | undefined;
        for (let attempt = 0; attempt < 120; attempt++) {
          scene.traverse((object: import("three").Object3D) => { if (object instanceof T.PositionalAudio) sound = object as import("three").PositionalAudio; });
          if (sound?.buffer) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!sound?.buffer) throw new Error(`The built ${kind} shell did not load its Audio Source`);
        const automaticallyInstalled = T.PositionalAudio.prototype.disconnect !== originalDisconnect;
        sound.stop(); sound.disconnect(); sound.disconnect();
        sound.play();
        const replaying = sound.isPlaying;
        sound.stop(); sound.disconnect(); sound.disconnect();
        root.unmount();
        await new Promise(resolve => setTimeout(resolve, 50));
        rounds.push({ automaticallyInstalled, replaying });
        renderer.dispose();
      }
      return rounds;
    }, kind);
    expect(result).toEqual([{ automaticallyInstalled: true, replaying: true }, { automaticallyInstalled: true, replaying: true }]);
    expect(errors).toEqual([]);
  });
}
