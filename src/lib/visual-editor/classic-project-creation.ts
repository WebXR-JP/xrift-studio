import type { Project, ProjectKind } from "../tauri";
import { tauri } from "../tauri";
import { commitAssetImportPlansToDisk } from "./asset-import-persistence";
import {
  applyClassicProjectVisualImportEnhancements,
  augmentClassicProjectVisualImportPlan,
  loadClassicProjectVisualImportSource,
  loadClassicProjectVisualImportSourceFromRepository,
  prepareClassicProjectVisualAssetImports,
} from "./classic-project-import";
import {
  analyzeComponentProject,
  applyComponentCodeImportPlan,
} from "./component-code-import";
import {
  createVisualProjectOnDisk,
  saveVisualProjectToDisk,
} from "./persistence";
import type { PrototypeVisualProject } from "./prototype-project";
import { createStarterVisualProject } from "./starter-templates";

export type ClassicProjectCreationSource =
  | {
      kind: "directory";
      projectPath: string;
    }
  | {
      kind: "repository";
      repositoryUrl: string;
    };

export type ClassicProjectCreationResult = {
  project: Project;
  bundle: PrototypeVisualProject;
  importedEntityCount: number;
  importedAssetCount: number;
  warningCount: number;
  unavailableAssetCount: number;
};

/**
 * Converts a validated XRift Classic folder or repository into a new Visual project.
 * Imported code is statically analyzed and is never installed or executed.
 * If any durable step fails, the newly-created project is removed so the
 * library cannot expose a partially imported project.
 */
export async function createVisualProjectFromClassicSource(input: {
  projectsRoot: string;
  directoryName: string;
  projectKind: ProjectKind;
  source: ClassicProjectCreationSource;
}): Promise<ClassicProjectCreationResult> {
  const source =
    input.source.kind === "repository"
      ? await loadClassicProjectVisualImportSourceFromRepository(
          input.source.repositoryUrl,
          input.projectKind,
        )
      : await loadClassicProjectVisualImportSource(
          input.source.projectPath,
          input.projectKind,
        );
  const componentPlan = augmentClassicProjectVisualImportPlan(
    analyzeComponentProject({
      entryFile: source.entryFile,
      modules: source.modules,
      projectKind: input.projectKind,
    }),
    source,
  );
  const planErrors = componentPlan.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (planErrors.length > 0 || componentPlan.nodes.length === 0) {
    throw new Error(
      planErrors[0]?.message ??
        "変換できるScene要素がClassicプロジェクトに見つかりませんでした。",
    );
  }

  const starter = createStarterVisualProject(
    input.projectKind,
    "blank",
    input.directoryName,
  );
  const preparedAssets = await prepareClassicProjectVisualAssetImports({
    source,
    componentPlan,
    existingManifest: starter.assets,
  });
  let applied = applyComponentCodeImportPlan({
    scene: starter.scene,
    assets: preparedAssets.manifest,
    projectKind: input.projectKind,
    plan: componentPlan,
    assetIdBySourcePath: preparedAssets.assetIdBySourcePath,
  });
  if (applied.entityIds.length === 0) {
    throw new Error(
      applied.diagnostics[0]?.message ??
        "ClassicプロジェクトのSceneをVisualへ変換できませんでした。",
    );
  }
  applied = applyClassicProjectVisualImportEnhancements({
    source,
    componentPlan,
    result: applied,
    assetIdBySourcePath: preparedAssets.assetIdBySourcePath,
  });

  const timestamp = new Date().toISOString();
  const bundle: PrototypeVisualProject = {
    project: {
      ...starter.project,
      metadata: {
        ...starter.project.metadata,
        updatedAt: timestamp,
      },
    },
    scene: applied.scene,
    assets: applied.assets,
    prefabs: starter.prefabs,
  };

  let project: Project | null = null;
  try {
    project = await createVisualProjectOnDisk(
      input.projectsRoot,
      input.directoryName,
      {
        project: bundle.project,
        scenes: { [bundle.scene.sceneId]: bundle.scene },
        assets: bundle.assets,
        prefabs: bundle.prefabs,
      },
    );
    const committedAssets = await commitAssetImportPlansToDisk(
      project.path,
      bundle.assets,
      preparedAssets.plans,
    );
    const committedBundle = { ...bundle, assets: committedAssets };
    await saveVisualProjectToDisk(project.path, {
      project: committedBundle.project,
      scenes: {
        [committedBundle.scene.sceneId]: committedBundle.scene,
      },
      assets: committedBundle.assets,
      prefabs: committedBundle.prefabs,
    });

    return {
      project,
      bundle: committedBundle,
      importedEntityCount: applied.entityIds.length,
      importedAssetCount: preparedAssets.plans.length,
      warningCount: [
        ...componentPlan.diagnostics,
        ...preparedAssets.diagnostics,
        ...applied.diagnostics,
      ].filter((diagnostic) => diagnostic.severity === "warning").length,
      unavailableAssetCount: preparedAssets.unavailableSourcePaths.length,
    };
  } catch (error) {
    if (project) {
      try {
        await tauri.deleteProject(input.projectsRoot, project.path);
      } catch (cleanupError) {
        const importMessage =
          error instanceof Error ? error.message : String(error);
        const cleanupMessage =
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError);
        throw new Error(
          `${importMessage} 作成途中のプロジェクトを回収できませんでした。プロジェクト一覧で「${input.directoryName}」を確認して削除してください: ${cleanupMessage}`,
        );
      }
    }
    throw error;
  }
}

export async function createVisualProjectFromClassicRepository(input: {
  projectsRoot: string;
  directoryName: string;
  projectKind: ProjectKind;
  repositoryUrl: string;
}): Promise<ClassicProjectCreationResult> {
  return createVisualProjectFromClassicSource({
    projectsRoot: input.projectsRoot,
    directoryName: input.directoryName,
    projectKind: input.projectKind,
    source: {
      kind: "repository",
      repositoryUrl: input.repositoryUrl,
    },
  });
}
