/**
 * Narrowing guards for values parsed from JSON or handed across a boundary.
 *
 * These lived as private copies in a dozen modules, and the copies had quietly
 * stopped agreeing: one of them also rejects class instances. Keeping both here,
 * named for what they actually check, makes that difference a choice a caller
 * makes rather than a detail buried in whichever file it was written in.
 */

/** A non-null, non-array object. Class instances pass. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A record that is also a plain object literal, so a class instance or an
 * object with an exotic prototype is rejected. Use this when the value is meant
 * to be inert data, such as a component's authored properties.
 */
export function isPlainObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Error text for logs and diagnostics. A non-Error value is stringified rather
 * than hidden, so an unexpected throw is still readable.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
