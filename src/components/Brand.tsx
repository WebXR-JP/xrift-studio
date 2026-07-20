import { X } from "lucide-react";

type Props = {
  size?: number;
  animate?: boolean;
};

export function BrandMark({ size = 32, animate = false }: Props) {
  const animClass = animate ? "animate-pulse-ring animate-float" : "";
  return (
    <div
      className={`relative flex items-center justify-center rounded-xl gradient-brand text-white shadow-brand ${animClass}`}
      style={{ width: size, height: size }}
    >
      <X size={size * 0.52} strokeWidth={3} aria-hidden="true" />
    </div>
  );
}

export function BrandWordmark({ sub }: { sub?: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[15px] font-semibold tracking-tight text-zinc-900">
        XRift <span className="text-zinc-400">Studio</span>
      </div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
