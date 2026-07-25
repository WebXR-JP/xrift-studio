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
