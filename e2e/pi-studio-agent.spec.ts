import { expect, test } from "@playwright/test";

test("the real Pi SDK runs its Studio tool loop in the browser bundle", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const { runStudioPiAgent } = await import("../src/lib/visual-editor/pi-studio-agent");
    const tools: string[] = [], transcripts: string[] = [], events: string[] = [];
    const actions = ["studio_context", "studio_author", "studio_inspect", "studio_finish"];
    await runStudioPiAgent({ model: "isolated-browser-transport", prompt: "隔離したブラウザ試験", check() {},
      onEvent: event => events.push(event.type),
      async decide(transcript) { transcripts.push(transcript); return actions[tools.length]; },
      async execute(tool) { tools.push(tool); return { observation: { revision: tools.length }, terminal: tool === "studio_finish" }; },
    });
    return { tools, observedPriorTool: transcripts[1].includes('"role":"toolResult"'),
      ended: events.at(-1), executions: events.filter(type => type === "tool_execution_end").length };
  });
  expect(result.tools).toEqual(["studio_context", "studio_author", "studio_inspect", "studio_finish"]);
  expect(result.observedPriorTool).toBe(true);
  expect(result.ended).toBe("agent_end");
  expect(result.executions).toBe(4);
});
