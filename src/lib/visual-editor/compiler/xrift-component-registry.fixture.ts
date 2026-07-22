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
  assertRequiredAuthoringIds();

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

  const interactable = requiredComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.interactable,
  );
  const compiledInteractable = compileXriftComponent(
    interactable,
    "world",
    FIXTURE_SOURCE,
  );
  assert(
    compiledInteractable.mode === "wrapper" &&
      compiledInteractable.jsx?.includes("onInteract={() => {}}") === true,
    "Interactable must emit its required safe callback adapter",
  );

  const entryLogBoard = requiredComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.entryLogBoard,
  );
  const compiledEntryLogBoard = compileXriftComponent(
    entryLogBoard,
    "world",
    FIXTURE_SOURCE,
  );
  assert(
    compiledEntryLogBoard.mode === "leaf" &&
      compiledEntryLogBoard.importName === "EntryLogBoard" &&
      compiledEntryLogBoard.jsx?.includes(
        'labels={{"join":"入室","leave":"退室"}}',
      ) === true &&
      compiledEntryLogBoard.jsx.includes(
        'colors={{"join":"#4CAF50","leave":"#F44336","background":"#1a1a2e","text":"#ffffff"}}',
      ),
    "EntryLogBoard must emit validated nested object defaults",
  );
  const invalidEntryLogBoard = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.entryLogBoard,
    { properties: { labels: { join: 123 } } },
  );
  assert(invalidEntryLogBoard, "Invalid EntryLogBoard fixture was not created");
  const compiledInvalidEntryLogBoard = compileXriftComponent(
    invalidEntryLogBoard,
    "world",
    FIXTURE_SOURCE,
  );
  assert(
    compiledInvalidEntryLogBoard.mode === "unsupported" &&
      compiledInvalidEntryLogBoard.diagnostics.some(
        (diagnostic) => diagnostic.code === "invalid-xrift-component-prop",
      ),
    "EntryLogBoard accepted a nested object value that violates its Props type",
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

  const incompletePortal = requiredComponent(XRIFT_COMPONENT_SCHEMA_IDS.portal);
  assert(
    incompletePortal.properties.instanceId === undefined,
    "Portal destination IDs must never be invented by the editor",
  );
  const compiledIncompletePortal = compileXriftComponent(
    incompletePortal,
    "world",
    FIXTURE_SOURCE,
  );
  assert(
    compiledIncompletePortal.mode === "unsupported" &&
      compiledIncompletePortal.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "missing-xrift-component-prop" &&
          diagnostic.fieldPath === "properties.instanceId",
      ),
    "Portal must block code generation until its required instanceId is set",
  );

  const portal = requiredComponent(XRIFT_COMPONENT_SCHEMA_IDS.portal, {
    instanceId: "ceffb128-23c7-4120-b4e6-19bf6c604c47",
  });
  const compiledPortal = compileXriftComponent(portal, "world", FIXTURE_SOURCE);
  assert(
    compiledPortal.mode === "leaf" &&
      compiledPortal.importName === "Portal" &&
      compiledPortal.jsx?.includes(
        'instanceId={"ceffb128-23c7-4120-b4e6-19bf6c604c47"}',
      ) === true &&
      compiledPortal.jsx.includes("position={[0,0,0]}") &&
      compiledPortal.jsx.includes("rotation={[0,0,0]}") &&
      compiledPortal.jsx.includes("disabled={false}"),
    "Portal must emit its required destination and documented defaults",
  );
}

function assertRequiredAuthoringIds(): void {
  const cases = [
    [XRIFT_COMPONENT_SCHEMA_IDS.interactable, "id", "interactable-fixture-id"],
    [XRIFT_COMPONENT_SCHEMA_IDS.grabbable, "id", "grabbable-fixture-id"],
    [XRIFT_COMPONENT_SCHEMA_IDS.videoScreen, "id", "video-screen-fixture-id"],
    [XRIFT_COMPONENT_SCHEMA_IDS.videoPlayer, "id", "video-player-fixture-id"],
    [
      XRIFT_COMPONENT_SCHEMA_IDS.liveVideoPlayer,
      "id",
      "live-video-player-fixture-id",
    ],
    [
      XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay,
      "id",
      "screen-share-display-fixture-id",
    ],
    [XRIFT_COMPONENT_SCHEMA_IDS.textInput, "id", "text-input-fixture-id"],
    [
      XRIFT_COMPONENT_SCHEMA_IDS.tagBoard,
      "instanceStateKey",
      "tag-board-fixture-id",
    ],
  ] as const;

  for (const [schemaId, fieldName, expected] of cases) {
    const component = createXriftComponent(schemaId, {
      componentId: "fixture-id",
    });
    if (!component) throw new Error(`Fixture component is missing: ${schemaId}`);
    assert(
      component.properties[fieldName] === expected,
      `${schemaId}.${fieldName} must receive a deterministic authoring default`,
    );
  }
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
