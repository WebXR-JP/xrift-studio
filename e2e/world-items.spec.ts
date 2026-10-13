import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test.beforeAll(() => {
  execFileSync(process.execPath, ["e2e/world-items.prepare.cjs"], { stdio: "pipe" });
});

for (const width of [1280, 390]) {
  test(`Code World Item declarations validate and preserve existing configuration at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e.html?scenario=ready");
    await page.evaluate(async () => {
      const path = "/e2e/world-items.fixture.tsx";
      const m = await import(/* @vite-ignore */ path);
      const host = document.createElement("div"); host.id = "world-item-config";
      host.style.cssText = "position:fixed;inset:0;z-index:9999;background:white;display:flex";
      host.dataset.writes = "0"; document.body.append(host);
      const original = { world: { id: "existing-world", title: "Existing", items: ["12345678-1234-1234-1234-123456789abc"], ignore: ["custom/*"], permissions: { allowedDomains: ["example.com"] }, custom: { preserved: true } }, item: { id: "other-item", custom: true } };
      m.tauri.readTextFile = async () => JSON.stringify(original);
      m.tauri.writeTextFile = async (_project: string, _path: string, text: string) => {
        host.dataset.writes = String(Number(host.dataset.writes) + 1);
        if (host.dataset.fail === "true") { host.dataset.fail = "false"; throw new Error("fixture write failed"); }
        host.dataset.saved = text;
      };
      m.createDomRoot(host).render(m.React.createElement(m.ToastProvider, null, m.React.createElement(m.XriftJsonEditor, { projectPath: "C:/isolated/world-item-fixture", projectKind: "world", onOpenRaw() {} })));
    });
    const host = page.locator("#world-item-config");
    const ids = host.getByRole("textbox", { name: "Item ID（world.items）" });
    const save = host.getByRole("button", { name: /保存/ });
    await expect(ids).toHaveValue("12345678-1234-1234-1234-123456789abc");
    await ids.fill("https://app.xrift.net/marketplace/invalid");
    await expect(ids).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeDisabled();
    await ids.press("Control+s");
    await expect(host).toHaveAttribute("data-writes", "0");
    const many = Array.from({ length: 51 }, (_, index) => `${index.toString(16).padStart(8, "0")}-1234-1234-1234-123456789abc`).join("\n");
    await ids.fill(many);
    await expect(host.getByRole("alert")).toContainText("50種類");
    await expect(save).toBeDisabled();
    const value = "12345678-1234-1234-1234-123456789ABC\n12345678-1234-1234-1234-123456789abc\n22345678-1234-1234-1234-123456789abc";
    await ids.fill(value);
    await page.evaluate(() => { document.getElementById("world-item-config")!.dataset.fail = "true"; });
    await save.click();
    await expect(page.getByText("保存に失敗しました", { exact: true })).toBeVisible();
    await expect(ids).toHaveValue(value);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(host).toHaveAttribute("data-writes", "2");
    const saved = JSON.parse((await host.getAttribute("data-saved"))!);
    expect(saved.world.items).toEqual(["12345678-1234-1234-1234-123456789abc", "22345678-1234-1234-1234-123456789abc"]);
    expect(saved.world.id).toBe("existing-world");
    expect(saved.world.ignore).toEqual(["custom/*"]);
    expect(saved.world.permissions).toEqual({ allowedDomains: ["example.com"] });
    expect(saved.world.custom).toEqual({ preserved: true });
    expect(saved.item).toEqual({ id: "other-item", custom: true });
    await ids.fill(""); await save.click();
    await expect(host).toHaveAttribute("data-writes", "3");
    expect(JSON.parse((await host.getAttribute("data-saved"))!).world.items).toEqual([]);
    await page.screenshot({ path: `${test.info().outputDir}/item-settings.png`, fullPage: true });
  });
}

test("Item loader coalesces requests, retries failures and rejects invalid inputs", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const path = "/src/lib/visual-editor/xrift-item-loader.ts";
    const { createStudioItemLoader } = await import(/* @vite-ignore */ path);
    const id = "12345678-1234-1234-1234-123456789abc";
    let resolves = 0; let imports = 0; let inits = 0; let exports = "";
    let fail = true;
    const Item = () => null;
    const loader = createStudioItemLoader(async () => {
      resolves++;
      if (fail) throw new Error("offline");
      return "https://items.example/version/remoteEntry.js";
    }, async () => { imports++; return { init: async () => { inits++; }, get: async (name: string) => { exports = name; return () => ({ Item }); } }; }, async () => ({}));
    await loader.load(id).catch(() => undefined);
    fail = false;
    const a = loader.load(id); const b = loader.load(id.toUpperCase());
    const samePromise = a === b;
    const loaded = await a;
    await loader.load("../invalid").catch(() => undefined);
    const emptyIds = await Promise.all([undefined, null, "", 42].map(value => {
      try { return loader.load(value as string).then(() => false, () => true); }
      catch { return false; }
    }));
    const bad = createStudioItemLoader(async () => "file:///secret", async () => { throw new Error("should not import"); });
    const rejectedUrl = await bad.load(id).then(() => false, () => true);
    return { resolves, imports, inits, exports, samePromise, sceneUrl: loaded.sceneUrl, rejectedUrl, emptyIds };
  });
  expect(result).toEqual({ resolves: 2, imports: 1, inits: 1, exports: "./Item", samePromise: true, sceneUrl: "https://items.example/version/remoteEntry.js", rejectedUrl: true, emptyIds: [true, true, true, true] });
});

test("PositionalAudio cleanup tolerates replay and teardown while preserving playback", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { THREE: T } = await load("/e2e/world-items.fixture.tsx");
    const { installPositionalAudioCleanup } = await load("/packages/xrift-studio-runtime/src/positional-audio-cleanup.ts");
    installPositionalAudioCleanup(); installPositionalAudioCleanup();
    const listener = new T.AudioListener();
    const sound = new T.PositionalAudio(listener);
    sound.disconnect(); sound.disconnect();
    sound.setBuffer(listener.context.createBuffer(1, 441, 44100));
    sound.play(); sound.stop(); sound.disconnect(); sound.disconnect();
    sound.play(); const playing = sound.isPlaying;
    sound.stop(); sound.disconnect(); sound.disconnect();
    // Only the already-removed panner edge is tolerated; unexpected defects surface.
    const original = sound.panner.disconnect;
    sound.panner.disconnect = () => { throw new Error("unexpected cleanup failure"); };
    let propagated = false;
    try { sound.disconnect(); } catch (error) { propagated = String(error).includes("unexpected cleanup failure"); }
    sound.panner.disconnect = original;
    sound.gain.disconnect(); listener.gain.disconnect();
    return { playing, propagated };
  });
  expect(result).toEqual({ playing: true, propagated: true });
  expect(errors).toEqual([]);
});

test("Item Inspector edits IDs and offers retry without saving preview credentials", async ({ page }) => {
  await page.goto("/editor.html");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const m = await load("/e2e/world-items.fixture.tsx");
    const { createXriftComponent } = await load("/src/lib/visual-editor/component-registry.ts");
    const component = createXriftComponent("xrift.item", { componentId: "inspector-item" });
    const host = document.createElement("div"); host.id = "item-inspector";
    host.style.cssText = "position:fixed;inset:0;z-index:9999;background:white;padding:24px;overflow:auto";
    document.body.append(host);
    const root = m.createDomRoot(host);
    const render = () => {
      host.dataset.document = JSON.stringify(component);
      root.render(m.React.createElement(m.XRiftComponentInspector, { component, readOnly: false, onPropertyChange: (key: string, value: unknown) => { component.properties[key] = value; render(); }, onEnabledChange() {}, onRemove() {} }));
    };
    render();
  });
  const inspector = page.locator("#item-inspector");
  const placement = inspector.getByRole("textbox", { name: "Placement ID", exact: true });
  const originalPlacement = await placement.inputValue();
  expect(originalPlacement).toMatch(/^item-/);
  await expect(inspector.getByRole("button", { name: "Itemを再読み込み" })).toBeEnabled();
  await inspector.getByRole("textbox", { name: "Item ID", exact: true }).fill("12345678-1234-1234-1234-123456789abc");
  await inspector.getByLabel("Itemプレビュー用APIキー").fill("fixture-preview-key");
  await inspector.getByRole("button", { name: "Itemを再読み込み" }).click();
  await expect(inspector).toHaveAttribute("data-document", /12345678-1234-1234-1234-123456789abc/);
  await expect(placement).toHaveValue(originalPlacement);
  expect(await inspector.getAttribute("data-document")).not.toContain("fixture-preview-key");
  expect(await inspector.getAttribute("data-document")).not.toContain("previewApiKey");
});

test("Official Item renderer and compiled placement draw the same local Item and preserve its context", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const m = await load("/e2e/world-items.fixture.tsx");
    const published = await load("/node_modules/.cache/xrift-studio/world-items-parity/Item.tsx");
    const T = m.THREE; m.extend(T);
    async function render(placement: unknown) {
      const renderer = new T.WebGLRenderer(); renderer.setSize(64, 64);
      const target = new T.WebGLRenderTarget(64, 64);
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera.position.z = 3; camera.manual = true;
      const scene = new T.Scene(); scene.background = new T.Color("black");
      const root = m.createRoot(renderer.domElement);
      await root.configure({ gl: renderer, scene, camera, frameloop: "never", flat: true, linear: true, size: { width: 64, height: 64, top: 0, left: 0 }, events: undefined });
      const loader = { load: async () => ({ Item: m.LocalTestItem, sceneUrl: "https://items.example/version/remoteEntry.js" }) };
      root.render(m.React.createElement(m.XRiftProvider, { baseUrl: "https://worlds.example/", itemLoaderImplementation: loader }, placement));
      let itemName = "";
      for (let attempt = 0; attempt < 80 && !itemName; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        scene.traverse((object: import("three").Object3D) => { if (object.name.startsWith("parity-placement|")) itemName = object.name; });
      }
      renderer.setRenderTarget(target); renderer.render(scene, camera);
      const pixels = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
      root.unmount(); target.dispose(); renderer.dispose();
      return { pixels: [...pixels], itemName };
    }
    const editor = await render(m.React.createElement(m.OfficialXriftComponentRenderer, { component: published.component }));
    const generated = await render(m.React.createElement(published.PublishedPlacement));
    return { same: JSON.stringify(editor.pixels) === JSON.stringify(generated.pixels), redPixels: editor.pixels.filter((value, index) => index % 4 === 0 && value > 200).length, editorName: editor.itemName, publishedName: generated.itemName };
  });
  expect(errors).toEqual([]);
  expect(result.same).toBe(true);
  expect(result.redPixels).toBeGreaterThan(100);
  expect(result.editorName).toBe("parity-placement|null|https://items.example/version/");
  expect(result.publishedName).toBe(result.editorName);
});
