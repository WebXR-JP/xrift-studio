import { XRIFT_STUDIO_GUIDE_URL } from "../../lib/support-links";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileDown,
  Monitor,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { DownloadButton } from "../DownloadButton";
import { downloadSteps, editorUrl } from "../content";
import {
  formatPublishedDate,
  formatSize,
  optionsForPlatform,
  PLATFORM_LABELS,
  type DownloadOption,
  type PlatformId,
} from "../lib/release-download";
import {
  recheckLatestRelease,
  useDownloadCta,
} from "../lib/useLatestRelease";

const ALL_PLATFORMS: readonly PlatformId[] = ["windows", "macos", "linux"];

function OptionRow({ option }: { option: DownloadOption }) {
  return (
    <a
      href={option.url}
      download={option.fileName}
      className="preview-download-option"
    >
      <span className="preview-download-option-main">
        <FileDown size={15} className="shrink-0 text-violet-600" />
        <span className="font-mono text-[0.72rem] font-semibold text-zinc-700">
          {option.extension}
        </span>
        <span className="text-xs font-bold text-zinc-800">{option.formatLabel}</span>
      </span>
      <span className="text-[0.7rem] font-semibold text-zinc-500">
        {option.arch ? `${option.arch} ・ ` : ""}
        {formatSize(option.sizeBytes)}
      </span>
    </a>
  );
}

