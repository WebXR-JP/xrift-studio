import { expect, test } from "@playwright/test";

test("400スロットでも閉じている間は生成せず、検索・ページ移動後の割当を保持する", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { React, createRoot, ModelMaterialSlots } = await load("/e2e/model-material-slots.fixture.tsx");
    const host = document.createElement("div");
    host.id = "slots-test";
    host.style.cssText = "position:fixed;inset:0;z-index:99999;background:white;overflow:auto;padding:16px;width:340px";
    document.body.append(host);
    function Harness() {
      const [asset, setAsset] = React.useState({
        id: "test-model", materialSlots: Array.from({ length: 400 }, (_, i) => ({ slot: `slot-${i}`, name: `Slot ${i}` })),
      });
      const assets = React.useMemo(() => ({ assets: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`mat-${i}`, { id: `mat-${i}`, name: `Material ${i}`, kind: "material" }])) }), []);
      return React.createElement(ModelMaterialSlots, { asset, assets, readOnly: false,
        onChange: (patch: { materialSlotBindings: Record<string, string | null> }) => setAsset((current: typeof asset) => ({ ...current,
          materialSlots: current.materialSlots.map((slot: { slot: string }) => Object.hasOwn(patch.materialSlotBindings, slot.slot)
            ? { ...slot, defaultMaterialAssetId: patch.materialSlotBindings[slot.slot] ?? undefined } : slot),
        })), onOpenMaterial: (id: string) => { host.dataset.opened = id; },
      });
    }
    createRoot(host).render(React.createElement(Harness));
  });
  const host = page.locator("#slots-test");
  const toggle = host.getByRole("button", { name: "Material Slots (400)" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(host.locator("select, option")).toHaveCount(0);
  await toggle.click();
  await expect(host.getByRole("combobox")).toHaveCount(20);
  await expect(host.locator("option")).toHaveCount(20 * 401);
  await host.getByRole("button", { name: "次へ", exact: true }).click();
  await expect(host.getByRole("status")).toHaveText("21–40 / 400件");
  await host.getByRole("textbox").fill("slot-399");
  await expect(host.getByRole("combobox")).toHaveCount(1);
  await host.getByRole("combobox").selectOption("mat-42");
  await host.getByRole("button", { name: "Slot 399のマテリアルを開く" }).click();
  await expect(host).toHaveAttribute("data-opened", "mat-42");
  await toggle.click();
  await expect(host.locator("select, option")).toHaveCount(0);
  await toggle.click();
  await host.getByRole("textbox").fill("slot-399");
  await expect(host.getByRole("combobox")).toHaveValue("mat-42");
  await host.getByRole("textbox").fill("no-match");
  await expect(host.getByText("一致するスロットはありません。検索語を変えてください。")).toBeVisible();
  await expect(host.getByRole("combobox")).toHaveCount(0);
});
