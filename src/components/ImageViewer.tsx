import { useEffect, useState } from "react";
import { getBackend } from "../lib/backend";

type Props = {
  projectPath: string;
  rel: string;
};

export function ImageViewer({ projectPath, rel }: Props) {
  const backend = getBackend();
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setSrc(null);
    backend
      .readImageDataUrl(projectPath, rel)
      .then((d) => {
        if (mounted) setSrc(d);
      })
      .catch((e) => {
        if (mounted) setError(`${e}`);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [projectPath, rel]);

  return (
    <section className="flex flex-1 min-h-0 flex-col bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-700">
        {rel}
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto bg-zinc-100 p-6">
        {loading && <div className="text-sm text-zinc-400">読み込み中…</div>}
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        {src && (
          <img
            src={src}
            alt={rel}
            className="max-h-full max-w-full rounded-lg shadow-sm"
          />
        )}
      </div>
    </section>
  );
}
