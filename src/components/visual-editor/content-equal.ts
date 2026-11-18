/**
 * Content equality for the small values the editor rebuilds on every render.
 *
 * React compares props, context values and hook dependencies by identity. The
 * editor derives a good deal of state from the Scene — the key light, the open
 * tabs, an empty selection — and a derived value is a new object each time it
 * is computed, even when it says the same thing as before. Everything that
 * reads it then re-renders for nothing; when the reader is "every Mesh in the
 * Scene", that is the whole viewport on every edit.
 *
 * `contentEqual` answers whether two such values say the same thing, and
 * `useContentStable` uses it to hand back the previous object while they do.
 */
import { isValidElement, useRef } from "react";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (isValidElement(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Larger collections are treated as different without being walked. This is
 * for small derived values; the Entity and Asset maps hold thousands of
 * entries, already keep their identity when unchanged, and comparing them
 * entry by entry on every render would cost more than it saves.
 */
const MAX_COMPARED_ENTRIES = 64;

/**
 * Compares arrays and plain objects by content, `depth` levels down.
 *
 * Everything else — functions, class instances, Maps, Sets, React elements —
 * is equal only to itself.
 */
export function contentEqual(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    if (a.length > MAX_COMPARED_ENTRIES) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!contentEqual(a[index], b[index], depth - 1)) return false;
    }
    return true;
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  if (keys.length > MAX_COMPARED_ENTRIES) return false;
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!contentEqual(a[key], b[key], depth - 1)) return false;
  }
  return true;
}

export { isPlainObject };

/**
 * Returns the previous value for as long as the new one has the same content.
 *
 * Use it on a value that is derived from something large but is itself small,
 * right before it goes into a context or a dependency list.
 */
export function useContentStable<T>(value: T, depth = 2): T {
  const stable = useRef(value);
  if (!contentEqual(stable.current, value, depth)) stable.current = value;
  return stable.current;
}

/** The same, for a Map whose entries are compared by identity. */
export function useStableMap<K, V>(value: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const stable = useRef(value);
  const previous = stable.current;
  if (previous !== value) {
    let same = previous.size === value.size;
    if (same) {
      for (const [key, entry] of value) {
        if (!previous.has(key) || !Object.is(previous.get(key), entry)) {
          same = false;
          break;
        }
      }
    }
    if (!same) stable.current = value;
  }
  return stable.current;
}
