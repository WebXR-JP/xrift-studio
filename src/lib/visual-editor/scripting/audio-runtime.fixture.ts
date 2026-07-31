import {
  createScriptAudioPlayer,
  normalizeScriptAudioOptions,
  releaseScriptAudioElement,
} from "../../../../packages/xrift-studio-runtime/src/script/host";

/** DOM-free assertions for the lifecycle-owned Script Audio facade. */
export async function runScriptAudioFixtureAssertions(): Promise<void> {
  const normalized = normalizeScriptAudioOptions({
    volume: 4,
    loop: true,
    playbackRate: -1,
    preload: "metadata",
  });
  assert(normalized.volume === 1, "Audio volume was not clamped");
  assert(normalized.loop, "Audio loop option was not retained");
  assert(
    normalized.playbackRate === 1,
    "invalid Audio playback rate did not use the safe default",
  );
  assert(
    normalized.preload === "metadata",
    "Audio preload option was not retained",
  );

  let paused = true;
  let ended = false;
  let removedSource = false;
  let loadCount = 0;
  const element = {
    volume: 1,
    loop: false,
    playbackRate: 1,
    preload: "auto",
    currentTime: 0,
    duration: 12,
    get paused() {
      return paused;
    },
    get ended() {
      return ended;
    },
    async play() {
      paused = false;
    },
    pause() {
      paused = true;
    },
    removeAttribute(name: string) {
      if (name === "src") removedSource = true;
    },
    load() {
      loadCount += 1;
    },
  } as unknown as HTMLAudioElement;
  let unavailable = false;
  const player = createScriptAudioPlayer(element, () => unavailable);

  await player.play();
  assert(player.playing, "Audio player did not enter the playing state");
  player.seek(8);
  assert(
    Number(player.currentTime) === 8,
    "Audio seek did not update currentTime",
  );
  player.seek(20);
  assert(
    Number(player.currentTime) === 12,
    "Audio seek was not clamped to the known duration",
  );
  player.setVolume(-2);
  assert(Number(element.volume) === 0, "Audio volume setter was not clamped");
  player.setPlaybackRate(1.5);
  assert(
    Number(element.playbackRate) === 1.5,
    "Audio playback rate setter did not apply a valid value",
  );
  player.setPlaybackRate(0);
  assert(
    Number(element.playbackRate) === 1.5,
    "Audio playback rate setter accepted an invalid value",
  );
  player.setLoop(true);
  assert(element.loop, "Audio loop setter did not apply");
  player.stop();
  assert(
    paused && player.currentTime === 0,
    "Audio stop did not pause and rewind",
  );

  ended = true;
  assert(!player.playing, "an ended Audio element was reported as playing");
  releaseScriptAudioElement(element);
  assert(
    removedSource && loadCount === 1,
    "Audio release did not detach the source and cancel loading",
  );
  unavailable = true;
  await player.play();
  assert(!player.playing, "a released Audio player became active again");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Script Audio fixture failed: ${message}`);
}
