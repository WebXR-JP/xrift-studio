import { expect, test } from "@playwright/test";

test("JSX Scriptをreact/jsx-runtime bridge経由で読み込める", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready");

  const result = await page.evaluate(async (moduleUrl) => {
    const runtime = (await import(moduleUrl)) as {
      loadScriptModule(
        source: string,
        fileName: string,
      ): Promise<
        | {
            ok: true;
            module: Record<string, unknown>;
            objectUrl: string;
          }
        | { ok: false; message: string }
      >;
      releaseAllScriptModules(): void;
    };
    const loaded = await runtime.loadScriptModule(
      `import { defineScript } from "xrift:script";

export function Render() {
  return <group name="jsx-bridge-fixture" />;
}

export default defineScript({
  name: "JSX Bridge Fixture",
});
`,
      "jsx-bridge-fixture.tsx",
    );
    if (!loaded.ok) return loaded;

    try {
      const render = loaded.module.Render;
      const element =
        typeof render === "function"
          ? (render() as {
              type?: unknown;
              props?: { name?: unknown };
            })
          : null;
      return {
        ok: true as const,
        scriptName: (
          loaded.module.default as { name?: unknown } | undefined
        )?.name,
        elementType: element?.type,
        elementName: element?.props?.name,
      };
    } finally {
      runtime.releaseAllScriptModules();
    }
  }, "/src/lib/script-modules.ts");

  expect(result).toEqual({
    ok: true,
    scriptName: "JSX Bridge Fixture",
    elementType: "group",
    elementName: "jsx-bridge-fixture",
  });
});

test("Stop後はblob moduleだけを破棄しTypeScript変換結果を再利用する", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready");

  const result = await page.evaluate(async (moduleUrl) => {
    const runtime = (await import(moduleUrl)) as {
      loadScriptModule(
        source: string,
        fileName: string,
      ): Promise<
        | {
            ok: true;
            module: Record<string, unknown>;
            objectUrl: string;
          }
        | { ok: false; message: string }
      >;
      releaseAllScriptModules(): void;
      clearScriptTranspileCache(): void;
      getScriptTranspileCacheStats(): {
        hits: number;
        misses: number;
        size: number;
      };
    };
    const source = `import { defineScript } from "xrift:script";

export default defineScript({
  name: "Replay Cache Fixture",
});
`;
    runtime.clearScriptTranspileCache();
    const first = await runtime.loadScriptModule(
      source,
      "replay-cache-fixture.ts",
    );
    if (!first.ok) return first;
    const firstStats = runtime.getScriptTranspileCacheStats();
    const firstUrl = first.objectUrl;
    runtime.releaseAllScriptModules();

    const second = await runtime.loadScriptModule(
      source,
      "replay-cache-fixture.ts",
    );
    if (!second.ok) return second;
    const secondStats = runtime.getScriptTranspileCacheStats();
    const secondUrl = second.objectUrl;
    runtime.releaseAllScriptModules();

    return {
      ok: true as const,
      firstStats,
      secondStats,
      freshModuleUrl: firstUrl !== secondUrl,
    };
  }, "/src/lib/script-modules.ts");

  expect(result).toEqual({
    ok: true,
    firstStats: { hits: 0, misses: 1, size: 1 },
    secondStats: { hits: 1, misses: 1, size: 1 },
    freshModuleUrl: true,
  });
});

test("Play変換は構文エラーの行と列を返す", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");

  const result = await page.evaluate(async (moduleUrl) => {
    const runtime = (await import(moduleUrl)) as {
      loadScriptModule(
        source: string,
        fileName: string,
      ): Promise<
        | {
            ok: true;
            module: Record<string, unknown>;
            objectUrl: string;
          }
        | { ok: false; message: string }
      >;
      releaseAllScriptModules(): void;
    };
    const loaded = await runtime.loadScriptModule(
      `import { defineScript } from "xrift:script";

export default defineScript({
  name: "Broken Diagnostic",
  start( {
});
`,
      "broken-diagnostic.ts",
    );
    runtime.releaseAllScriptModules();
    return loaded.ok
      ? { ok: true as const }
      : { ok: false as const, message: loaded.message };
  }, "/src/lib/script-modules.ts");

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.message).toMatch(/^\d+:\d+ /);
  }
});

