import {
  resolvePortalPreview,
  resolveTagBoardPreview,
} from "./xrift-component-preview";

/** Filesystem-free assertions for editor-only XRift component previews. */
export function runXriftComponentPreviewFixtureAssertions(): void {
  const defaults = resolveTagBoardPreview({});
  assert(defaults.title === "タグ選択", "TagBoard default title was not resolved");
  assert(defaults.columns === 3, "TagBoard default columns were not resolved");
  assert(defaults.scale === 1, "TagBoard default scale was not resolved");
  assert(defaults.tags.length === 10, "TagBoard default tags were not resolved");

  const custom = resolveTagBoardPreview({
    title: "役割",
    columns: 2.4,
    scale: 1.25,
    tags: [
      { id: "developer", label: "開発", color: "#123ABC" },
      { id: "invalid", label: "無効", color: "blue" },
    ],
  });
  assert(custom.title === "役割", "TagBoard custom title was not retained");
  assert(custom.columns === 2, "TagBoard columns were not normalized");
  assert(custom.scale === 1.25, "TagBoard custom scale was not retained");
  assert(
    custom.tags.length === 1 && custom.tags[0]?.id === "developer",
    "TagBoard invalid tags were not excluded from the preview",
  );

  const unsetPortal = resolvePortalPreview({});
  assert(
    unsetPortal.statusLabel === "移動先未設定" && unsetPortal.instanceId === null,
    "Portal unset destination state was not resolved",
  );
  const configuredPortal = resolvePortalPreview({ instanceId: " instance-id " });
  assert(
    configuredPortal.statusLabel === "移動先設定済み" &&
      configuredPortal.instanceId === "instance-id",
    "Portal configured state was not resolved",
  );
  const disabledPortal = resolvePortalPreview({
    disabled: true,
    instanceId: "instance-id",
  });
  assert(
    disabledPortal.statusLabel === "Portal 無効" && disabledPortal.disabled,
    "Portal disabled state was not resolved",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`XRift preview fixture failed: ${message}`);
}
