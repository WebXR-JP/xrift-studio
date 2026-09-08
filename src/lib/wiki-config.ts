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
  { slug: "index", file: "index.md", title: "使い方の一覧", category: "start", order: 0 },
  { slug: "installation", file: "installation.md", title: "インストールとセットアップ", category: "start", order: 1 },
  { slug: "projects", file: "projects.md", title: "プロジェクトを作る・開く", category: "start", order: 2 },
  { slug: "data-and-reset", file: "data-and-reset.md", title: "データの保存場所とリセット", category: "start", order: 3 },
  { slug: "classic-editor", file: "classic-editor.md", title: "コードエディター", category: "create", order: 0 },
  { slug: "visual-editor", file: "visual-editor.md", title: "編集画面の使い方", category: "create", order: 1 },
  { slug: "importing-assets", file: "importing-assets.md", title: "3Dモデルの読み込み", category: "create", order: 2 },
  { slug: "blender-world-modeling", file: "blender-world-modeling.md", title: "Blender で部屋をつくって取り込む", category: "create", order: 3 },
  { slug: "external-resources", file: "external-resources.md", title: "外部の素材を追加する", category: "create", order: 4 },
  { slug: "assets-and-materials", file: "assets-and-materials.md", title: "素材とマテリアル", category: "create", order: 5 },
  { slug: "terrain-and-colliders", file: "terrain-and-colliders.md", title: "地形と衝突判定", category: "create", order: 6 },
  { slug: "sky-and-water", file: "sky-and-water.md", title: "空と水をつくる", category: "create", order: 7 },
  { slug: "interactivity", file: "interactivity.md", title: "ノードで動きを作る", category: "create", order: 8 },
  { slug: "interactivity-timeline", file: "interactivity-timeline.md", title: "12秒の演出を作る", category: "create", order: 9 },
  { slug: "scripting", file: "scripting.md", title: "スクリプトで動きを作る", category: "create", order: 10 },
  { slug: "play-mode", file: "play-mode.md", title: "動作を確認する", category: "publish", order: 0 },
  { slug: "publishing", file: "publishing.md", title: "XRift への公開（アップロード）", category: "publish", order: 1 },
  { slug: "ai-connection", file: "ai-connection.md", title: "AIと一緒に編集する", category: "advanced", order: 0 },
  { slug: "classic-export", file: "classic-export.md", title: "コードエディター用に書き出す", category: "advanced", order: 1 },
  { slug: "troubleshooting", file: "troubleshooting.md", title: "トラブルシューティング", category: "troubleshoot", order: 0 },
  { slug: "macos-gatekeeper", file: "macos-gatekeeper.md", title: "macOS で開けないとき", category: "troubleshoot", order: 1 },
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