test("外部ModelテンプレートをTSX moduleとして変換できる", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready");

  const result = await page.evaluate(async ({ runtimeUrl, templatesUrl }) => {
    const runtime = (await import(runtimeUrl)) as {
      loadScriptModule(
        source: string,
        fileName: string,
      ): Promise<
        | {
            ok: true;
            module: Record<string, unknown>;
            objectUrl: string;
          }
        | { ok: false; message: string }
      >;
      releaseAllScriptModules(): void;
    };
    const templates = (await import(templatesUrl)) as {
      createScriptTemplateSource(
        templateId: string,
        scriptName: string,
      ): string | null;
      getScriptTemplate(
        templateId: string,
      ): { language?: unknown } | undefined;
    };
    const source = templates.createScriptTemplateSource(
      "model-display",
      "Model Fixture",
    );
    if (!source) return { ok: false as const, message: "template missing" };
    const loaded = await runtime.loadScriptModule(
      source,
      "model-fixture.tsx",
    );
    if (!loaded.ok) return loaded;

    try {
      return {
        ok: true as const,
        language: templates.getScriptTemplate("model-display")?.language,
        scriptName: (
          loaded.module.default as { name?: unknown } | undefined
        )?.name,
        hasRender: typeof loaded.module.Render === "function",
      };
    } finally {
      runtime.releaseAllScriptModules();
    }
  }, {
    runtimeUrl: "/src/lib/script-modules.ts",
    templatesUrl:
      "/src/lib/visual-editor/scripting/script-templates.ts",
  });

  expect(result).toEqual({
    ok: true,
    language: "tsx",
    scriptName: "Model Fixture",
    hasRender: true,
  });
});

test("組み込みScriptテンプレートをすべてPlay用moduleへ変換できる", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready");

  const result = await page.evaluate(async ({ runtimeUrl, templatesUrl }) => {
    const runtime = (await import(runtimeUrl)) as {
      loadScriptModule(
        source: string,
        fileName: string,
      ): Promise<
        | {
            ok: true;
            module: Record<string, unknown>;
            objectUrl: string;
          }
        | { ok: false; message: string }
      >;
      releaseAllScriptModules(): void;
    };
    const templates = (await import(templatesUrl)) as {
      SCRIPT_TEMPLATE_CATALOG: readonly {
        id: string;
        language: "ts" | "tsx";
      }[];
      createScriptTemplateSource(
        templateId: string,
        scriptName: string,
      ): string | null;
    };
    const failures: { id: string; message: string }[] = [];
    const loadedNames: string[] = [];

    try {
      for (const template of templates.SCRIPT_TEMPLATE_CATALOG) {
        const name = `Fixture ${template.id}`;
        const source = templates.createScriptTemplateSource(
          template.id,
          name,
        );
        if (!source) {
          failures.push({ id: template.id, message: "template missing" });
          continue;
        }
        const loaded = await runtime.loadScriptModule(
          source,
          `${template.id}.${template.language}`,
        );
        if (!loaded.ok) {
          failures.push({ id: template.id, message: loaded.message });
          continue;
        }
        const loadedName = (
          loaded.module.default as { name?: unknown } | undefined
        )?.name;
        if (loadedName !== name) {
          failures.push({
            id: template.id,
            message: `unexpected Script name: ${String(loadedName)}`,
          });
          continue;
        }
        loadedNames.push(name);
      }
    } finally {
      runtime.releaseAllScriptModules();
    }

    return {
      failures,
      loadedNames,
      catalogSize: templates.SCRIPT_TEMPLATE_CATALOG.length,
    };
  }, {
    runtimeUrl: "/src/lib/script-modules.ts",
    templatesUrl:
      "/src/lib/visual-editor/scripting/script-templates.ts",
  });

  expect(result.failures).toEqual([]);
  expect(result.loadedNames).toHaveLength(result.catalogSize);
  expect(result.catalogSize).toBeGreaterThanOrEqual(10);
});

