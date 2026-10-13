import { installVitePreloadRecovery } from "./vite-preload-recovery";
import "./application-bootstrap.css";

function startupSurface(): { shell: HTMLElement; panel: HTMLElement } {
  const shell = document.createElement("main");
  shell.className = "xrift-startup";
  const panel = document.createElement("section");
  panel.className = "xrift-startup-panel";
  const mark = document.createElement("div");
  mark.className = "xrift-startup-mark";
  mark.setAttribute("aria-hidden", "true");
  // BrandMark's white Lucide X, kept available before React is downloaded.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "3");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const pathData of ["M18 6 6 18", "m6 6 12 12"]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }
  mark.append(svg);
  const heading = document.createElement("h1");
  heading.className = "xrift-startup-title";
  heading.append("XRift ");
  const studio = document.createElement("span");
  studio.textContent = "Studio";
  heading.append(studio);
  panel.append(mark, heading);
  shell.append(panel);
  return { shell, panel };
}

/** Keep startup usable even before React or the app's imports have loaded. */
export function startApplication(load: () => Promise<unknown>): void {
  installVitePreloadRecovery();

  const root = document.getElementById("root");
  // An entry can run again during HMR while its bootstrap is already cached.
  // Preserve React's existing DOM; a cached import will not mount it again.
  if (root && !root.hasChildNodes()) {
    const { shell, panel } = startupSurface();
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.className = "xrift-startup-status";
    const spinner = document.createElement("span");
    spinner.className = "xrift-startup-spinner";
    spinner.setAttribute("aria-hidden", "true");
    status.append(spinner, "XRift Studioを読み込んでいます…");
    panel.append(status);
    root.replaceChildren(shell);
  }

  void load().catch((error: unknown) => {
    console.error("[XRift Studio] Application startup failed", error);
    if (!root) return;

    const { shell, panel } = startupSurface();
    panel.setAttribute("role", "alert");
    panel.classList.add("xrift-startup-failure");

    const heading = document.createElement("h2");
    heading.textContent = "XRift Studioを起動できませんでした";
    heading.className = "xrift-startup-error-title";

    const description = document.createElement("p");
    description.textContent =
      "画面の読み込みに失敗しました。保存済みの制作データは削除されていません。画面を再表示してください。";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "XRift Studioを再表示";
    retry.className = "xrift-startup-retry";
    retry.addEventListener("click", () => window.location.reload());

    panel.append(heading, description, retry);
    root.replaceChildren(shell);
  });
}
