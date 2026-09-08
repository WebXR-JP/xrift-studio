export interface GuidePage { slug: string; title: string; description: string; group: string; file: string; keywords: string; related: string[]; next?: string; }
export interface GuideManifest { title: string; reviewedVersion: string; reviewedOn: string; siteUrl: string; groups: {id: string; label: string}[]; pages: GuidePage[]; homeTopics: string[]; firstSteps: string[]; }
export interface GuideHeading { depth: number; text: string; id: string; }
export interface GuideLinkTarget { kind: "empty"|"external"|"heading"|"page"|"media"|"invalid"; href: string; slug?: string; fragment?: string; }
export interface SearchEntry {slug: string; title: string; heading: string; url: string; text: string; keywords: string;}
export function normalizeSearch(value: string): string;
export function plainText(value: string): string;
export function headingSlug(value: string): string;
export function makeSlugger(): (text: string) => string;
export function markdownHeadings(markdown: string): GuideHeading[];
export function remarkGuideHeadings(): (tree: unknown) => void;
export function resolveGuideLink(href: string, page: string, manifest: GuideManifest): GuideLinkTarget;
export function makeSearchEntries(manifest: GuideManifest, sources: Record<string,string>): SearchEntry[];
export function searchGuide(entries: SearchEntry[], query: string, limit?: number): (SearchEntry & {score:number;snippet:string})[];
