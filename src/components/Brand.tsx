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
      <svg
        width={size * 0.52}
        height={size * 0.52}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M5 5l14 14M19 5L5 19" />
      </svg>
    </div>
  );
}

export function BrandWordmark({ sub }: { sub?: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[15px] font-semibold tracking-tight text-zinc-900">
        XRift <span className="text-zinc-400">Studio</span>
      </div>
      {sub && <div className="text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}
