import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { tauri } from "../src/lib/tauri";
import { createPrototypeProject } from "../src/lib/visual-editor/prototype-project";
import { createEmptyEntity } from "../src/lib/visual-editor/editor-session";
import { createEditorHistory, commitEditorHistory, undoEditorHistory } from "../src/lib/visual-editor/editor-history";
import { useJevWorldBuilder } from "../src/components/visual-editor/useJevWorldBuilder";

type Mutation = "scene" | "assets";
type Controls = ReturnType<typeof useJevWorldBuilder>;
let controls: Controls | undefined;
let fixture: ReturnType<typeof createFixture> | undefined;

// Actual staged construction uses terrain and SpawnPoint, with no downloaded
// model sets. Only the remote Jev response is replaced in this browser fixture.
const CHOICES = {
  support: "supported", theme: "meadow", size: "small", time: "day",
  terrain: "flat", layout: "clearing", environment: "keep", sky: "clear",
  finish: "keep", tree: "none", rocks: "none", bamboo: "none", bench: "none",
  campfire: "none", lantern: "none", fountain: "none",
};

function createFixture() {
  const source = createPrototypeProject("world", "Jev workflow UI fixture");
  let history = createEditorHistory(source);
  let current = source;
  let projectId = source.project.projectId;
  let projectPath = "/fixture/world";
  let calls = 0;
  let commits = 0;
  let locked = false;
  let request: Record<string, unknown> | undefined;
  let resolveApi: ((response: Record<string, unknown>) => void) | undefined;
  let rejectApi: ((error: Error) => void) | undefined;
  const originalSystemOne = tauri.jevSystemOne;
  tauri.jevSystemOne = async (body) => {
    calls++;
    request = body;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      resolveApi = resolve;
      rejectApi = reject;
    });
  };

  const host = document.createElement("section");
  host.id = "jev-world-workflow-fixture";
  host.style.cssText = "position:fixed;inset:0;background:white;z-index:100;padding:16px";
  document.body.append(host);
  const root = createRoot(host);
  function WorkflowFixture() {
    controls = useJevWorldBuilder({
      projectId,
      disabledReason: null,
      getCurrent: () => ({ bundle: current, projectPath, editable: true }),
      acquire: () => {
        if (locked) throw new Error("Fixture import lock is already held");
        locked = true;
        return () => { locked = false; };
      },
      onCommit: (_before, prepared) => {
        commits++;
        current = prepared.bundle;
        history = commitEditorHistory(history, current);
      },
    });
    useEffect(() => { host.dataset.ready = "true"; }, []);
    return <><h1>Workflow test fixture: mocked Jev response, real staged world construction</h1>
      <output aria-label="Workflow phase">{controls.state.phase}</output></>;
  }
  root.render(<StrictMode><WorkflowFixture /></StrictMode>);

  const mutate = (kind: Mutation) => {
    if (kind === "scene") {
      const changed = createEmptyEntity(current.scene, null, "Concurrent edit");
      if (!changed) throw new Error("Fixture could not add the concurrent edit");
      current = { ...current, scene: changed.scene };
    } else {
      current = { ...current, assets: { ...current.assets, folders: {
        ...current.assets.folders,
        "fixture-user-folder": { id: "fixture-user-folder", name: "Concurrent asset edit", parentId: null, order: 0 },
      } } };
    }
  };

  return {
    begin: (duplicate = false) => {
      if (!controls) throw new Error("Fixture is not mounted");
      controls.setPrompt("木を置かず、歩ける小さな草原を作って");
      void controls.generate("木を置かず、歩ける小さな草原を作って");
      if (duplicate) void controls.generate("これは二重送信されない指示");
    },
    settle: (options: { reject?: boolean; before?: Mutation; afterStage?: Mutation } = {}) => {
      if (options.before) mutate(options.before);
      if (options.reject) {
        rejectApi?.(new Error("Fixture API request failed"));
      } else {
        resolveApi?.({ answers: Object.fromEntries(Object.entries(CHOICES).map(([id, choice]) => [id, {
          type: "choice", choice, confidence: 1, probabilities: { [choice]: 1 },
        }])) });
        // Resolving Jev queues the coordinator first. Real terrain preparation
        // then runs synchronously and yields; this edit must block final commit.
        if (options.afterStage) queueMicrotask(() => mutate(options.afterStage!));
      }
    },
    undo: () => {
      history = undoEditorHistory(history).history;
      current = history.present;
    },
    switchProject: () => {
      current = createPrototypeProject("world", "Different project fixture");
      history = createEditorHistory(current);
      projectId = current.project.projectId;
      projectPath = "/fixture/different-world";
      root.render(<StrictMode><WorkflowFixture /></StrictMode>);
    },
    snapshot: () => ({
      calls, commits, locked, phase: controls?.state.phase,
      message: controls?.state.message,
      prompt: controls?.prompt,
      request,
      historyEntries: history.past.length,
      restoredSource: current === source,
      addedEntities: Object.keys(current.scene.entities).length - Object.keys(source.scene.entities).length,
      addedAssets: Object.keys(current.assets.assets).length - Object.keys(source.assets.assets).length,
      existingEntitiesPreserved: Object.entries(source.scene.entities).every(([id, entity]) => current.scene.entities[id] === entity),
      terrainCreated: Object.values(current.scene.entities).some((entity) => entity.name === "歩ける地面"),
      sceneUnchanged: current.scene === source.scene,
      assetsUnchanged: current.assets === source.assets,
    }),
    unmount: () => root.unmount(),
    dispose: () => {
      root.unmount();
      tauri.jevSystemOne = originalSystemOne;
      host.remove();
      controls = undefined;
    },
  };
}

export function mountJevWorldWorkflowFixture() {
  fixture?.dispose();
  fixture = createFixture();
}

export function operateJevWorldWorkflowFixture(
  action: "begin" | "duplicate" | "resolve" | "reject" | "stale-scene" | "stale-assets" | "stale-after-stage" | "undo" | "unmount" | "switch-project",
) {
  if (!fixture) throw new Error("Fixture is not mounted");
  switch (action) {
    case "begin": fixture.begin(); break;
    case "duplicate": fixture.begin(true); break;
    case "resolve": fixture.settle(); break;
    case "reject": fixture.settle({ reject: true }); break;
    case "stale-scene": fixture.settle({ before: "scene" }); break;
    case "stale-assets": fixture.settle({ before: "assets" }); break;
    case "stale-after-stage": fixture.settle({ afterStage: "scene" }); break;
    case "undo": fixture.undo(); break;
    case "unmount": fixture.unmount(); break;
    case "switch-project": fixture.switchProject(); break;
  }
}

export function readJevWorldWorkflowFixture() {
  if (!fixture) throw new Error("Fixture is not mounted");
  return fixture.snapshot();
}
