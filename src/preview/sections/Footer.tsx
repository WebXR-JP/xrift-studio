import { Bug } from "lucide-react";
import { BrandLockup } from "../BrandLockup";
import { repositoryUrl } from "../content";
import {
  XRIFT_STUDIO_ISSUE_ASSISTANT_GPT_URL,
  XRIFT_STUDIO_ISSUES_URL,
  XRIFT_STUDIO_WIKI_URL,
} from "../../lib/support-links";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200/80 px-5 py-8 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <BrandLockup />
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-zinc-500">
          <a
            href="https://xrift.net/"
            target="_blank"
            rel="noreferrer"
            className="transition-colors duration-200 hover:text-violet-700"
          >
            XRift公式サイト
          </a>
          {XRIFT_STUDIO_ISSUE_ASSISTANT_GPT_URL ? (
            <a
              href={XRIFT_STUDIO_ISSUE_ASSISTANT_GPT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-violet-700"
            >
              <Bug size={13} aria-hidden="true" />
              Issue相談GPT
            </a>
          ) : (
            <a
              href={`${XRIFT_STUDIO_ISSUES_URL}/new`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition-colors duration-200 hover:text-violet-700"
            >
              <Bug size={13} aria-hidden="true" />
              Issueを相談
            </a>
          )}
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="transition-colors duration-200 hover:text-violet-700"
          >
            GitHub
          </a>
          <a
            href={XRIFT_STUDIO_WIKI_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors duration-200 hover:text-violet-700"
          >
            使い方ガイド
          </a>
          <a
            href={`${repositoryUrl}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors duration-200 hover:text-violet-700"
          >
            MIT License
          </a>
        </div>
      </div>
    </footer>
  );
}
