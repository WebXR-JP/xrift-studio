import { BrandMark } from "./Brand";

export function StudioLoading({ message }: { message: string }) {
  return <main aria-label="XRift Studioの準備" className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-zinc-50 px-6 text-center">
    <BrandMark size={64} />
    <div><h1 className="text-2xl font-semibold tracking-tight text-zinc-800">XRift Studio</h1><p role="status" aria-live="polite" className="mt-3 text-sm text-zinc-500">{message}</p></div>
    <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-500 motion-reduce:animate-none" />
  </main>;
}
