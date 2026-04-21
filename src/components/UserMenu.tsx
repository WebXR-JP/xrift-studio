import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, LogOut, User, Copy, Check } from "lucide-react";
import type { Whoami } from "../lib/backend";

type Props = {
  user: Whoami | null;
  loading: boolean;
  busy: boolean;
  onLogin: () => void;
  onLogout: () => void;
};

export function UserMenu({ user, loading, busy, onLogin, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) {
    return (
      <span className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-400">
        確認中…
      </span>
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={onLogin}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        <LogIn size={12} strokeWidth={2.25} />
        XRift にログイン
      </button>
    );
  }

  const name = user.displayName ?? "ログイン中";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="max-w-[140px] truncate">{name}</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-brand animate-fade-in"
          style={{ transformOrigin: "top right" }}
        >
          <div className="flex items-center gap-3 gradient-brand-soft px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-brand text-white">
              <User size={16} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-zinc-900">
                {name}
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                {user.id ? (
                  <>
                    <span
                      className="truncate font-mono text-[10px] text-zinc-500"
                      title={user.id}
                    >
                      {user.id.slice(0, 8)}…
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!user.id) return;
                        navigator.clipboard.writeText(user.id).then(() => {
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1500);
                        });
                      }}
                      className="rounded p-0.5 text-zinc-400 hover:bg-white/60 hover:text-zinc-700"
                      title="ID をコピー"
                    >
                      {copied ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} strokeWidth={2} />}
                    </button>
                  </>
                ) : (
                  <span className="text-[10px] text-zinc-400">XRift アカウント</span>
                )}
              </div>
            </div>
          </div>

          <div className="py-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              disabled={busy}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <LogOut size={13} strokeWidth={2} className="text-zinc-400" />
              ログアウト
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
