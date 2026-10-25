import { useEffect, useState, type ReactNode } from "react";

export function CatalogThumbnailImage({
  src,
  alt,
  className = "h-full w-full",
  fallback,
  fit = "cover",
  background,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
  fit?: "cover" | "contain";
  background?: "checker" | "light" | "dark";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => {
    if (failedSrc !== src) setFailedSrc(null);
  }, [failedSrc, src]);
  const missing = !src.trim();
  const failed = missing || failedSrc === src;
  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`} style={background ? {
      backgroundColor: background === "dark" ? "#1f2937" : background === "light" ? "#fffdf8" : "#ffffff",
      ...(background === "checker" ? { backgroundImage: "conic-gradient(#e5e7eb 25%, transparent 0 50%, #e5e7eb 0 75%, transparent 0)", backgroundSize: "16px 16px" } : {}),
    } : undefined}>
      {!failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => setFailedSrc(src)}
          className={`h-full w-full ${fit === "contain" ? "object-contain p-2" : "object-cover"}`}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center text-slate-500">
          {fallback}
          <span className="text-[10px] font-medium">{missing ? "プレビューなし" : "プレビューを表示できません"}</span>
        </div>
      )}
    </div>
  );
}
