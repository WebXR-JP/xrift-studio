import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  createXriftComponent,
} from "../component-registry";
import { compileXriftComponent } from "./xrift-component-registry";

const FIXTURE_SOURCE = {
  sceneId: "fixture-scene",
  entityId: "fixture-entity",
  componentId: "fixture-component",
} as const;

/** Focused, dependency-free assertions for the official XRift component adapters. */
export function runXriftComponentRegistryFixtureAssertions(): void {
  const skybox = requiredComponent(XRIFT_COMPONENT_SCHEMA_IDS.skybox);
  const compiledSkybox = compileXriftComponent(skybox, "world", FIXTURE_SOURCE);
  assert(compiledSkybox.mode === "leaf", "Skybox must compile as a leaf");
  assert(compiledSkybox.importName === "Skybox", "Skybox import is missing");
  assert(
    compiledSkybox.jsx?.includes("topColor={8900331}") === true &&
      compiledSkybox.jsx.includes("bottomColor={16777215}"),
    "Skybox defaults do not match the official component",
  );

  const videoScreen = requiredComponent(XRIFT_COMPONENT_SCHEMA_IDS.videoScreen, {
    id: "fixture-video-screen",
    url: "/videos/intro.mp4",
  });
  const compiledVideoScreen = compileXriftComponent(
    videoScreen,
    "world",
    FIXTURE_SOURCE,
  );
  assert(
    compiledVideoScreen.jsx?.includes('id={"fixture-video-screen"}') === true &&
      compiledVideoScreen.jsx.includes('url={"/videos/intro.mp4"}'),
    "VideoScreen must emit the current id/url props",
  );
  assert(
    !compiledVideoScreen.jsx?.includes(" src="),
    "VideoScreen must not emit the removed src prop",
  );

  const videoPlayer = requiredComponent(XRIFT_COMPONENT_SCHEMA_IDS.videoPlayer, {
    id: "fixture-video-player",
  });
  const compiledVideoPlayer = compileXriftComponent(
    videoPlayer,
    "world",
    FIXTURE_SOURCE,
  );
  assert(
    !compiledVideoPlayer.jsx?.includes(" sync="),
    "VideoPlayer must not emit the LiveVideoPlayer-only sync prop",
  );

  const liveVideoPlayer = requiredComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.liveVideoPlayer,
    { id: "fixture-live-player" },
  );
  const compiledLiveVideoPlayer = compileXriftComponent(
    liveVideoPlayer,
    "world",
    FIXTURE_SOURCE,
  );
  assert(
    compiledLiveVideoPlayer.jsx?.includes('sync={"global"}') === true,
    "LiveVideoPlayer must retain its sync prop",
  );

  const video180Sphere = requiredComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.video180Sphere,
    { url: "/videos/immersive-180.mp4" },
  );
  const compiledVideo180Sphere = compileXriftComponent(
    video180Sphere,
    "item",
    FIXTURE_SOURCE,
  );
  assert(
    compiledVideo180Sphere.mode === "leaf" &&
      compiledVideo180Sphere.importName === "Video180Sphere" &&
      compiledVideo180Sphere.jsx?.includes('url={"/videos/immersive-180.mp4"}') ===
        true,
    "Video180Sphere must compile for item and world projects",
  );
}

function requiredComponent(
  schemaId: string,
  properties: Record<string, string> = {},
) {
  const component = createXriftComponent(schemaId, { properties });
  if (!component) throw new Error(`Fixture component is missing: ${schemaId}`);
  return component;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
