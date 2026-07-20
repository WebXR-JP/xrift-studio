export type EditorCommandId =
  | "project.save"
  | "project.publish"
  | "edit.undo"
  | "edit.redo"
  | "edit.copy"
  | "edit.paste"
  | "edit.duplicate"
  | "edit.delete"
  | "selection.rename"
  | "entity.create-empty"
  | "entity.create-primitive"
  | "entity.add-component"
  | "entity.reparent"
  | "prefab.create"
  | "asset.create-folder"
  | "asset.create-material"
  | "asset.create-particle"
  | "asset.import"
  | "view.frame-selection"
  | "view.exit-focus"
  | "transform.translate"
  | "transform.rotate"
  | "transform.scale"
  | "transform.toggle-space"
  | "play.toggle"
  | "layout.reset";

export type ShortcutBinding = {
  key: string;
  /** Cmd on macOS and Ctrl on Windows/Linux. */
  primary?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export type EditorCommandDefinition = {
  id: EditorCommandId;
  label: string;
  category: "project" | "edit" | "view" | "transform" | "play";
  bindings: ShortcutBinding[];
};

export type ShortcutOverrides = Partial<
  Record<EditorCommandId, ShortcutBinding[]>
>;

export type ShortcutConflict = {
  signature: string;
  commandIds: EditorCommandId[];
};

export const SHORTCUT_STORAGE_KEY =
  "xrift-studio.visual-editor.shortcuts.v1";

export const EDITOR_COMMANDS: readonly EditorCommandDefinition[] = [
  {
    id: "project.save",
    label: "自動保存を今すぐ実行",
    category: "project",
    bindings: [{ key: "s", primary: true }],
  },
  {
    id: "project.publish",
    label: "XRiftへアップロード",
    category: "project",
    bindings: [{ key: "u", primary: true, shift: true }],
  },
  {
    id: "edit.undo",
    label: "元に戻す",
    category: "edit",
    bindings: [{ key: "z", primary: true }],
  },
  {
    id: "edit.redo",
    label: "やり直す",
    category: "edit",
    bindings: [
      { key: "z", primary: true, shift: true },
      { key: "y", primary: true },
    ],
  },
  {
    id: "edit.copy",
    label: "コピー",
    category: "edit",
    bindings: [{ key: "c", primary: true }],
  },
  {
    id: "edit.paste",
    label: "貼り付け",
    category: "edit",
    bindings: [{ key: "v", primary: true }],
  },
  {
    id: "edit.duplicate",
    label: "複製",
    category: "edit",
    bindings: [{ key: "d", primary: true }],
  },
  {
    id: "edit.delete",
    label: "削除",
    category: "edit",
    bindings: [{ key: "delete" }, { key: "backspace" }],
  },
  {
    id: "selection.rename",
    label: "名前を変更",
    category: "edit",
    bindings: [{ key: "f2" }],
  },
  {
    id: "entity.create-empty",
    label: "空のEntityを作成",
    category: "edit",
    bindings: [],
  },
  {
    id: "entity.create-primitive",
    label: "Primitiveを作成",
    category: "edit",
    bindings: [],
  },
  {
    id: "entity.add-component",
    label: "Componentを追加",
    category: "edit",
    bindings: [],
  },
  {
    id: "entity.reparent",
    label: "Hierarchyで移動・並び替え",
    category: "edit",
    bindings: [],
  },
  {
    id: "prefab.create",
    label: "Prefabを作成",
    category: "edit",
    bindings: [],
  },
  {
    id: "asset.create-folder",
    label: "Asset Folderを作成",
    category: "edit",
    bindings: [],
  },
  {
    id: "asset.create-material",
    label: "Materialを作成",
    category: "edit",
    bindings: [],
  },
  {
    id: "asset.create-particle",
    label: "Particleを作成",
    category: "edit",
    bindings: [],
  },
  {
    id: "asset.import",
    label: "AssetをImport",
    category: "edit",
    bindings: [],
  },
  {
    id: "view.frame-selection",
    label: "選択対象のフォーカスを切り替え",
    category: "view",
    bindings: [{ key: "f" }],
  },
  {
    id: "view.exit-focus",
    label: "フォーカスを解除",
    category: "view",
    bindings: [{ key: "escape" }],
  },
  {
    id: "transform.translate",
    label: "移動ツール",
    category: "transform",
    bindings: [{ key: "w" }],
  },
  {
    id: "transform.rotate",
    label: "回転ツール",
    category: "transform",
    bindings: [{ key: "e" }],
  },
  {
    id: "transform.scale",
    label: "拡縮ツール",
    category: "transform",
    bindings: [{ key: "r" }],
  },
  {
    id: "transform.toggle-space",
    label: "ギズモ座標系を切り替え",
    category: "transform",
    bindings: [],
  },
  {
    id: "play.toggle",
    label: "Play開始／停止",
    category: "play",
    bindings: [{ key: "f6" }],
  },
  {
    id: "layout.reset",
    label: "パネル配置を初期化",
    category: "view",
    bindings: [{ key: "0", primary: true, shift: true }],
  },
] as const;

export function resolveEditorCommands(
  overrides: ShortcutOverrides = {},
): EditorCommandDefinition[] {
  return EDITOR_COMMANDS.map((command) => ({
    ...command,
    bindings: sanitizeBindings(overrides[command.id] ?? command.bindings),
  }));
}

export function commandForKeyboardEvent(
  event: KeyboardEvent,
  commands: readonly EditorCommandDefinition[],
): EditorCommandDefinition | null {
  if (
    event.isComposing ||
    normalizeKey(event.key) === "process" ||
    isEditableShortcutTarget(event.target)
  ) {
    return null;
  }
  const platformIsMac =
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad|ipod/i.test(navigator.platform);
  const matches = commands.filter((command) =>
    command.bindings.some((binding) =>
      matchesBinding(event, binding, platformIsMac),
    ),
  );
  return matches.length === 1 ? matches[0] : null;
}

export function shortcutForCommand(
  commandId: EditorCommandId,
  commands: readonly EditorCommandDefinition[],
  platform?: "mac" | "windows-linux",
): string | undefined {
  const binding = commands.find((command) => command.id === commandId)?.bindings[0];
  const resolvedPlatform =
    platform ??
    (typeof navigator !== "undefined" &&
    /mac|iphone|ipad|ipod/i.test(navigator.platform)
      ? "mac"
      : "windows-linux");
  return binding ? describeShortcut(binding, resolvedPlatform) : undefined;
}

export function findShortcutConflicts(
  commands: readonly EditorCommandDefinition[],
): ShortcutConflict[] {
  const owners = new Map<string, Set<EditorCommandId>>();
  for (const command of commands) {
    for (const binding of command.bindings) {
      const signature = shortcutSignature(binding);
      const commandIds = owners.get(signature) ?? new Set<EditorCommandId>();
      commandIds.add(command.id);
      owners.set(signature, commandIds);
    }
  }
  return [...owners.entries()]
    .filter(([, commandIds]) => commandIds.size > 1)
    .map(([signature, commandIds]) => ({
      signature,
      commandIds: [...commandIds],
    }));
}

export function shortcutSignature(binding: ShortcutBinding): string {
  return [
    binding.primary ? "primary" : "",
    binding.shift ? "shift" : "",
    binding.alt ? "alt" : "",
    normalizeKey(binding.key),
  ]
    .filter(Boolean)
    .join("+");
}

export function describeShortcut(
  binding: ShortcutBinding,
  platform: "mac" | "windows-linux" = "windows-linux",
): string {
  const labels: string[] = [];
  if (binding.primary) labels.push(platform === "mac" ? "Cmd" : "Ctrl");
  if (binding.shift) labels.push("Shift");
  if (binding.alt) labels.push(platform === "mac" ? "Option" : "Alt");
  labels.push(displayKey(binding.key));
  return labels.join("+");
}

export function loadShortcutOverrides(
  storage?: Pick<Storage, "getItem">,
): ShortcutOverrides {
  if (!storage) return {};
  try {
    const raw = storage.getItem(SHORTCUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      EDITOR_COMMANDS.flatMap((command) => {
        const candidate = parsed[command.id];
        if (!Array.isArray(candidate)) return [];
        return [[command.id, sanitizeBindings(candidate)]];
      }),
    ) as ShortcutOverrides;
  } catch {
    return {};
  }
}

export function saveShortcutOverrides(
  overrides: ShortcutOverrides,
  storage?: Pick<Storage, "setItem">,
): boolean {
  if (!storage) return false;
  const commands = resolveEditorCommands(overrides);
  if (findShortcutConflicts(commands).length > 0) return false;
  try {
    storage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (
    typeof HTMLElement === "undefined" ||
    !(target instanceof HTMLElement)
  ) {
    return false;
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest("[contenteditable='true']") !== null
  );
}

function matchesBinding(
  event: KeyboardEvent,
  binding: ShortcutBinding,
  platformIsMac: boolean,
): boolean {
  const primaryPressed = platformIsMac ? event.metaKey : event.ctrlKey;
  const secondaryPressed = platformIsMac ? event.ctrlKey : event.metaKey;
  return (
    normalizeKey(event.key) === normalizeKey(binding.key) &&
    primaryPressed === Boolean(binding.primary) &&
    secondaryPressed === false &&
    event.shiftKey === Boolean(binding.shift) &&
    event.altKey === Boolean(binding.alt)
  );
}

function sanitizeBindings(value: unknown): ShortcutBinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.key !== "string") return [];
    const key = normalizeKey(candidate.key);
    if (!key) return [];
    return [
      {
        key,
        primary: candidate.primary === true || undefined,
        shift: candidate.shift === true || undefined,
        alt: candidate.alt === true || undefined,
      },
    ];
  });
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function displayKey(key: string): string {
  const normalized = normalizeKey(key);
  if (normalized === "delete") return "Delete";
  if (normalized === "backspace") return "Backspace";
  if (/^f\d+$/.test(normalized)) return normalized.toUpperCase();
  return normalized.length === 1 ? normalized.toUpperCase() : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
