import { useEffect, type ReactNode } from "react";

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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onDismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

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
