import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";

export type AppUpdateState = {
  phase: AppUpdatePhase;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  error: string | null;
};

export type AppUpdateHandle = Update;

export const INITIAL_APP_UPDATE_STATE: AppUpdateState = {
  phase: "idle",
  currentVersion: null,
  latestVersion: null,
  releaseNotes: null,
  releaseDate: null,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
};

export async function checkForAppUpdate(): Promise<AppUpdateHandle | null> {
  return check({ timeout: 15_000 });
}

export async function installAppUpdate(
  update: AppUpdateHandle,
  onProgress: (state: Pick<
    AppUpdateState,
    "phase" | "downloadedBytes" | "totalBytes"
  >) => void,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      totalBytes = event.data.contentLength ?? null;
      onProgress({
        phase: "downloading",
        downloadedBytes,
        totalBytes,
      });
      return;
    }

    if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      onProgress({
        phase: "downloading",
        downloadedBytes,
        totalBytes,
      });
      return;
    }

    onProgress({
      phase: "installing",
      downloadedBytes,
      totalBytes,
    });
  });
}

export async function relaunchAfterAppUpdate(): Promise<void> {
  await relaunch();
}
