import { TEXTURE_MAX_SIZE_CHOICES } from "../../lib/visual-editor/texture-conversion";
import type { TextureImportCompression, TextureImportMaxSize } from "./texture-import-defaults";

export function TextureImportSettingsPanel({
  textureMaxSize, onTextureMaxSizeChange, textureCompression, onTextureCompressionChange,
}: {
  textureMaxSize: TextureImportMaxSize;
  onTextureMaxSizeChange: (value: TextureImportMaxSize) => void;
  textureCompression: TextureImportCompression;
  onTextureCompressionChange: (value: TextureImportCompression) => void;
}) {
  return (
    <section className="mb-3 rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-3 py-2.5">
        <h3 className="text-[13px] font-semibold text-slate-800">取り込むテクスチャのサイズと圧縮</h3>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          次の読み込みと再インポートに適用します。既存の画像はAssetsで変更してください。
        </p>
      </div>
      <div className="space-y-2.5 p-3">
        <label className="block text-xs text-slate-700">最大解像度
          <select value={textureMaxSize} onChange={(event) => onTextureMaxSizeChange(event.currentTarget.value === "original" ? "original" : Number(event.currentTarget.value) as TextureImportMaxSize)} className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 focus-visible:ring-2 focus-visible:ring-violet-100">
            <option value="original">原寸のまま</option>
            {TEXTURE_MAX_SIZE_CHOICES.map((size) => <option key={size} value={size}>長辺を最大 {size}px まで{size === 1024 ? "（初期値）" : ""}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-700">圧縮方式
          <select value={textureCompression} onChange={(event) => onTextureCompressionChange(event.currentTarget.value as TextureImportCompression)} className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 focus-visible:ring-2 focus-visible:ring-violet-100">
            <option value="source">画像形式を維持</option>
            <option value="webp">WEBP（ファイルサイズを減らす）</option>
            <option value="ktx2">KTX2 / Basis（GPU圧縮）</option>
          </select>
        </label>
        <p className="text-[11px] leading-4 text-slate-500">モデル内の画像も対象です。元画像は残し、個別に保護した設定を優先します。</p>
      </div>
    </section>
  );
}
