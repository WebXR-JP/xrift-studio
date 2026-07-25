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
