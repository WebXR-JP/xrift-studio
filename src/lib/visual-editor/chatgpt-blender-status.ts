import { tauri, type BlenderStatus } from "../tauri";

export const CHATGPT_BLENDER_PLANNING_WAIT_MS = 1000;
const unavailable = (): BlenderStatus => ({ available: false });

/** Blender discovery is advisory for code authoring. A slow native probe may
 * finish into this cache, but never resumes or changes an existing Scene job. */
export function createChatgptBlenderStatus(probe: () => Promise<BlenderStatus>) {
  let cached: BlenderStatus | undefined;
  let inFlight: Promise<BlenderStatus> | undefined;
  const get = (options: { refresh?: boolean } = {}): Promise<BlenderStatus> => {
    if (!options.refresh && cached) return Promise.resolve({ ...cached });
    if (!inFlight) {
      const request = Promise.resolve().then(probe).then(status => {
        cached = { ...status };
        return cached;
      });
      inFlight = request;
      // A failed refresh keeps the last successful status. Attach both
      // handlers here so a planning timeout cannot leave an unhandled reject.
      void request.then(
        () => { if (inFlight === request) inFlight = undefined; },
        () => { if (inFlight === request) inFlight = undefined; },
      );
    }
    return inFlight.then(status => ({ ...status }));
  };
  const forPlanning = (): Promise<BlenderStatus> => {
    if (cached) return Promise.resolve({ ...cached });
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(unavailable()), CHATGPT_BLENDER_PLANNING_WAIT_MS);
      void get().then(
        status => { clearTimeout(timer); resolve(status); },
        () => { clearTimeout(timer); resolve(unavailable()); },
      );
    });
  };
  return { get, forPlanning };
}

const sharedStatus = createChatgptBlenderStatus(() => tauri.getBlenderStatus());
export const getChatgptBlenderStatus = sharedStatus.get;
export const getChatgptPlanningBlenderStatus = sharedStatus.forPlanning;
