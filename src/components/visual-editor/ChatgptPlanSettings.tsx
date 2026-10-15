import type { ChatgptSettingDisplay } from "../../lib/visual-editor/chatgpt-change-description";

/** A readable preview of settings; edits still go through the confirmed plan. */
export function ChatgptPlanSettings({ settings }: { settings: readonly ChatgptSettingDisplay[] }) {
  return <dl aria-label="設定項目" className="mt-2 divide-y divide-slate-200/70 border-t border-slate-200/70 text-[11px]">
    {settings.map((setting, index) => <div key={`${setting.label}:${index}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-3 py-2">
      <dt className="min-w-0 break-words leading-4 text-slate-600">{setting.label}</dt>
      <dd className="min-w-0 text-right leading-4 text-slate-800">
        {typeof setting.enabled === "boolean" ? <span className={`inline-flex rounded border px-1.5 py-0.5 font-medium ${setting.enabled ? "border-slate-300 bg-white text-slate-800" : "border-slate-200 bg-slate-100 text-slate-500"}`}>{setting.enabled ? "オン" : "オフ"}</span> : <span className="flex min-w-0 items-start justify-end gap-1.5">
          {setting.color ? <span aria-hidden="true" className="mt-0.5 size-3 shrink-0 rounded-sm border border-slate-300" style={{ backgroundColor: setting.color }} /> : null}
          <span className="min-w-0 break-words tabular-nums">{setting.value}</span>
        </span>}
        {setting.previousValue !== undefined ? <p className="mt-1 break-words text-[10px] leading-4 text-slate-500">変更前：{setting.previousValue}</p> : null}
      </dd>
    </div>)}
  </dl>;
}
