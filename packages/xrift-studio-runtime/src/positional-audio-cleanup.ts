import { Audio, PositionalAudio } from "three";
let installed = false;

/** Three's source disconnect is idempotent, but its panner disconnect is not.
 * Remote Items can dispose the same sound during effect replay and teardown.
 * Keep the normal audio graph and only tolerate the already-removed edge. */
export function installPositionalAudioCleanup(): void {
  if (installed) return;
  installed = true;
  PositionalAudio.prototype.disconnect = function disconnect() {
    Audio.prototype.disconnect.call(this);
    try {
      this.panner.disconnect(this.gain);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "InvalidAccessError") throw error;
    }
    return this;
  };
}
