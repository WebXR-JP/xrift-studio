import { useEffect, useRef, useState } from "react";

/**
 * Whether a catalog card is close enough to the viewport to be worth drawing.
 *
 * Cards capture their frame the first time they come near the screen rather
 * than all at once on open, so a shelf costs one render per card the author
 * actually scrolls to. `rootMargin` starts them just before they arrive, so
 * the frame is usually ready by the time the card is visible.
 */
export function useCatalogPreviewVisibility<T extends HTMLElement>(): {
  ref: (node: T | null) => void;
  visible: boolean;
} {
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodeRef = useRef<T | null>(null);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  const ref = (node: T | null) => {
    if (nodeRef.current === node) return;
    nodeRef.current = node;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    observerRef.current = observer;
  };

  return { ref, visible };
}
