import { useEffect, useState, type ReactNode } from "react";

export function CatalogThumbnailImage({
  src,
  alt,
  className = "h-full w-full",
  fallback,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => {
    if (failedSrc !== src) setFailedSrc(null);
  }, [failedSrc, src]);
  const failed = failedSrc === src;
  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      {!failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 px-2 text-center text-slate-500">
          {fallback}
          <span className="text-[10px] font-medium">Preview unavailable</span>
        </div>
      )}
    </div>
  );
}
