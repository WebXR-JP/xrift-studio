import { createElement } from "react";
import { createRoot } from "react-dom/client";

import {
  ScriptTrustDialog,
  type ScriptTrustDialogResult,
} from "../src/components/visual-editor/ScriptTrustDialog";

declare global {
  // Browser-only value read by the Playwright assertion.
  // eslint-disable-next-line no-var
  var __scriptTrustFixtureResult: ScriptTrustDialogResult | undefined;
}

export function mountScriptTrustDialogFixture(): void {
  const host = document.createElement("div");
  host.id = "script-trust-fixture";
  document.body.append(host);
  globalThis.__scriptTrustFixtureResult = undefined;
  createRoot(host).render(
    createElement(ScriptTrustDialog, {
      pendingScripts: [
        {
          id: "script-1",
          name: "MCP Spinner",
          path: "scripts/mcp-spinner.ts",
          hash: "a".repeat(64),
          language: "ts",
          provenance: "MCP (Codex)",
          source:
            'import { defineScript } from "xrift:script";\nexport default defineScript({ name: "MCP Spinner" });',
        },
      ],
      onResolve: (result) => {
        globalThis.__scriptTrustFixtureResult = result;
      },
    }),
  );
}
