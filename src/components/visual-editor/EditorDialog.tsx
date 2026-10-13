import { useEffect, useRef, type ReactNode } from "react";

type EditorDialogProps = {
  children: ReactNode;
  onDismiss: () => void;
  backdropClassName: string;
  surfaceClassName: string;
  role?: "dialog" | "alertdialog";
  ariaLabelledBy: string;
  ariaDescribedBy?: string;
};

/** Shared modal semantics for short, dismissible editor dialogs. */
export function EditorDialog({
  children,
  onDismiss,
  backdropClassName,
  surfaceClassName,
  role = "dialog",
  ariaLabelledBy,
  ariaDescribedBy,
}: EditorDialogProps) {
  const surfaceRef = useRef<HTMLElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(surface.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(element => element.getClientRects().length > 0);
    if (!surface.contains(document.activeElement)) (focusable()[0] ?? surface).focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[data-app-modal-surface]');
      if (dialogs[dialogs.length - 1] !== surface) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
      } else if (event.key === "Tab") {
        const targets = focusable();
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (!first || !last) {
          event.preventDefault();
          surface.focus();
        } else if (!surface.contains(document.activeElement) ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (opener?.isConnected && opener.getClientRects().length) opener.focus();
    };
  }, []);

  return (
    <div
      data-app-modal-backdrop
      className={backdropClassName}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        ref={surfaceRef}
        tabIndex={-1}
        data-app-modal-surface
        role={role}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={surfaceClassName}
      >
        {children}
      </section>
    </div>
  );
}
