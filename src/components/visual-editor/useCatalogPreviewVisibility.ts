import { useEffect, useRef, useState } from "react";

/**
 * How many catalog cards may hold a WebGL context at once.
 *
 * Every live preview is its own renderer, and a browser keeps only a bounded
 * number of contexts alive: past the limit it drops the oldest, which in this
 * app is the editor's own Scene View going black while a shelf is open. A
 * shelf with eleven cards crosses that line by itself, so the cards share a
 * budget. Eight leaves room for the viewport, the detail pane and a Play
 * window at the same time.
 */
const MAX_LIVE_PREVIEWS = 8;

type PreviewEntry = {
  onScreen: boolean;
  live: boolean;
  setLive: (live: boolean) => void;
};

const entries = new Map<symbol, PreviewEntry>();

function liveCount(): number {
  let count = 0;
  for (const entry of entries.values()) if (entry.live) count += 1;
  return count;
}

/**
 * Gives every on-screen card a slot, taking one back from an off-screen card
 * when the budget is full.
 *
 * On screen always wins: a card the author is looking at must move, and one
 * that has scrolled away has no claim on the GPU. Only when more cards are
 * visible at once than the budget allows does a visible card wait.
 */
function rebalance() {
  for (const entry of entries.values()) {
    if (entry.live && !entry.onScreen) {
      entry.live = false;
      entry.setLive(false);
    }
  }
  for (const entry of entries.values()) {
    if (entry.live || !entry.onScreen) continue;
    if (liveCount() >= MAX_LIVE_PREVIEWS) return;
    entry.live = true;
    entry.setLive(true);
  }
}

/** Whether this card should render live right now. */
export function useCatalogPreviewVisibility<T extends HTMLElement>(): {
  ref: (node: T | null) => void;
  visible: boolean;
} {
  const [live, setLive] = useState(false);
  const tokenRef = useRef<symbol | null>(null);
  if (tokenRef.current === null) tokenRef.current = Symbol("catalog-preview");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodeRef = useRef<T | null>(null);

  useEffect(() => {
    const token = tokenRef.current as symbol;
    entries.set(token, { onScreen: false, live: false, setLive });
    return () => {
      entries.delete(token);
      observerRef.current?.disconnect();
      observerRef.current = null;
      rebalance();
    };
  }, []);

  const ref = (node: T | null) => {
    if (nodeRef.current === node) return;
    nodeRef.current = node;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;

    const setOnScreen = (onScreen: boolean) => {
      const entry = entries.get(tokenRef.current as symbol);
      if (!entry || entry.onScreen === onScreen) return;
      entry.onScreen = onScreen;
      rebalance();
    };

    if (typeof IntersectionObserver === "undefined") {
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (observed) => {
        const entry = observed[0];
        if (entry) setOnScreen(entry.isIntersecting);
      },
      // Start just before a card arrives so the author does not watch it wake.
      { rootMargin: "120px" },
    );
    observer.observe(node);
    observerRef.current = observer;
  };

  return { ref, visible: live };
}