function StepList({ platform }: { platform: PlatformId }) {
  return (
    <ol className="preview-download-step-list">
      {downloadSteps[platform].map((step, index) => (
        <li key={step}>
          <span className="preview-download-step-index">{index + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function DownloadSection() {
  const cta = useDownloadCta();
  const [started, setStarted] = useState(false);
  const publishedDate = formatPublishedDate(cta.release.publishedAt);
  const knownPlatform = cta.option?.platform ?? null;
  // With a platform detected, its own alternative formats come first and the
  // other systems follow; with none detected, every file is listed at once.
  const otherPlatforms = ALL_PLATFORMS.filter(
    (platform) => platform !== knownPlatform,
  );
  const sameFormatAlternatives = knownPlatform
    ? optionsForPlatform(cta.release, knownPlatform).filter(
        (option) => option.fileName !== cta.option?.fileName,
      )
    : [];

  return (
    <section
      id="download"
      className="landing-section landing-section-soft"
    >
      <div className="landing-container landing-download-grid">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">ダウンロード</p>
          <h2>デスクトップ版を<br />ダウンロード</h2>
          <p>XRiftへの公開やAIとの連携には、デスクトップ版を使います。お使いのOSに合うファイルを選んでください。</p>
          <a href={`${XRIFT_STUDIO_GUIDE_URL}installation.html`} className="landing-text-link">
            インストール手順を見る
          </a>
          <dl className="mt-7 space-y-2 text-xs font-semibold text-zinc-600">
            <div className="flex gap-2">
              <dt className="text-zinc-500">バージョン</dt>
              <dd className="text-zinc-800">v{cta.release.version}</dd>
            </div>
            {publishedDate ? (
              <div className="flex gap-2">
                <dt className="text-zinc-500">公開日</dt>
                <dd className="text-zinc-800">{publishedDate}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="text-zinc-500">料金</dt>
              <dd className="text-zinc-800">無料・オープンソース（MIT License）</dd>
            </div>
          </dl>
          <p className="mt-6 text-xs font-semibold" aria-live="polite">
            {cta.error ? (
              <span className="text-amber-700">
                最新版を確認できませんでした。現在はv{cta.release.version}のファイルを表示しています。
                <button
                  type="button"
                  onClick={recheckLatestRelease}
                  className="preview-download-recheck"
                >
                  <RefreshCw size={12} />
                  もう一度確認する
                </button>
              </span>
            ) : (
              <a
                href={cta.release.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-violet-700 underline underline-offset-4"
              >
                v{cta.release.version}の変更点を見る
                <ExternalLink size={12} />
              </a>
            )}
          </p>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="preview-download-card">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
              {cta.platform === "mobile" ? (
                <Smartphone size={15} />
              ) : (
                <Monitor size={15} />
              )}
              {cta.platform === null
                ? "OSを確認中…"
                : cta.option
                  ? `${PLATFORM_LABELS[cta.option.platform]}向けのダウンロード`
                  : cta.platform === "mobile"
                    ? "パソコン向けのアプリ"
                    : "OSを判別できませんでした"}
            </div>

            {cta.option ? (
              <>
                <div className="mt-4">
                  <DownloadButton
                    cta={cta}
                    variant="primary"
                    large
                    className="w-full"
                    onStarted={() => setStarted(true)}
                  />
                </div>
                <p className="preview-download-file">
                  <span className="font-mono">{cta.option.fileName}</span>
                  <span>{formatSize(cta.option.sizeBytes)}</span>
                </p>
                {started ? (
                  <p className="preview-download-started" aria-live="polite">
                    <CheckCircle2 size={15} className="shrink-0" />
                    ダウンロードを開始しました。完了後にファイルを開いてください。
                  </p>
                ) : null}
                {cta.option.sha256 ? (
                  <details className="preview-download-details">
                    <summary>
                      <span>ファイルの照合用ハッシュ（SHA-256）</span>
                      <ChevronDown size={16} className="shrink-0 text-zinc-400" />
                    </summary>
                    <p className="preview-download-hash">{cta.option.sha256}</p>
                    <p className="preview-download-note">
                      保存したファイルのハッシュがこの値と一致すれば、GitHubのリリースに置かれたものと同じファイルです。
                    </p>
                  </details>
                ) : null}
              </>
            ) : (
              <div className="mt-4">
                <p className="text-sm font-bold leading-7 text-zinc-800">
                  {cta.platform === "mobile"
                    ? "デスクトップ版はWindows・macOS・Linux向けです。この端末では、ブラウザ版βをインストール不要で試せます。"
                    : cta.platform === null
                      ? "少しお待ちください。"
                      : "このパソコンに合うファイルを判別できませんでした。下の一覧から選んでください。"}
                </p>
                <p className="mt-2 text-xs font-semibold text-zinc-500">
                  <a href={editorUrl} className="landing-text-link">ブラウザ版を試す<span className="landing-beta-mark">β</span></a>
                </p>
              </div>
            )}

            <details className="preview-download-details" open={!cta.option}>
              <summary>
                <span>
                  {cta.option ? "他のOS・他の形式を選ぶ" : "すべてのファイルから選ぶ"}
                </span>
                <ChevronDown size={16} className="shrink-0 text-zinc-400" />
              </summary>
              <div className="mt-3 space-y-4">
                {sameFormatAlternatives.length > 0 ? (
                  <div>
                    <p className="preview-download-group-title">
                      {PLATFORM_LABELS[knownPlatform as PlatformId]}の他の形式
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {sameFormatAlternatives.map((option) => (
                        <OptionRow key={option.fileName} option={option} />
                      ))}
                    </div>
                  </div>
                ) : null}
                {otherPlatforms.map((platform) => {
                  const options = optionsForPlatform(cta.release, platform);
                  if (options.length === 0) return null;
                  return (
                    <div key={platform}>
                      <p className="preview-download-group-title">
                        {PLATFORM_LABELS[platform]}
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {options.map((option) => (
                          <OptionRow key={option.fileName} option={option} />
                        ))}
                      </div>
                    </div>
                  );
                })}
                <a
                  href={cta.release.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 underline underline-offset-4"
                >
                  GitHubのリリースページを開く
                  <ExternalLink size={12} />
                </a>
              </div>
            </details>
          </div>

          <div className="preview-download-card">
            <p className="text-xs font-black tracking-[0.14em] text-zinc-500">
              インストールと起動
            </p>
            {knownPlatform ? (
              <div className="mt-4">
                <StepList platform={knownPlatform} />
              </div>
            ) : (
              <div className="mt-3 space-y-1">
                {ALL_PLATFORMS.map((platform) => (
                  <details key={platform} className="preview-download-details">
                    <summary>
                      <span>{PLATFORM_LABELS[platform]}の手順</span>
                      <ChevronDown size={16} className="shrink-0 text-zinc-400" />
                    </summary>
                    <div className="mt-2">
                      <StepList platform={platform} />
                    </div>
                  </details>
                ))}
              </div>
            )}
            <a href={`${XRIFT_STUDIO_GUIDE_URL}installation-problems.html`} className="landing-text-link mt-4">
              警告が表示される・起動できないとき
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
