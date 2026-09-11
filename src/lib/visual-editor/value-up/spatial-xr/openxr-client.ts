export type OpenXrRuntimeManifest = {
  name: string;
  manifestPath: string;
  libraryPath?: string | null;
  apiVersion?: string | null;
  active: boolean;
  source: string;
};

export type OpenXrRuntimeStatus = {
  supportedPlatform: boolean;
  active: boolean;
  runtimeName?: string | null;
  manifestPath?: string | null;
  source?: string | null;
  questPcvrHint: boolean;
  message: string;
  availableRuntimes: OpenXrRuntimeManifest[];
};

export type XrHostDiagnostics = {
  openxr: OpenXrRuntimeStatus;
  adbInstalled: boolean;
  adbVersion?: string | null;
  questDevices: string[];
  steamvrRunning: boolean;
  metaLinkRunning: boolean;
  chromiumBrowsers: string[];
  notes: string[];
};

export async function getOpenXrRuntimeStatus(): Promise<OpenXrRuntimeStatus> {
  return (await import("../../../tauri")).tauri.getOpenXrRuntimeStatus();
}

export async function getXrHostDiagnostics(): Promise<XrHostDiagnostics> {
  return (await import("../../../tauri")).tauri.getXrHostDiagnostics();
}

export async function openXrPreviewUrl(url: string): Promise<void> {
  return (await import("../../../tauri")).tauri.openXrPreviewUrl(url);
}
