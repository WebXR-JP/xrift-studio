import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Menu,
  Search,
  X,
} from "lucide-react";
import {
  WIKI_CATEGORIES,
  WIKI_PAGES,
  getCategoryLabel,
  getOrderedPages,
  getPageBySlug,
  getPrevNext,
} from "./lib/wiki-config";
import { XRIFT_STUDIO_REPOSITORY_URL } from "./lib/support-links";
import { BrandMark as AppBrandMark } from "./components/Brand";

const REPO_BLOB_BASE = `${XRIFT_STUDIO_REPOSITORY_URL}/blob/main`;
const WIKI_RAW_BASE = `${REPO_BLOB_BASE}/docs/wiki`;

/**
 * Turn a link written for the repository into one that works on the published
 * site. The pages are authored to be read on GitHub too, so they link to
 * neighbouring files with relative paths. Those paths resolve against the
 * wiki's own URL once published, which points at nothing, so anything that is
 * not a wiki page has to be re-pointed at the file in the repository.
 */
function resolveRepositoryHref(href: string): string {
  const segments = ["docs", "wiki"];
  for (const part of href.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return `${REPO_BLOB_BASE}/${segments.join("/")}`;
}

const wikiMarkdownFiles = import.meta.glob("/docs/wiki/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#\/?/, "") || "index");
  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash.replace(/^#\/?/, "") || "index");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return hash;
}

/**
 * Same mark as the app and the landing page.
 *
 * The glyph comes from `src/components/Brand.tsx` so the guide, the site and
 * the editor it documents stay in step. A guide with its own icon reads as a
 * different product from the tool it belongs to.
 */
function BrandMark() {
  return (
    <a href="#/index" className="flex items-center gap-2.5" aria-label="Wikiのトップへ">
      <AppBrandMark size={36} />
      <span className="text-sm font-black tracking-[-0.025em] text-zinc-950">
        XRift <span className="text-zinc-400">Studio</span> 使い方ガイド
      </span>
    </a>
  );
}

function Sidebar({
  currentSlug,
  onNavigate,
}: {
  currentSlug: string;
  onNavigate: () => void;
}) {
  const ordered = getOrderedPages();
  return (
    <nav className="flex h-full flex-col overflow-y-auto p-4" aria-label="Wikiの目次">
      <div className="space-y-5">
        {WIKI_CATEGORIES.map((category) => {
          const pages = ordered.filter((p) => p.category === category.id);
          if (pages.length === 0) return null;
          return (
            <div key={category.id}>
              <h3 className="px-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                {category.label}
              </h3>
              <ul className="mt-1.5 space-y-0.5">
                {pages.map((page) => {
                  const active = page.slug === currentSlug;
                  return (
                    <li key={page.slug}>
                      <a
                        href={`#/${page.slug}`}
                        onClick={onNavigate}
                        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
                          active
                            ? "bg-violet-50 text-violet-800"
                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        }`}
                      >
                        {active ? (
                          <ChevronRight size={13} className="shrink-0 text-violet-500" />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">{page.title}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function SearchBox({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (q: string) => void;
}) {
  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.currentTarget.value)}
        placeholder="ページを検索…"
        className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );
}

function SearchResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: () => void;
}) {
  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return WIKI_PAGES.filter((page) => {
      const haystack = `${page.title} ${getCategoryLabel(page.category)}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [query]);

  if (query.trim().length === 0) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
      {results.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-zinc-500">
          「{query.trim()}」に一致するページはありません。
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto py-1">
          {results.map((page) => (
            <li key={page.slug}>
              <a
                href={`#/${page.slug}`}
                onClick={onSelect}
                className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-violet-50 hover:text-violet-800"
              >
                <span className="text-[10px] font-bold uppercase text-zinc-400">
                  {getCategoryLabel(page.category)}
                </span>
                <span className="min-w-0 flex-1 truncate">{page.title}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TableOfContents({ content }: { content: string }) {
  const headings = useMemo(() => {
    const lines = content.split("\n");
    const result: { level: number; text: string; id: string }[] = [];
    for (const line of lines) {
      const match = line.match(/^(#{2,3})\s+(.+)$/);
      if (!match) continue;
      const level = match[1].length;
      const text = match[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\u3040-\u30ff\u4e00-\u9fff\s-]/g, "")
        .replace(/\s+/g, "-");
      result.push({ level, text, id });
    }
    return result;
  }, [content]);

  if (headings.length === 0) return null;

  return (
    <nav className="hidden xl:block" aria-label="このページの目次">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
        このページの目次
      </h3>
      <ul className="mt-2 space-y-1 border-l border-zinc-200">
        {headings.map((h) => (
          <li key={h.id} style={{ paddingLeft: `${(h.level - 2) * 0.75}rem` }}>
            <a
              href={`#${h.id}`}
              className="block text-[12px] leading-5 text-zinc-500 transition-colors hover:text-violet-700"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="wiki-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            const isRelative = href?.startsWith("./") || href?.startsWith("../");
            if (isRelative && href) {
              const slug = href.replace(/^\.\//, "").replace(/\.md$/, "");
              const page = getPageBySlug(slug);
              if (page) {
                return (
                  <a href={`#/${page.slug}`} {...props}>
                    {children}
                  </a>
                );
              }
            }
            const resolved = isRelative && href ? resolveRepositoryHref(href) : href;
            return (
              <a href={resolved} target="_blank" rel="noreferrer" {...props}>
                {children}
                <ExternalLink size={12} className="ml-0.5 inline-block align-[-1px] opacity-60" />
              </a>
            );
          },
          h2: ({ children }) => {
            const text = String(children);
            const id = text
              .toLowerCase()
              .replace(/[^\w\u3040-\u30ff\u4e00-\u9fff\s-]/g, "")
              .replace(/\s+/g, "-");
            return <h2 id={id}>{children}</h2>;
          },
          h3: ({ children }) => {
            const text = String(children);
            const id = text
              .toLowerCase()
              .replace(/[^\w\u3040-\u30ff\u4e00-\u9fff\s-]/g, "")
              .replace(/\s+/g, "-");
            return <h3 id={id}>{children}</h3>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function PageFooter({ slug }: { slug: string }) {
  const { prev, next } = getPrevNext(slug);
  return (
    <div className="mt-12 grid gap-3 border-t border-zinc-200 pt-6 sm:grid-cols-2">
      {prev ? (
        <a
          href={`#/${prev.slug}`}
          className="group flex items-center gap-3 rounded-xl border border-zinc-200 p-4 transition-colors hover:border-violet-300 hover:bg-violet-50"
        >
          <ArrowLeft size={16} className="shrink-0 text-zinc-400 group-hover:text-violet-600" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-zinc-400">前のページ</p>
            <p className="truncate text-[13px] font-bold text-zinc-800">{prev.title}</p>
          </div>
        </a>
      ) : (
        <div />
      )}
      {next ? (
        <a
          href={`#/${next.slug}`}
          className="group flex items-center justify-end gap-3 rounded-xl border border-zinc-200 p-4 text-right transition-colors hover:border-violet-300 hover:bg-violet-50"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-zinc-400">次のページ</p>
            <p className="truncate text-[13px] font-bold text-zinc-800">{next.title}</p>
          </div>
          <ArrowRight size={16} className="shrink-0 text-zinc-400 group-hover:text-violet-600" />
        </a>
      ) : (
        <div />
      )}
    </div>
  );
}

export default function WikiApp() {
  const slug = useHashRoute();
  const page = getPageBySlug(slug);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!page) {
      setError("ページが見つかりません。");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const key = `/docs/wiki/${page.file}`;
    const text = wikiMarkdownFiles[key];
    if (text === undefined) {
      setError(`マークダウンの読み込みに失敗しました: ${key} が見つかりません。`);
      setLoading(false);
      return;
    }
    setContent(text);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    document.title = page ? `${page.title} | XRift Studio 使い方ガイド` : "XRift Studio 使い方ガイド";
  }, [page]);

  if (!page) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-center">
        <div>
          <h1 className="text-xl font-black text-zinc-900">ページが見つかりません</h1>
          <a href="#/index" className="mt-4 inline-block text-sm font-semibold text-violet-700 hover:underline">
            ホームへ戻る
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 lg:hidden"
              aria-label="目次を開く"
            >
              <Menu size={20} />
            </button>
            <BrandMark />
          </div>
          <div className="hidden w-64 md:block">
            <SearchBox query={query} onQueryChange={setQuery} />
            <SearchResults query={query} onSelect={() => setQuery("")} />
          </div>
          <a
            href={XRIFT_STUDIO_REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 sm:inline-flex"
          >
            GitHub
            <ExternalLink size={13} />
          </a>
        </div>
      </header>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 p-4">
              <span className="text-sm font-black text-zinc-900">目次</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
                aria-label="目次を閉じる"
              >
                <X size={18} />
              </button>
            </div>
            <Sidebar currentSlug={slug} onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-zinc-200 bg-white lg:block">
          <Sidebar currentSlug={slug} onNavigate={() => {}} />
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 lg:px-10 lg:py-12">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              <span>{getCategoryLabel(page.category)}</span>
              <ChevronRight size={12} />
              <span className="text-violet-600">{page.title}</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24 text-sm font-medium text-zinc-500">
                読み込み中…
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
                <p className="font-bold">エラー</p>
                <p className="mt-1">{error}</p>
                <a
                  href={`${WIKI_RAW_BASE}/${page.file}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 font-semibold text-rose-800 underline"
                >
                  GitHub で元のマークダウンを開く
                  <ExternalLink size={12} />
                </a>
              </div>
            ) : (
              <div className="grid gap-10 lg:grid-cols-[1fr_12rem]">
                <div>
                  <MarkdownContent content={content} />
                  <PageFooter slug={slug} />
                </div>
                <TableOfContents content={content} />
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="border-t border-zinc-200 bg-white px-4 py-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-zinc-500">
            XRift Studio 使い方ガイド
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-zinc-500">
            <a
              href={`${WIKI_RAW_BASE}/index.md`}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-violet-700"
            >
              マークダウンで見る
            </a>
            <a
              href="https://xrift.net/"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-violet-700"
            >
              XRift 公式サイト
            </a>
            <a
              href={XRIFT_STUDIO_REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-violet-700"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
