import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Object3D } from "three";

import {
  type CompiledScript,
  type ScriptContext,
  type ScriptInput,
  type ScriptInstance,
  type ScriptPropDefinition,
  type ScriptPropsDeclaration,
} from "./api.js";

/**
 * Runs Script Assets on Entities.
 *
 * Shared verbatim by Studio Play and the generated world so both schedule the
 * same way. Update order is explicit rather than React mount order, because a
 * hot-reloaded Entity would otherwise jump to the end of the callback list.
 * See docs/SCRIPTING.md.
 */

const MAX_FRAME_DELTA = 0.1;
/** A script that throws this many times in a row is stopped, not silenced. */
const CONSECUTIVE_ERROR_LIMIT = 5;

export type ScriptFailure = {
  entityId: string;
  componentId: string;
  scriptName: string;
  phase: "start" | "update" | "stop";
  message: string;
  stopped: boolean;
};

export type ScriptLogEntry = {
  entityId: string;
  componentId: string;
  scriptName: string;
  values: unknown[];
};

type Registration = {
  componentId: string;
  order: number;
  update?: (delta: number) => void;
  onError: (phase: "update", error: unknown) => void;
};

type ScriptRootValue = {
  register(registration: Registration): () => void;
  emit(event: string, payload?: unknown): void;
  subscribe(event: string, handler: (payload?: unknown) => void): () => void;
  input: ScriptInput;
};

const ScriptRootContext = createContext<ScriptRootValue | null>(null);

export type XriftScriptRootProps = {
  children?: ReactNode;
  /** Keys currently held. Studio feeds its Play input; worlds feed their own. */
  pressedKeys?: ReadonlySet<string>;
};

/** Failures are reported by each host, which knows its own Entity and script. */
export function XriftScriptRoot({
  children,
  pressedKeys,
}: XriftScriptRootProps) {
  const registrations = useRef(new Map<string, Registration>());
  const listeners = useRef(new Map<string, Set<(payload?: unknown) => void>>());
  const keysRef = useRef<ReadonlySet<string>>(pressedKeys ?? new Set());
  keysRef.current = pressedKeys ?? keysRef.current;

  const value = useMemo<ScriptRootValue>(
    () => ({
      register(registration) {
        registrations.current.set(registration.componentId, registration);
        return () => {
          registrations.current.delete(registration.componentId);
        };
      },
      emit(event, payload) {
        for (const handler of listeners.current.get(event) ?? []) {
          handler(payload);
        }
      },
      subscribe(event, handler) {
        const existing = listeners.current.get(event) ?? new Set();
        existing.add(handler);
        listeners.current.set(event, existing);
        return () => {
          existing.delete(handler);
          if (existing.size === 0) listeners.current.delete(event);
        };
      },
      input: {
        isKeyDown: (code) => keysRef.current.has(code),
        pressedKeys: () => [...keysRef.current],
      },
    }),
    [],
  );

  useFrame((_state, delta) => {
    const clamped = Math.min(delta, MAX_FRAME_DELTA);
    // Entity hierarchy order, then component order within an Entity.
    const ordered = [...registrations.current.values()].sort(
      (left, right) => left.order - right.order,
    );
    for (const registration of ordered) {
      if (!registration.update) continue;
      try {
        registration.update(clamped);
      } catch (error) {
        registration.onError("update", error);
      }
    }
  });

  useEffect(() => {
    const active = registrations.current;
    const events = listeners.current;
    return () => {
      active.clear();
      events.clear();
    };
  }, []);

  return (
    <ScriptRootContext.Provider value={value}>
      {children}
    </ScriptRootContext.Provider>
  );
}

export type XriftScriptHostProps = {
  script: CompiledScript;
  /** Authored values, already validated against the declaration. */
  properties: Record<string, unknown>;
  entityId: string;
  entityName: string;
  componentId: string;
  /** Deterministic scheduling key; lower runs first. */
  order: number;
  resolveAssetUrl?: (assetId: string) => string | null;
  resolveEntity?: (entityId: string) => Object3D | null;
  /** Optional `Render` export, mounted as a child of the Entity group. */
  render?: ComponentType;
  onLog?: (entry: ScriptLogEntry) => void;
  onFailure?: (failure: ScriptFailure) => void;
};

