import { useEffect, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { GUIDE_OPEN_EVENT, type GuideRequest } from "../../lib/guide-config";
import { GuideExternalLink } from "./GuideLink";
import type { GuidePanelProps } from "./GuidePanel";
import "./guide-panel.css";

/** One host per application. Opening help never opens a project or mutates its data. */
export function GuideHost() {
  const [request, setRequest] = useState<(GuideRequest & { id: number }) | null>(null);
  const [Panel, setPanel] = useState<ComponentType<GuidePanelProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let id = 0;
    const open = (event: Event) => {
      const detail = (event as CustomEvent<GuideRequest>).detail;
      if (detail && typeof detail.page === "string") setRequest({...detail,id:++id});
    };
    window.addEventListener(GUIDE_OPEN_EVENT, open);
    return () => window.removeEventListener(GUIDE_OPEN_EVENT, open);
  }, []);
  useEffect(() => {
    if (!request || Panel) return;
    let active = true;
    setFailed(false);
    void import("./GuidePanel").then((module) => {
      if (active) setPanel(() => module.GuidePanel);
    }).catch(() => { if (active) setFailed(true); });
    return () => {active = false;};
  }, [request, Panel, attempt]);
  if (!request) return null;
  const close = () => {
    const target = request.returnFocus;
    setRequest(null);
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus();
      else document.querySelector<HTMLButtonElement>('[data-guide-trigger="first-world"]')?.focus();
    });
  };
  return createPortal(Panel ? <Panel key={request.id} initialPage={request.page} onClose={close} /> :
    <aside className="embedded-guide" role="dialog" aria-label="使い方ガイド" onKeyDown={(event) => {event.stopPropagation();if(event.key === "Escape")close();}}>
      <div className="embedded-guide-toolbar"><strong>使い方ガイド</strong><button type="button" onClick={close} autoFocus>閉じる</button></div>
      <div className="embedded-guide-body"><p role="status">{failed ? "ガイドを読み込めませんでした。編集内容は変更していません。" : "ガイドを開いています…"}</p>
        {failed && <button type="button" onClick={() => setAttempt((value) => value + 1)}>もう一度読み込む</button>}
        <GuideExternalLink page={request.page} label="ブラウザーでガイドを開く" /></div>
    </aside>, document.body);
}
