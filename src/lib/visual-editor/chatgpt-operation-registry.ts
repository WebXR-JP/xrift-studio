/** A trusted host installs Scene tools. Model output selects only an exact
 * discriminant; it cannot install a handler or supply an executable tool name. */
export type SceneOperationPlugin<Operation extends { kind: string }, Context, Result, Capability extends string = string> = {
  [Kind in Operation["kind"]]: {
    readonly kind: Kind;
    readonly requiredCapabilities: readonly Capability[] | ((operation: Extract<Operation, { kind: Kind }>, context: Context) => readonly Capability[]);
    readonly execute: (operation: Extract<Operation, { kind: Kind }>, context: Context) => Result | Promise<Result>;
  }
}[Operation["kind"]];

export class SceneOperationRegistryError extends Error {
  constructor(readonly code: "UNKNOWN_OPERATION" | "DUPLICATE_OPERATION" | "MISSING_OPERATION" | "CAPABILITY_REQUIRED", message: string,
    readonly operationKind?: string, readonly capability?: string) {
    super(message);
    this.name = "SceneOperationRegistryError";
  }
}

/** No UI, IPC, network or dynamic module loading lives in this registry. Hosts
 * provide those capabilities through reviewed handlers and explicit grants. */
export function createSceneOperationRegistry<Operation extends { kind: string }, Context, Result, Capability extends string = string>(input: {
  readonly kinds: readonly Operation["kind"][];
  readonly plugins: readonly SceneOperationPlugin<Operation, Context, Result, Capability>[];
}) {
  const kinds = new Set<string>();
  for (const kind of input.kinds) {
    if (typeof kind !== "string" || !kind || kinds.has(kind)) throw new SceneOperationRegistryError("DUPLICATE_OPERATION", "Scene操作の登録名が重複しています", kind);
    kinds.add(kind);
  }
  const plugins = new Map<string, SceneOperationPlugin<Operation, Context, Result, Capability>>();
  for (const plugin of input.plugins) {
    if (!kinds.has(plugin.kind)) throw new SceneOperationRegistryError("UNKNOWN_OPERATION", "登録できないScene操作です", plugin.kind);
    if (plugins.has(plugin.kind)) throw new SceneOperationRegistryError("DUPLICATE_OPERATION", "同じScene操作に複数の実行処理が登録されています", plugin.kind);
    plugins.set(plugin.kind, { ...plugin, requiredCapabilities: typeof plugin.requiredCapabilities === "function"
      ? plugin.requiredCapabilities : Object.freeze([...plugin.requiredCapabilities]) });
  }
  for (const kind of kinds) if (!plugins.has(kind)) throw new SceneOperationRegistryError("MISSING_OPERATION", "Scene操作の実行処理が登録されていません", kind);
  return Object.freeze({
    kinds: Object.freeze([...kinds]) as readonly Operation["kind"][],
    async dispatch(operation: Operation, context: Context, capabilities: ReadonlySet<Capability>): Promise<Result> {
      const kind: unknown = operation && typeof operation === "object" && Object.prototype.hasOwnProperty.call(operation, "kind") ? operation.kind : undefined;
      const plugin = typeof kind === "string" ? plugins.get(kind) : undefined;
      if (!plugin) throw new SceneOperationRegistryError("UNKNOWN_OPERATION", "対応していないScene操作です", typeof kind === "string" ? kind : undefined);
      // The exact discriminant selected this handler. The cast is confined to
      // the dispatch boundary; each installed handler retains its narrow type.
      const required = typeof plugin.requiredCapabilities === "function"
        ? (plugin.requiredCapabilities as (value: Operation, host: Context) => readonly Capability[])(operation, context)
        : plugin.requiredCapabilities;
      for (const capability of required) if (!capabilities.has(capability)) {
        throw new SceneOperationRegistryError("CAPABILITY_REQUIRED", "このScene操作に必要な制作環境を利用できません", plugin.kind, capability);
      }
      return (plugin.execute as (value: Operation, host: Context) => Result | Promise<Result>)(operation, context);
    },
  });
}
