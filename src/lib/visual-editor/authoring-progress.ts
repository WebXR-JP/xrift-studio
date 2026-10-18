/** Digest-only progress facts shared by Studio and external authoring clients. */
export type AuthoringProgressKind = "changed" | "unchanged" | "repeated-plan" | "cycle";
export type AuthoringProgressObservation = {
  pass: number; planFingerprint: string; beforeFingerprint: string; afterFingerprint: string;
  kind: AuthoringProgressKind; stalledPasses: number; repeatedPlanPasses: number; cycleLength?: number;
};
export type AuthoringProgress = { version: 1; observations: AuthoringProgressObservation[] };
export type AuthoringProgressInput = {
  pass: number; planFingerprint: string; beforeFingerprint: string; afterFingerprint: string; continuing?: boolean;
};
export type AuthoringProgressResult = {
  progress: AuthoringProgress; observation: AuthoringProgressObservation; kind: AuthoringProgressKind;
  stalledPasses: number; repeatedPlanPasses: number; cycleLength?: number; shouldReplan: boolean; stopped: boolean;
};

export const AUTHORING_PROGRESS_HISTORY_LIMIT = 16;
export const AUTHORING_PROGRESS_STALL_LIMIT = 3;
const progressKinds = new Set<AuthoringProgressKind>(["changed", "unchanged", "repeated-plan", "cycle"]);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const keys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const integer = (value: unknown, minimum: number, maximum: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const digest = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
function invalid(): never { throw new Error("制作の進展記録を読み込めません。最新のSceneから制作を再開してください。"); }
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function cycleLengthFor(history: readonly AuthoringProgressObservation[], before: string, after: string): number | undefined {
  if (before === after || history[history.length - 1]?.afterFingerprint !== before) return undefined;
  let distance = 1;
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index]!;
    if (entry.beforeFingerprint === after) return distance + 1;
    if (index === 0 || history[index - 1]!.afterFingerprint !== entry.beforeFingerprint) break;
    distance++;
  }
  return undefined;
}

/** Old harness records omit this optional field; malformed new records are never discarded. */
export function normalizeAuthoringProgress(value: unknown, maxPass = Number.MAX_SAFE_INTEGER): AuthoringProgress {
  if (!integer(maxPass, 0, Number.MAX_SAFE_INTEGER) || !object(value) || !keys(value, ["version", "observations"]) || value.version !== 1
    || !Array.isArray(value.observations) || value.observations.length > AUTHORING_PROGRESS_HISTORY_LIMIT) invalid();
  const observations: AuthoringProgressObservation[] = [];
  let previousPass = 0;
  for (const entry of value.observations) {
    if (!object(entry) || !keys(entry, ["pass", "planFingerprint", "beforeFingerprint", "afterFingerprint", "kind", "stalledPasses", "repeatedPlanPasses", "cycleLength"])
      || !integer(entry.pass, previousPass + 1, maxPass) || !digest(entry.planFingerprint) || !digest(entry.beforeFingerprint) || !digest(entry.afterFingerprint)
      || !progressKinds.has(entry.kind as AuthoringProgressKind) || !integer(entry.stalledPasses, 0, entry.pass) || !integer(entry.repeatedPlanPasses, 0, entry.stalledPasses)) invalid();
    if (entry.kind === "changed" && (entry.beforeFingerprint === entry.afterFingerprint || entry.stalledPasses !== 0 || entry.repeatedPlanPasses !== 0)
      || entry.kind !== "changed" && (entry.stalledPasses === 0 || entry.repeatedPlanPasses === 0)
      || ["unchanged", "repeated-plan"].includes(entry.kind as string) && entry.beforeFingerprint !== entry.afterFingerprint
      || entry.kind === "repeated-plan" && entry.repeatedPlanPasses < 2
      || entry.kind === "unchanged" && entry.repeatedPlanPasses !== 1
      || entry.kind === "cycle" && (entry.beforeFingerprint === entry.afterFingerprint || !integer(entry.cycleLength, 2, Math.min(entry.pass, AUTHORING_PROGRESS_HISTORY_LIMIT + 1)))
      || entry.kind !== "cycle" && Object.prototype.hasOwnProperty.call(entry, "cycleLength")) invalid();
    const knownCycle = cycleLengthFor(observations, entry.beforeFingerprint, entry.afterFingerprint);
    if (knownCycle !== undefined && (entry.kind !== "cycle" || entry.cycleLength !== knownCycle)) invalid();
    const previous = observations[observations.length - 1];
    if (previous && previous.afterFingerprint === entry.beforeFingerprint) {
      if (entry.kind !== "changed" && (entry.stalledPasses !== previous.stalledPasses + 1
        || entry.repeatedPlanPasses !== (previous.stalledPasses > 0 && previous.planFingerprint === entry.planFingerprint ? previous.repeatedPlanPasses + 1 : 1))) invalid();
    } else if (previous && entry.kind !== "changed" && (entry.stalledPasses !== 1 || entry.repeatedPlanPasses !== 1)) invalid();
    observations.push({ pass: entry.pass, planFingerprint: entry.planFingerprint, beforeFingerprint: entry.beforeFingerprint, afterFingerprint: entry.afterFingerprint,
      kind: entry.kind as AuthoringProgressKind, stalledPasses: entry.stalledPasses, repeatedPlanPasses: entry.repeatedPlanPasses,
      ...(typeof entry.cycleLength === "number" ? { cycleLength: entry.cycleLength } : {}) });
    previousPass = entry.pass;
  }
  return freeze({ version: 1, observations });
}

