import { BookOpen, ExternalLink } from "lucide-react";
import { guideUrl, requestGuide } from "../../lib/guide-config";
import { tauri } from "../../lib/tauri";
import { useToast } from "../Toast";

export function GuideLink({ page, label = "使い方", compact = false }: {
  page: string; label?: string; compact?: boolean;
}) {
  return <button type="button" data-guide-trigger={page}
    className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    aria-label={label} title={label}
    onClick={(event) => { event.stopPropagation(); requestGuide(page, event.currentTarget); }}>
    <BookOpen size={14} aria-hidden="true" />{!compact && <span>{label}</span>}
  </button>;
}

/** Existing modal dialogs use an external link, not a second competing modal. */
export function GuideExternalLink({ page, label }: {page: string; label: string}) {
  const toast = useToast();
  return <a href={guideUrl(page)} target="_blank" rel="noopener noreferrer"
    className="inline-flex min-h-9 items-center gap-1.5 rounded-md py-1 text-xs font-medium text-brand-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    onClick={(event) => {
      if (!tauri.isAvailable()) return;
      event.preventDefault();
      void tauri.openUrl(guideUrl(page)).catch((error: unknown) => toast({kind:"error",title:"ガイドを開けませんでした",description:String(error)}));
    }}><BookOpen size={14} aria-hidden="true" />{label}<ExternalLink size={12} aria-hidden="true" /></a>;
}