test("近接イベントはlive channel・複数sensor・破棄を整合させる", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready");

  const result = await page.evaluate(async ({ runtimeUrl, templatesUrl }) => {
    type RuntimeInstance = {
      update?(delta: number): void;
      dispose?(): void;
    };
    type RuntimeDefinition = {
      start?(context: unknown): RuntimeInstance | void;
    };
    const runtime = (await import(runtimeUrl)) as {
      loadScriptModule(
        source: string,
        fileName: string,
      ): Promise<
        | {
            ok: true;
            module: Record<string, unknown>;
            objectUrl: string;
          }
        | { ok: false; message: string }
      >;
      releaseAllScriptModules(): void;
    };
    const templates = (await import(templatesUrl)) as {
      createScriptTemplateSource(
        templateId: string,
        scriptName: string,
      ): string | null;
    };
    const loadTemplate = async (templateId: string) => {
      const source = templates.createScriptTemplateSource(
        templateId,
        `Fixture ${templateId}`,
      );
      if (!source) throw new Error(`${templateId} template missing`);
      const loaded = await runtime.loadScriptModule(
        source,
        `${templateId}.ts`,
      );
      if (!loaded.ok) throw new Error(loaded.message);
      return loaded.module.default as RuntimeDefinition;
    };

    try {
      const proximity = await loadTemplate("proximity-event");
      const proximityProps = {
        target: "target-a",
        channel: "channel-a",
        radius: 2,
        exitMargin: 0.25,
      };
      const emitted: {
        channel?: unknown;
        inside?: unknown;
        kind?: unknown;
        sourceEntityId?: unknown;
      }[] = [];
      const setPosition = (
        target: { set(x: number, y: number, z: number): unknown },
        x: number,
      ) => target.set(x, 0, 0);
      const proximityInstance = proximity.start?.({
        props: proximityProps,
        entity: { id: "sensor-a" },
        object3d: {
          getWorldPosition: (target: {
            set(x: number, y: number, z: number): unknown;
          }) => setPosition(target, 0),
        },
        find: (entityId: string) =>
          entityId === proximityProps.target
            ? {
                getWorldPosition: (target: {
                  set(x: number, y: number, z: number): unknown;
                }) => setPosition(target, 1),
              }
            : null,
        emit: (_event: string, payload: unknown) => {
          emitted.push(
            payload as {
              channel?: unknown;
              inside?: unknown;
              kind?: unknown;
              sourceEntityId?: unknown;
            },
          );
        },
      }) as RuntimeInstance;
      proximityInstance.update?.(1 / 60);
      proximityInstance.update?.(0.5);
      proximityProps.channel = "channel-b";
      proximityInstance.update?.(1 / 60);
      proximityInstance.dispose?.();

      const eventLight = await loadTemplate("event-light");
      const lightProps = {
        channel: "channel-a",
        idleColor: "#000000",
        activeColor: "#ffffff",
        idleIntensity: 0.15,
        activeIntensity: 4,
        fadeSpeed: 0,
      };
      let eventHandler: ((payload: unknown) => void) | undefined;
      let unsubscribed = false;
      let reset = false;
      const intensities: number[] = [];
      const lightInstance = eventLight.start?.({
        props: lightProps,
        on: (_event: string, handler: (payload: unknown) => void) => {
          eventHandler = handler;
          return () => {
            unsubscribed = true;
          };
        },
        lights: {
          setEnabled: () => 1,
          setColor: () => 1,
          setIntensity: (value: number) => {
            intensities.push(value);
            return 1;
          },
          reset: () => {
            reset = true;
          },
        },
      }) as RuntimeInstance;
      eventHandler?.({
        channel: "channel-a",
        inside: true,
        kind: "enter",
        sourceEntityId: "sensor-a",
      });
      eventHandler?.({
        channel: "channel-a",
        inside: true,
        kind: "enter",
        sourceEntityId: "sensor-b",
      });
      lightInstance.update?.(1 / 60);
      eventHandler?.({
        channel: "channel-a",
        inside: false,
        kind: "exit",
        sourceEntityId: "sensor-a",
      });
      lightInstance.update?.(1 / 60);
      eventHandler?.({
        channel: "channel-a",
        inside: false,
        kind: "exit",
        sourceEntityId: "sensor-b",
      });
      lightInstance.update?.(1 / 60);
      eventHandler?.({
        channel: "channel-a",
        inside: true,
        kind: "enter",
        sourceEntityId: "sensor-a",
      });
      lightProps.channel = "channel-b";
      lightInstance.update?.(1 / 60);
      eventHandler?.({
        channel: "channel-b",
        inside: true,
        kind: "sync",
        sourceEntityId: "sensor-c",
      });
      lightInstance.update?.(1 / 60);
      lightInstance.dispose?.();

      return {
        emitted,
        intensities: intensities.map(
          (value) => Math.round(value * 1_000) / 1_000,
        ),
        unsubscribed,
        reset,
      };
    } finally {
      runtime.releaseAllScriptModules();
    }
  }, {
    runtimeUrl: "/src/lib/script-modules.ts",
    templatesUrl:
      "/src/lib/visual-editor/scripting/script-templates.ts",
  });

  expect(result.emitted).toEqual([
    {
      channel: "channel-a",
      inside: true,
      kind: "enter",
      sourceEntityId: "sensor-a",
      targetEntityId: "target-a",
    },
    {
      channel: "channel-a",
      inside: true,
      kind: "sync",
      sourceEntityId: "sensor-a",
      targetEntityId: "target-a",
    },
    {
      channel: "channel-a",
      inside: false,
      kind: "exit",
      sourceEntityId: "sensor-a",
      targetEntityId: "target-a",
    },
    {
      channel: "channel-b",
      inside: true,
      kind: "sync",
      sourceEntityId: "sensor-a",
      targetEntityId: "target-a",
    },
    {
      channel: "channel-b",
      inside: false,
      kind: "exit",
      sourceEntityId: "sensor-a",
      targetEntityId: "target-a",
    },
  ]);
  expect(result.intensities).toEqual([4, 4, 0.15, 0.15, 4]);
  expect(result.unsubscribed).toBe(true);
  expect(result.reset).toBe(true);
});

