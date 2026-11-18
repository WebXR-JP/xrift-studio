/**
 * A render boundary between the editor shell and one of its panels.
 *
 * `VisualEditorPrototype` owns the editor's state, so any change to it — a
 * notice, the autosave status, a dialog opening — re-renders the shell. Its
 * panels are passed dozens of event handlers written inline, and an inline
 * handler is a new function on every render, so `memo` alone never bails out:
 * selecting an Entity used to re-render the Assets panel, and scrubbing a
 * number re-rendered all four panels on every pointer move.
 *
 * This wrapper gives each `on…` prop one function identity for the life of the
 * panel. That function forwards to whatever the shell passed most recently, so
 * a handler always sees current state, while the panel only re-renders when a
 * prop it draws from actually changed.
 *
 * Only props named `on…` are treated this way. They are called from events and
 * effects, where reading the latest handler is exactly what is wanted. A
 * function prop with any other name (`shortcutLabel`, a resolver, a render
 * callback) may be called while rendering, where its identity is how React
 * learns the output changed — those are compared as given, and the shell keeps
 * them stable with `useCallback`.
 *
 * `undefined` stays `undefined`: panels hide a control when its handler is
 * absent, and that must keep working.
 *
 * Small values the shell rebuilds on every render — `{ phase: "idle" }`, an
 * empty selection array, the list of open tabs — are compared by content, two
 * levels deep, so they do not defeat the boundary either. React elements are
 * never compared this way; the shell memoises the few it passes.
 */
import { memo, useRef, type ComponentType } from "react";

import { contentEqual, isPlainObject } from "./content-equal";

type AnyFunction = (...args: unknown[]) => unknown;
type Props = Record<string, unknown>;

const HANDLER_PROP = /^on[A-Z]/;

/** How far `propsEqual` looks into arrays and plain objects. */
const CONTENT_DEPTH = 2;

function propsEqual(previous: Props, next: Props): boolean {
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(previous).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(previous, key)) return false;
    if (!contentEqual(previous[key], next[key], CONTENT_DEPTH)) return false;
  }
  return true;
}

export function withStableHandlers<P extends object>(
  Component: ComponentType<P>,
): ComponentType<P> {
  const Panel = memo(
    Component as ComponentType<Props>,
    propsEqual,
  ) as unknown as ComponentType<Props>;

  function StablePanel(props: P) {
    // Assigned while rendering rather than in an effect: a child's layout
    // effect runs before its parent's, so an effect here would hand the panel
    // the previous render's handler for the commit that changed it.
    const latest = useRef<Props>(props as Props);
    latest.current = props as Props;
    const proxies = useRef<Map<string, AnyFunction> | null>(null);
    const cache = (proxies.current ??= new Map());

    /** One forwarding function per handler path, created on first sight. */
    const proxyFor = (prop: string, field: string | null): AnyFunction => {
      const path = field === null ? prop : `${prop}\u0000${field}`;
      let proxy = cache.get(path);
      if (!proxy) {
        proxy = (...args: unknown[]) => {
          const owner = field === null ? latest.current : latest.current[prop];
          const handler = isPlainObject(owner)
            ? owner[field ?? prop]
            : undefined;
          return typeof handler === "function"
            ? (handler as AnyFunction)(...args)
            : undefined;
        };
        cache.set(path, proxy);
      }
      return proxy;
    };

    const forwarded: Props = {};
    for (const name of Object.keys(props)) {
      const value = (props as Props)[name];
      if (typeof value === "function") {
        forwarded[name] = HANDLER_PROP.test(name) ? proxyFor(name, null) : value;
        continue;
      }
      // A group of handlers passed as one object, such as the recording
      // controls, gets the same treatment one level down.
      if (isPlainObject(value)) {
        let grouped: Props | null = null;
        for (const field of Object.keys(value)) {
          if (typeof value[field] === "function" && HANDLER_PROP.test(field)) {
            grouped ??= { ...value };
            grouped[field] = proxyFor(name, field);
          }
        }
        forwarded[name] = grouped ?? value;
        continue;
      }
      forwarded[name] = value;
    }
    return <Panel {...forwarded} />;
  }

  StablePanel.displayName = `Stable(${Component.displayName ?? Component.name ?? "Panel"})`;
  return StablePanel;
}
