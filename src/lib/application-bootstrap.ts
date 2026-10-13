import { installVitePreloadRecovery } from "./vite-preload-recovery";

/** Keep startup usable even before React or the app's imports have loaded. */
export function startApplication(load: () => Promise<unknown>): void {
  installVitePreloadRecovery();

  const root = document.getElementById("root");
  // An entry can run again during HMR while its bootstrap is already cached.
  // Preserve React's existing DOM; a cached import will not mount it again.
  if (root && !root.hasChildNodes()) {
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = "XRift Studioを読み込んでいます…";
    status.style.cssText = "padding:24px;font:14px system-ui,sans-serif;color:#64748b";
    root.replaceChildren(status);
  }

  void load().catch((error: unknown) => {
    console.error("[XRift Studio] Application startup failed", error);
    if (!root) return;

    const panel = document.createElement("section");
    panel.setAttribute("role", "alert");
    panel.style.cssText =
      "max-width:520px;margin:48px auto;padding:24px;font:14px/1.7 system-ui,sans-serif;color:#334155";

    const heading = document.createElement("h1");
    heading.textContent = "XRift Studioを起動できませんでした";
    heading.style.cssText = "font-size:20px;font-weight:600;margin:0 0 12px";

    const description = document.createElement("p");
    description.textContent =
      "画面の読み込みに失敗しました。保存済みの制作データは削除されていません。画面を再表示してください。";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "XRift Studioを再表示";
    retry.style.cssText =
      "margin-top:12px;padding:8px 16px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;cursor:pointer";
    retry.addEventListener("click", () => window.location.reload());

    panel.append(heading, description, retry);
    root.replaceChildren(panel);
  });
}
