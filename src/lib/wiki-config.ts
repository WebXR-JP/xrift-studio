export type WikiCategory = {
  id: string;
  label: string;
};

export type WikiPage = {
  slug: string;
  file: string;
  title: string;
  category: string;
  order: number;
};

export const WIKI_CATEGORIES: WikiCategory[] = [
  { id: "start", label: "はじめに" },
  { id: "create", label: "制作" },
  { id: "publish", label: "確認と公開" },
  { id: "advanced", label: "発展" },
  { id: "troubleshoot", label: "トラブルシューティング" },
];

export const WIKI_PAGES: WikiPage[] = [
  { slug: "index", file: "index.md", title: "ホーム", category: "start", order: 0 },
  { slug: "installation", file: "installation.md", title: "インストールとセットアップ", category: "start", order: 1 },
  { slug: "projects", file: "projects.md", title: "プロジェクトの作成とライブラリ", category: "start", order: 2 },
  { slug: "data-and-reset", file: "data-and-reset.md", title: "データの保存場所とリセット", category: "start", order: 3 },
  { slug: "classic-editor", file: "classic-editor.md", title: "クラシックエディター（コード編集）", category: "create", order: 0 },
  { slug: "visual-editor", file: "visual-editor.md", title: "ビジュアルエディターの概要", category: "create", order: 1 },
  { slug: "importing-assets", file: "importing-assets.md", title: "3D 素材の取り込み", category: "create", order: 2 },
  { slug: "external-resources", file: "external-resources.md", title: "外部リソースから追加する", category: "create", order: 3 },
  { slug: "assets-and-materials", file: "assets-and-materials.md", title: "アセットと表現", category: "create", order: 4 },
  { slug: "terrain-and-colliders", file: "terrain-and-colliders.md", title: "地形と衝突判定", category: "create", order: 5 },
  { slug: "sky-and-water", file: "sky-and-water.md", title: "空と水をつくる", category: "create", order: 6 },
  { slug: "interactivity", file: "interactivity.md", title: "ノードで動きをつける", category: "create", order: 7 },
  { slug: "scripting", file: "scripting.md", title: "Entity に振る舞いを与える", category: "create", order: 8 },
  { slug: "play-mode", file: "play-mode.md", title: "Play と公開", category: "publish", order: 0 },
  { slug: "publishing", file: "publishing.md", title: "XRift への公開", category: "publish", order: 1 },
  { slug: "ai-connection", file: "ai-connection.md", title: "AI と一緒に Scene を編集する", category: "advanced", order: 0 },
  { slug: "classic-export", file: "classic-export.md", title: "Classic への書き出し", category: "advanced", order: 1 },
  { slug: "troubleshooting", file: "troubleshooting.md", title: "トラブルシューティング", category: "troubleshoot", order: 0 },
];

export function getCategoryLabel(categoryId: string): string {
  return WIKI_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId;
}

export function getPageBySlug(slug: string): WikiPage | undefined {
  return WIKI_PAGES.find((p) => p.slug === slug);
}

export function getOrderedPages(): WikiPage[] {
  return [...WIKI_PAGES].sort((a, b) => {
    const catA = WIKI_CATEGORIES.findIndex((c) => c.id === a.category);
    const catB = WIKI_CATEGORIES.findIndex((c) => c.id === b.category);
    if (catA !== catB) return catA - catB;
    return a.order - b.order;
  });
}

export function getPrevNext(slug: string): { prev?: WikiPage; next?: WikiPage } {
  const ordered = getOrderedPages();
  const index = ordered.findIndex((p) => p.slug === slug);
  if (index < 0) return {};
  return {
    prev: index > 0 ? ordered[index - 1] : undefined,
    next: index < ordered.length - 1 ? ordered[index + 1] : undefined,
  };
}
