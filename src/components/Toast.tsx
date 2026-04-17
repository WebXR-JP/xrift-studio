import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export type ToastInput = {
  kind?: ToastKind;
  title: string;
  description?: string;
  duration?: number;
};

type ToastEntry = Required<Omit<ToastInput, "description">> & {
  id: string;
  description?: string;
};

const ToastContext = createContext<(input: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      idRef.current += 1;
      const id = `${Date.now()}-${idRef.current}`;
      const entry: ToastEntry = {
        id,
        kind: input.kind ?? "info",
        title: input.title,
        description: input.description,
        duration: input.duration ?? 3800,
      };
      setToasts((t) => [...t, entry]);
      if (entry.duration > 0) {
        window.setTimeout(() => dismiss(id), entry.duration);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (toast.duration > 0) {
      const t = window.setTimeout(() => setLeaving(true), toast.duration - 300);
      return () => window.clearTimeout(t);
    }
  }, [toast.duration]);

  const conf = {
    success: {
      icon: <CheckCircle2 size={18} className="text-emerald-500" strokeWidth={2} />,
      ring: "border-emerald-200",
      bg: "bg-white",
    },
    error: {
      icon: <AlertCircle size={18} className="text-rose-500" strokeWidth={2} />,
      ring: "border-rose-200",
      bg: "bg-white",
    },
    info: {
      icon: <Info size={18} className="text-brand-500" strokeWidth={2} />,
      ring: "border-brand-200",
      bg: "bg-white",
    },
  }[toast.kind];

  return (
    <div
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border ${conf.ring} ${conf.bg} px-3.5 py-3 shadow-brand transition-all duration-300 ${leaving ? "translate-x-2 opacity-0" : "animate-slide-up opacity-100"}`}
    >
      <div className="mt-0.5 shrink-0">{conf.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-900">{toast.title}</div>
        {toast.description && (
          <div className="mt-0.5 text-[12px] text-zinc-500">{toast.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