test("bridgeはdefaultとstrict mode予約語をnamed exportへ重複出力しない", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready");

  const result = await page.evaluate(async (moduleUrl) => {
    const bridge = (await import(moduleUrl)) as {
      createScriptModuleBridgeSource(
        registryGlobal: string,
        specifier: string,
        namespace: Readonly<Record<string, unknown>>,
      ): string;
    };
    const registryGlobal = `__xriftBridgeFixture_${Date.now()}`;
    const specifier = "react/jsx-runtime";
    const namespace = {
      default: {
        Fragment: "fixture-fragment",
        jsx: "fixture-jsx",
      },
      safeValue: 42,
      eval: "must-not-export",
      arguments: "must-not-export",
      class: "must-not-export",
      "not-valid": "must-not-export",
    };
    const scope = globalThis as unknown as Record<string, unknown>;
    scope[registryGlobal] = { [specifier]: namespace };
    const objectUrl = URL.createObjectURL(
      new Blob(
        [
          bridge.createScriptModuleBridgeSource(
            registryGlobal,
            specifier,
            namespace,
          ),
        ],
        { type: "text/javascript" },
      ),
    );

    try {
      const loaded = (await import(
        /* @vite-ignore */ objectUrl
      )) as Record<string, unknown>;
      return {
        keys: Object.keys(loaded).sort(),
        defaultValue: loaded.default,
        fragment: loaded.Fragment,
        jsx: loaded.jsx,
        safeValue: loaded.safeValue,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
      delete scope[registryGlobal];
    }
  }, "/src/lib/script-module-bridge.ts");

  expect(result.keys).toEqual(["Fragment", "default", "jsx", "safeValue"]);
  expect(result.defaultValue).toEqual({
    Fragment: "fixture-fragment",
    jsx: "fixture-jsx",
  });
  expect(result.fragment).toBe("fixture-fragment");
  expect(result.jsx).toBe("fixture-jsx");
  expect(result.safeValue).toBe(42);
});
