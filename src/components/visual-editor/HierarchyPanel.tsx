import { useEffect, type ComponentProps } from "react";
import { HierarchyPanel as HierarchyPanelBase } from "./HierarchyPanelBase";
import "./editor-uiux-overrides.css";

type HierarchyPanelProps = ComponentProps<typeof HierarchyPanelBase>;

const HIERARCHY_MENU_LABELS = new Set(["Entityを追加", "選択したEntityの操作"]);

export function HierarchyPanel(props: HierarchyPanelProps) {
  useEffect(() => {
    const markMenus = () => {
      document.querySelectorAll<HTMLElement>('[role="menu"]').forEach((menu) => {
        if (!HIERARCHY_MENU_LABELS.has(menu.getAttribute("aria-label") ?? "")) return;
        menu.classList.add("xrift-hierarchy-context-menu");
        menu.querySelectorAll<HTMLElement>("summary").forEach((summary) => {
          const text = summary.textContent?.trim() ?? "";
          if (text.startsWith("選択したEntityにXRift Componentを追加")) {
            summary.textContent = text.replace("選択したEntityにXRift Componentを追加", "XRift Componentを追加");
          } else if (text.startsWith("選択したEntityにComponentを追加")) {
            summary.textContent = text.replace("選択したEntityにComponentを追加", "Componentを追加");
          }
        });
      });
    };

    const observer = new MutationObserver(markMenus);
    observer.observe(document.body, { childList: true, subtree: true });
    markMenus();

    const handleToggle = (event: Event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      if (!details.closest(".xrift-hierarchy-context-menu")) return;
      const parent = details.parentElement;
      if (!parent) return;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== details && sibling instanceof HTMLDetailsElement) sibling.open = false;
      }
    };
    document.addEventListener("toggle", handleToggle, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("toggle", handleToggle, true);
    };
  }, []);

  return (
    <div className="xrift-hierarchy-ux" style={{ display: "contents" }}>
      <HierarchyPanelBase {...props} />
    </div>
  );
}
