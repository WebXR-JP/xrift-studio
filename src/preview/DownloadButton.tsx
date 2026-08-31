import { Download } from "lucide-react";
import type { DownloadCta } from "./lib/useLatestRelease";

type DownloadButtonProps = {
  cta: DownloadCta;
  variant: "primary" | "dark" | "white";
  large?: boolean;
  className?: string;
  /** Called when the click actually starts a file download. */
  onStarted?: () => void;
};

/**
 * The one download control the page uses everywhere.
 *
 * When the visitor's platform is known this is the installer link itself, so
 * the click that says "ダウンロード" is the download — the release page, with
 * its dozen files and its `.sig` companions, is no longer something a first
 * time visitor has to walk through. When it is not known, the same button
 * leads to the section that can explain the choice.
 */
export function DownloadButton({
  cta,
  variant,
  large = false,
  className = "",
  onStarted,
}: DownloadButtonProps) {
  const classes = [
    "preview-button",
    `preview-button-${variant}`,
    large ? "preview-button-large" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      href={cta.href}
      // `download` only hints at the file name for same-origin responses, but
      // the release asset is served as an attachment, so following this link
      // saves the installer and leaves the page where it is.
      {...(cta.direct
        ? { download: cta.option?.fileName, onClick: () => onStarted?.() }
        : {})}
      className={classes}
      title={cta.option ? `${cta.option.fileName}（${cta.meta}）` : undefined}
    >
      <Download size={large ? 17 : 15} />
      {cta.label}
    </a>
  );
}
