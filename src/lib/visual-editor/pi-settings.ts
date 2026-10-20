export type PiSettings = { extensions: string[] };
export const PI_SETTINGS_KEY = "xrift-studio:pi-settings:v1";
export function parsePiPackages(value: string): string[] {
  const sources = [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  if (sources.length > 8 || sources.some(source => source.length > 240 || !/^npm:(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(source))) throw new Error("追加機能は8件まで、npm:package@1.2.3の形式で1行ずつ登録してください。");
  return sources;
}
export function loadPiSettings(storage: Pick<Storage, "getItem">): PiSettings {
  const raw = storage.getItem(PI_SETTINGS_KEY);
  if (raw === null) return { extensions: [] };
  const value = JSON.parse(raw);
  if (![1, 2].includes(value?.version) || !Array.isArray(value.extensions) || value.extensions.some((source: unknown) => typeof source !== "string")) throw new Error("制作の設定を読み取れませんでした。設定を確認して保存し直してください。");
  return { extensions: parsePiPackages(value.extensions.join("\n")) };
}
export function savePiSettings(settings: PiSettings, storage: Pick<Storage, "setItem">): void {
  storage.setItem(PI_SETTINGS_KEY, JSON.stringify({ version: 2, extensions: parsePiPackages(settings.extensions.join("\n")) }));
}
