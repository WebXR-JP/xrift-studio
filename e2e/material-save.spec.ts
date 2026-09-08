import { expect, test } from "@playwright/test";

test("モデルの表示名に区切り文字があっても保存と再取り込みができる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createAssetImportPlan, commitAssetImportPlan } = await load("/src/lib/visual-editor/asset-import.ts");
    const { assetManifestCodec } = await load("/src/lib/visual-editor/serialization.ts");
    const { ASSET_MANIFEST_SCHEMA_VERSION } = await load("/src/lib/visual-editor/asset-manifest.ts");
    const input = { fileName: "triangle.obj", preferredKind: "model", bytes: new TextEncoder().encode("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n") };
    const checks = [];
    for (const displayName of ["Pavilion / Canopy", "屋根\\部材", ".", "..", "あ".repeat(120), "a\0b"]) {
      const manifest = { schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, assets: {}, folders: {} };
      const plan = await createAssetImportPlan({ ...input, displayName, existingManifest: manifest });
      let invalidPlanWrote = false;
      let invalidPlanRejected = false;
      try {
        await commitAssetImportPlan(manifest, { ...plan, folders: plan.folders.map((folder: Record<string, unknown>, index: number) =>
          index === 0 ? { ...folder, name: "invalid/name" } : folder) }, async () => { invalidPlanWrote = true; });
      } catch { invalidPlanRejected = true; }
      if (!invalidPlanRejected || invalidPlanWrote) throw new Error("Invalid folder was not rejected before writing assets");
      const committed = await commitAssetImportPlan(manifest, plan, async () => {});
      const serialized = assetManifestCodec.serialize(committed);
      const repeated = await createAssetImportPlan({ ...input, displayName, existingManifest: committed });
      checks.push({ name: plan.asset.name, valid: assetManifestCodec.parse(serialized).ok, sameId: repeated.asset.id === plan.asset.id,
        replacement: repeated.replacesAssetId === plan.asset.id, folders: (repeated.folders ?? []).length });
    }
    return checks;
  });
  for (const check of result) expect(check).toMatchObject({ valid: true, sameId: true, replacement: true, folders: 0 });
  expect(result[0].name).toBe("Pavilion / Canopy");
});

test("発光色を連続変更しても編集が止まらず、保存して開き直せる", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド/ }).click();
  await page.getByLabel("プロジェクト名").fill("material-save-regression");
  await page.getByRole("button", { name: "作成して開く" }).click();
  const color = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Emissive / }) }).locator('input[type="color"]');
  await expect(color).toBeVisible();
  for (let i = 1; i <= 80; i++) await color.fill(`#${i.toString(16).padStart(2, "0")}8040`);
  await color.evaluate(input => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    for (let i = 1; i <= 80; i++) {
      set.call(input, `#80${i.toString(16).padStart(2, "0")}40`);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await expect(color).toHaveValue("#805040");
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(color).toHaveValue("#804f40");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(color).toHaveValue("#805040");
  await color.fill("#448866");
  await page.getByRole("button", { name: "プロジェクト一覧", exact: true }).click();
  await page.locator('button[title="material-save-regressionを開く"]').click();
  await expect(color).toHaveValue("#448866");
  await expect(page.locator("header").first().getByRole("status")).toHaveText("保存済み");
  expect(errors).toEqual([]);
});
