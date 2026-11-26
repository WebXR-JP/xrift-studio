import { Group, Scene } from "three";
import { XriftMcpEditorToolError } from "../../lib/visual-editor";
import { mcpSceneViewCaptureOptions } from "./mcp-request-guards";
import { registerSceneReviewResource, sceneLoadPending } from "./scene-review-readiness";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * `capture_scene_view` returns the Scene View as the author sees it unless the
 * client asks for the frame without editing helpers. These assertions keep the
 * option from changing the picture of a client that never sends it, and keep a
 * helper-free frame from being read while what it shows is still loading.
 */
export function runSceneViewCaptureFixtureAssertions(): void {
  // Omitted, the option is the picture every client received before it existed.
  for (const args of [
    {},
    { projectId: "project", sceneId: "scene" },
    { projectId: "project", sceneId: "scene", authoringView: "iso" },
    { showEditorHelpers: true },
  ]) {
    assert(
      mcpSceneViewCaptureOptions(args).showEditorHelpers === true,
      `capture_scene_view dropped the editing helpers without being asked: ${JSON.stringify(args)}`,
    );
  }
  assert(
    mcpSceneViewCaptureOptions({ showEditorHelpers: false }).showEditorHelpers === false,
    "showEditorHelpers:false must ask for the frame without editing helpers",
  );
  // A value that only looks like a boolean is refused rather than guessed at:
  // "false" as text would otherwise return the picture with the helpers in it.
  for (const invalid of ["false", "true", 0, 1, null, [], {}]) {
    let rejected: unknown;
    try {
      mcpSceneViewCaptureOptions({ showEditorHelpers: invalid });
    } catch (error) {
      rejected = error;
    }
    assert(
      rejected instanceof XriftMcpEditorToolError &&
        rejected.code === "INVALID_ARGUMENT" &&
        rejected.message.includes("showEditorHelpers"),
      `capture_scene_view accepted showEditorHelpers=${JSON.stringify(invalid)}`,
    );
  }

  // A helper-free frame waits for what is still arriving, and only for that.
  const scene = new Scene();
  assert(!sceneLoadPending(scene), "An empty Scene has nothing to wait for");
  const model = new Group();
  scene.add(new Group().add(model));
  model.userData.xriftModelLoadState = "loading";
  assert(sceneLoadPending(scene), "A Model that is still loading must be waited for");
  model.userData.xriftModelLoadState = "error";
  assert(!sceneLoadPending(scene), "A Model that failed to load must not hold the capture");
  model.userData.xriftModelLoadState = "ready";
  assert(!sceneLoadPending(scene), "A loaded Model must not hold the capture");

  const broken = registerSceneReviewResource(scene, { status: "error", message: "missing" });
  assert(!sceneLoadPending(scene), "A failed texture must not hold the capture");
  const texture = registerSceneReviewResource(scene, { status: "loading" });
  assert(sceneLoadPending(scene), "A texture that is still loading must be waited for, whatever else failed");
  texture.update({ status: "ready" });
  assert(!sceneLoadPending(scene), "Loaded textures must not hold the capture");
  texture.dispose();
  broken.dispose();
}
