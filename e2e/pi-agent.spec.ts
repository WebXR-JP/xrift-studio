import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

test("Pi entry uses official Editor edits, validated save and actual captures; failed native runs keep saved changes", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "pi-agent-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  // Replace only native Pi process/model transport; production Editor handlers,
  // revision checks, static importer, validation, persistence and WebGL capture run.
  await page.evaluate(() => {
    const internals = window.__TAURI_INTERNALS__!, invoke = internals.invoke!.bind(internals);
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true,
      connecting: false, restoring: false, error: null };
    let calls = 0;
    internals.invoke = async (command, args, options) => {
      if (command === "run_pi_agent") {
        calls++;
        const path = "/src/release-e2e/mock-tauri.ts";
        const { callReleaseE2EMcp: tool } = await import(/* @vite-ignore */ path);
        const current = async () => (await tool("get_editor_context")).result!;
        const context = await current();
        const source = 'export default function House(){return <group name="SDKの家"><mesh name="SDKの壁" position={[0,1,0]}><boxGeometry args={[4,2,3]}/><meshStandardMaterial color="#e9d8ba" roughness={0.8}/></mesh><mesh name="SDKの屋根" position={[0,2.6,0]} rotation={[0,0.785,0]}><boxGeometry args={[4.6,0.3,3.6]}/><meshStandardMaterial color="#315b48" roughness={0.8}/></mesh></group>}';
        const scope = { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision };
        const applied = await tool("apply_r3f_scene", { ...scope, name: "SDKの家", source });
        if (!applied.ok) throw new Error(JSON.stringify(applied.error));
        const fresh = await current();
        const saved = await tool("save_project", { projectId: fresh.projectId, sceneId: fresh.sceneId, expectedRevision: fresh.revision });
        if (!saved.ok || saved.result?.saved !== true) throw new Error("formal save failed: " + JSON.stringify(saved));
        const health = await tool("get_project_health");
        if (!health.ok || (health.result?.health as { status?: string }).status === "error") throw new Error("invalid document");
        if (calls === 2) throw new Error("fixture native process failed after save");
        for (const authoringView of ["spawn", "iso"]) {
          const captured = await tool("capture_scene_view", { projectId: fresh.projectId, sceneId: fresh.sceneId, authoringView, recordAuthoring: false });
          if (!captured.ok || !(captured.result?.image as { data?: string })?.data) throw new Error("actual capture failed: " + JSON.stringify(captured.error));
        }
        return { completed: true, summary: "壁と屋根のある家を保存し、2方向から確認しました。" };
      }
      return invoke(command, args, options);
    };
  });
  const request = { model: "fixture-model", prompt: "家を作ってください" };
  const started = await call(page, "generate_chatgpt_world", request, true);
  expect(started.ok).toBe(true);
  const generationId = started.result!.generationId;
  await expect.poll(async () => (await call(page, "get_chatgpt_generation", { generationId })).result?.status,
    { timeout: 120_000 }).not.toBe("running");
  const finished = (await call(page, "get_chatgpt_generation", { generationId })).result!;
  expect(finished.status, JSON.stringify(finished)).toBe("completed");
  const entities = await call(page, "list_entities");
  expect(JSON.stringify(entities.result)).toContain("SDKの壁");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const stale = await call(page, "save_project", { projectId: (await call(page, "get_editor_context")).result!.projectId,
    sceneId: (await call(page, "get_editor_context")).result!.sceneId, expectedRevision: -1 });
  expect(stale.ok).toBe(false);
  const second = await call(page, "generate_chatgpt_world", request, true);
  expect(second.ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_chatgpt_generation", { generationId: second.result!.generationId })).result?.status).toBe("failed");
  expect(JSON.stringify((await call(page, "list_entities")).result)).toContain("SDKの壁");
  expect((await call(page, "get_project_health")).ok).toBe(true);
});