/** A different Scene is a change, not a claim of visual improvement. Completion uses fresh review evidence. */
export function observeAuthoringProgress(previous: AuthoringProgress | undefined, input: AuthoringProgressInput): AuthoringProgressResult {
  const history = previous ? normalizeAuthoringProgress(previous).observations : [];
  const last = history[history.length - 1];
  if (!integer(input.pass, (last?.pass ?? 0) + 1, Number.MAX_SAFE_INTEGER) || !digest(input.planFingerprint) || !digest(input.beforeFingerprint)
    || !digest(input.afterFingerprint) || input.continuing !== undefined && typeof input.continuing !== "boolean") throw new Error("制作の進展情報が不正です。");
  // A manual edit or a new request can break continuity. Earlier automated states
  // cannot turn a legitimate change after that boundary into an apparent cycle.
  const continuous = last?.afterFingerprint === input.beforeFingerprint;
  // Nearest matching authored state determines the cycle length; array order
  // and canonical plan hashes remain the responsibility of the caller.
  const cycleLength = cycleLengthFor(history, input.beforeFingerprint, input.afterFingerprint);
  const stalled = input.beforeFingerprint === input.afterFingerprint || cycleLength !== undefined;
  const stalledPasses = stalled ? (continuous ? last!.stalledPasses : 0) + 1 : 0;
  const repeatedPlanPasses = stalled ? continuous && last!.stalledPasses > 0 && last!.planFingerprint === input.planFingerprint ? last!.repeatedPlanPasses + 1 : 1 : 0;
  const kind: AuthoringProgressKind = cycleLength !== undefined ? "cycle" : !stalled ? "changed" : repeatedPlanPasses >= 2 ? "repeated-plan" : "unchanged";
  const observation: AuthoringProgressObservation = { pass: input.pass, planFingerprint: input.planFingerprint, beforeFingerprint: input.beforeFingerprint,
    afterFingerprint: input.afterFingerprint, kind, stalledPasses, repeatedPlanPasses, ...(cycleLength !== undefined ? { cycleLength } : {}) };
  const progress = normalizeAuthoringProgress({ version: 1, observations: [...history, observation].slice(-AUTHORING_PROGRESS_HISTORY_LIMIT) }, input.pass);
  return freeze({ progress, observation: progress.observations[progress.observations.length - 1]!, kind, stalledPasses, repeatedPlanPasses,
    ...(cycleLength !== undefined ? { cycleLength } : {}), shouldReplan: input.continuing !== false && stalled, stopped: input.continuing !== false && stalledPasses >= AUTHORING_PROGRESS_STALL_LIMIT });
}
