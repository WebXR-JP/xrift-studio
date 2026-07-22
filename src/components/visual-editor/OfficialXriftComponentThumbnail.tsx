import type { XriftComponentDefinition } from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";

export function OfficialXriftComponentThumbnail({
  definition,
}: {
  definition: XriftComponentDefinition;
}) {
  const Icon = EDITOR_ICONS[definition.icon];
  return (
    <div className="relative flex h-28 w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 shadow-sm">
        <Icon size={10} aria-hidden="true" />
        Official
      </div>
      <ThumbnailVisual name={definition.importName} />
    </div>
  );
}

function ThumbnailVisual({ name }: { name: string }) {
  switch (name) {
    case "Portal":
      return (
        <div className="relative mt-3 h-20 w-24 [perspective:180px]">
          <div className="absolute bottom-1 left-1/2 h-9 w-20 -translate-x-1/2 rotate-45 rounded-[22%] bg-gradient-to-br from-zinc-600 via-zinc-800 to-zinc-950 shadow-lg [transform:translateX(-50%)_rotateX(65deg)_rotateZ(45deg)]" />
          <div className="absolute bottom-3 left-1/2 h-12 w-16 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#c4b5fd_0%,#8b5cf6_28%,#4c1d95_54%,transparent_72%)] opacity-90 blur-[0.5px] [transform:translateX(-50%)_rotateX(67deg)]" />
          <div className="absolute left-1/2 top-1 h-10 w-10 -translate-x-1/2 rounded-full border border-violet-300 bg-[radial-gradient(circle_at_40%_35%,#312e81,#05030a_68%)] shadow-[0_0_18px_rgba(139,92,246,0.8)]" />
        </div>
      );
    case "Mirror":
      return (
        <div className="h-16 w-20 rounded-sm border-2 border-sky-200 bg-[linear-gradient(135deg,#f8fafc_10%,#bae6fd_34%,#ffffff_51%,#94a3b8_76%,#e0f2fe)] shadow-[0_8px_18px_rgba(14,165,233,0.2)]" />
      );
    case "Skybox":
      return (
        <div className="relative h-20 w-20 overflow-hidden rounded-full border border-sky-200 bg-gradient-to-b from-sky-400 via-sky-200 to-white shadow-inner">
          <div className="absolute bottom-3 left-2 h-3 w-16 rounded-[50%] bg-white/70 blur-[1px]" />
        </div>
      );
    case "VideoScreen":
    case "VideoPlayer":
    case "LiveVideoPlayer":
    case "ScreenShareDisplay":
      return (
        <div className="relative h-14 w-24 rounded border-[3px] border-slate-700 bg-gradient-to-br from-sky-950 via-indigo-900 to-slate-950 shadow-lg">
          <div className="absolute inset-x-2 bottom-1 flex h-2 items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
            <span className="h-1 flex-1 rounded bg-slate-500"><span className="block h-full w-2/3 rounded bg-violet-400" /></span>
          </div>
          {name === "LiveVideoPlayer" ? (
            <span className="absolute right-1 top-1 rounded bg-rose-500 px-1 text-[7px] font-bold text-white">LIVE</span>
          ) : null}
        </div>
      );
    case "Video180Sphere":
      return (
        <div className="h-20 w-20 rounded-t-full border border-cyan-300 bg-[radial-gradient(circle_at_50%_72%,#0f172a,#164e63_55%,#67e8f9)] opacity-80 shadow-[0_0_16px_rgba(34,211,238,0.35)]" />
      );
    case "SpawnPoint":
      return (
        <div className="relative h-20 w-20">
          <div className="absolute bottom-2 left-1/2 h-10 w-14 -translate-x-1/2 rounded-[50%] border-4 border-cyan-400 [transform:translateX(-50%)_rotateX(65deg)]" />
          <div className="absolute left-1/2 top-2 h-12 w-1 -translate-x-1/2 bg-gradient-to-t from-cyan-400 to-transparent" />
          <div className="absolute left-1/2 top-1 h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[10px] border-x-transparent border-b-cyan-500" />
        </div>
      );
    case "TagBoard":
      return (
        <div className="grid h-16 w-24 grid-cols-3 gap-1 rounded border border-slate-400 bg-white p-2 shadow-md">
          {["#2ECC71", "#3498DB", "#9B59B6", "#F1C40F", "#1ABC9C", "#FF9800"].map((color) => (
            <span key={color} className="rounded-sm" style={{ backgroundColor: color }} />
          ))}
        </div>
      );
    case "EntryLogBoard":
      return (
        <div className="h-[72px] w-24 rounded border border-indigo-950 bg-[#1a1a2e] p-2 shadow-md">
          <div className="mb-1 h-1.5 w-10 rounded bg-white/80" />
          {[true, false, true, false].map((joined, index) => (
            <div key={index} className="mt-1 flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${joined ? "bg-green-500" : "bg-red-500"}`} />
              <span className="h-1 flex-1 rounded bg-white/35" />
            </div>
          ))}
        </div>
      );
    case "Interactable":
      return (
        <div className="relative flex h-14 w-20 items-center justify-center rounded-lg border-2 border-violet-300 bg-gradient-to-b from-violet-500 to-violet-700 text-[10px] font-bold text-white shadow-[0_6px_0_#4c1d95]">
          INTERACT
          <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full border-2 border-white bg-cyan-400 shadow" />
        </div>
      );
    case "Grabbable":
      return (
        <div className="relative h-16 w-16 rotate-12 rounded-lg border-2 border-amber-300 bg-gradient-to-br from-amber-300 to-orange-500 shadow-lg">
          {[["-left-2", "-top-2"], ["-right-2", "-top-2"], ["-left-2", "-bottom-2"], ["-right-2", "-bottom-2"]].map(([x, y], index) => (
            <span key={index} className={`absolute ${x} ${y} h-3 w-3 rounded-full border border-amber-700 bg-white`} />
          ))}
        </div>
      );
    case "TextInput":
      return (
        <div className="flex h-12 w-24 items-center rounded border border-slate-500 bg-slate-800 px-2 text-[9px] text-slate-300 shadow-md">
          テキストを入力<span className="ml-0.5 h-3 w-px animate-pulse bg-violet-300" />
        </div>
      );
    case "BillboardY":
      return (
        <div className="relative h-16 w-24 rounded border border-slate-400 bg-white shadow-[6px_8px_18px_rgba(15,23,42,0.2)]">
          <div className="absolute inset-x-3 top-4 h-2 rounded bg-slate-700" />
          <div className="absolute inset-x-5 top-8 h-1.5 rounded bg-violet-400" />
        </div>
      );
    default:
      return (
        <div className="flex h-16 w-20 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-600 shadow-sm">
          XRift
        </div>
      );
  }
}