export function XriftScriptHost({
  script,
  properties,
  entityId,
  entityName,
  componentId,
  order,
  resolveAssetUrl,
  resolveEntity,
  render: Render,
  onLog,
  onFailure,
}: XriftScriptHostProps) {
  const root = useContext(ScriptRootContext);
  const anchorRef = useRef<Object3D>(null);
  const [ready, setReady] = useState(false);
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;
  const three = useThree();

  // The anchor's parent is the Entity group. Reading it this way keeps the
  // host identical in Studio and in a generated world, with no editor context.
  useEffect(() => {
    if (anchorRef.current) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !root) return;
    const anchor = anchorRef.current;
    const object3d = anchor?.parent;
    if (!object3d) return;

    let consecutiveErrors = 0;
    let stopped = false;
    const unsubscribes: (() => void)[] = [];
    const elapsedStart = performance.now();
    const time = { elapsed: 0, delta: 0 };

    const fail = (phase: ScriptFailure["phase"], error: unknown) => {
      consecutiveErrors += 1;
      const shouldStop = phase !== "update" || consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT;
      if (shouldStop) stopped = true;
      onFailure?.({
        entityId,
        componentId,
        scriptName: script.name,
        phase,
        message: error instanceof Error ? error.message : String(error),
        stopped: shouldStop,
      });
    };

    const context: ScriptContext<ScriptPropsDeclaration> = {
      entity: { id: entityId, name: entityName, enabled: true },
      object3d: object3d as unknown as ScriptContext["object3d"],
      scene: three.scene,
      camera: three.camera,
      renderer: three.gl,
      // The host is generic over every declaration, so the precise mapped type
      // only exists from the authoring side. Values are validated before here.
      props: resolveProps(
        script.props,
        propertiesRef.current,
      ) as ScriptContext<ScriptPropsDeclaration>["props"],
      time,
      input: root.input,
      find: (targetId) =>
        (resolveEntity?.(targetId) ??
          null) as unknown as ScriptContext["object3d"] | null,
      getAssetUrl: (assetId) => resolveAssetUrl?.(assetId) ?? null,
      on: (event, handler) => {
        const unsubscribe = root.subscribe(event, handler);
        unsubscribes.push(unsubscribe);
        return unsubscribe;
      },
      emit: (event, payload) => root.emit(event, payload),
      log: (...values) =>
        onLog?.({ entityId, componentId, scriptName: script.name, values }),
    };

    let instance: ScriptInstance | void;
    try {
      instance = script.start?.(context);
    } catch (error) {
      fail("start", error);
      return;
    }

    const unregister = root.register({
      componentId,
      order,
      onError: (phase, error) => fail(phase, error),
      update: instance?.update
        ? (delta) => {
            if (stopped) return;
            time.delta = delta;
            time.elapsed = (performance.now() - elapsedStart) / 1000;
            // Props are read fresh so Inspector edits apply without a restart.
            (context as { props: unknown }).props = resolveProps(
              script.props,
              propertiesRef.current,
            );
            instance!.update!(delta);
            consecutiveErrors = 0;
          }
        : undefined,
    });

    return () => {
      unregister();
      for (const unsubscribe of unsubscribes) unsubscribe();
      try {
        instance?.stop?.();
      } catch (error) {
        fail("stop", error);
      }
      try {
        instance?.dispose?.();
      } catch {
        // Disposal failures must not block teardown of the Play session.
      }
    };
  }, [
    ready,
    root,
    script,
    entityId,
    entityName,
    componentId,
    order,
    resolveAssetUrl,
    resolveEntity,
    onLog,
    onFailure,
    three,
  ]);

  return (
    <>
      <object3D ref={anchorRef} visible={false} />
      {Render ? <Render /> : null}
    </>
  );
}

/** Fills unset values from the declaration so a script never reads undefined. */
export function resolveProps(
  declaration: ScriptPropsDeclaration | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (!declaration) return { ...values };
  const resolved: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(declaration)) {
    const value = values[name];
    resolved[name] = value === undefined ? defaultFor(definition) : value;
  }
  return resolved;
}

function defaultFor(definition: ScriptPropDefinition): unknown {
  if (definition.default !== undefined) return definition.default;
  switch (definition.kind) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "vec2":
      return [0, 0];
    case "vec3":
      return [0, 0, 0];
    case "color":
      return "#ffffff";
    case "enum":
      return definition.options?.[0] ?? "";
    default:
      return "";
  }
}
