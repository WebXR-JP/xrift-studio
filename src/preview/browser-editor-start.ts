import type { ProjectKind } from "./content";

type StoredProject = { path: string; kind: ProjectKind };

/** Choose a local project without putting its private storage ID into the URL. */
export function resolveBrowserEditorStart(
  requestedKind: ProjectKind | undefined,
  previousPath: string | null,
  projects: readonly StoredProject[],
): { path: string } | { kind: ProjectKind } {
  const matches = (project: StoredProject) => !requestedKind || project.kind === requestedKind;
  const previous = projects.find((project) => project.path === previousPath && matches(project));
  // listBrowserProjects is ordered by modification time. If the last project
  // is unavailable (or another kind), prefer existing work over a fresh copy.
  const project = previous ?? projects.find(matches);
  return project ? { path: project.path } : { kind: requestedKind ?? "world" };
}
