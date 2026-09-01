import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import type {
  JsonValue,
  ScriptComponent,
} from "../../lib/visual-editor/scene-document";
import {
  resolveScriptPropValue,
  type ScriptContract,
  type ScriptPropDescriptor,
} from "../../lib/visual-editor/scripting/script-contract";
import { listScriptAssets } from "../../lib/visual-editor/scripting/script-files";
import { ScrubNumberInput } from "./ScrubNumberInput";

/**
 * Inspector fields for a Script Component.
 *
 * Fields are generated from what the source declares, so the Inspector never
 * invents a control for a property the script does not have. A script whose
 * declaration cannot be read says so rather than showing guessed fields.
 * See MI-69 and docs/SCRIPTING.md.
 */

export type ScriptComponentPatch = {
  scriptAssetId?: string;
  properties?: Record<string, JsonValue>;
  assetReferences?: string[];
  entityReferences?: string[];
  runIn?: ScriptComponent["runIn"];
};

export type ScriptEntityOption = { id: string; name: string };

export function ScriptComponentInspector({
  component,
  contract,
  assets,
  entities,
  readOnly,
  liveTuning = false,
  onPatch,
  onOpenScript,
}: {
  component: ScriptComponent;
  /** Null while the source has not been read yet. */
  contract: ScriptContract | null;
  assets: AssetManifest;
  entities: readonly ScriptEntityOption[];
  readOnly: boolean;
  /** Play keeps values editable; plain properties reach the next frame. */
  liveTuning?: boolean;
  onPatch: (patch: ScriptComponentPatch) => void;
  onOpenScript: (scriptAssetId: string) => void;
}) {
  const scripts = listScriptAssets(assets);
  const configurationDisabled =
    (readOnly && !liveTuning) || !component.enabled;
  const propertyDisabled =
    (readOnly && !liveTuning) || !component.enabled;

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-slate-600">
          Script
        </span>
        <div className="flex items-center gap-1.5">
          <select
            value={component.scriptAssetId}
            disabled={configurationDisabled}
            onChange={(event) =>
              onPatch({
                scriptAssetId: event.target.value,
              })
            }
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-45"
          >
            {scripts.length === 0 ? <option value="">なし</option> : null}
            {scripts.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onOpenScript(component.scriptAssetId)}
            disabled={!component.scriptAssetId}
            className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            開く
          </button>
        </div>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-slate-600">
          実行する場面
        </span>
        <select
          value={component.runIn}
          disabled={configurationDisabled}
          onChange={(event) =>
            onPatch({ runIn: event.target.value as ScriptComponent["runIn"] })
          }
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-45"
        >
          <option value="play">Playのみ</option>
          <option value="play-and-edit" disabled>
            Playと編集中（予約済み・未対応）
          </option>
        </select>
      </label>

      {contract === null ? (
        <p className="text-[11px] text-slate-500">Scriptを読み込んでいます…</p>
      ) : contract.props.length === 0 && contract.issues.length > 0 ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-2">
          <p className="text-[11px] font-medium text-amber-800">
            propertyを読み取れません
          </p>
          <ul className="mt-1 space-y-0.5">
            {contract.issues.slice(0, 3).map((issue, index) => (
              <li key={index} className="text-[11px] text-amber-700">
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : contract.props.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          このScriptはpropertyを宣言していません。
        </p>
      ) : (
        <div className="space-y-2 border-t border-slate-200 pt-2">
          {contract.props.map((descriptor) => (
            <ScriptPropField
              key={descriptor.name}
              descriptor={descriptor}
              component={component}
              descriptors={contract.props}
              assets={assets}
              entities={entities}
              disabled={propertyDisabled}
              referencesDisabled={configurationDisabled}
              onPatch={onPatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptPropField({
  descriptor,
  component,
  descriptors,
  assets,
  entities,
  disabled,
  referencesDisabled,
  onPatch,
}: {
  descriptor: ScriptPropDescriptor;
  component: ScriptComponent;
  descriptors: readonly ScriptPropDescriptor[];
  assets: AssetManifest;
  entities: readonly ScriptEntityOption[];
  disabled: boolean;
  referencesDisabled: boolean;
  onPatch: (patch: ScriptComponentPatch) => void;
}) {
  const value = resolveScriptPropValue(
    descriptor,
    component.properties[descriptor.name],
  );
  const label = descriptor.label ?? descriptor.name;

  const setValue = (next: JsonValue) =>
    onPatch({ properties: { ...component.properties, [descriptor.name]: next } });

  const setReference = (kind: "asset" | "entity", next: string) => {
    const key = kind === "asset" ? "assetReferences" : "entityReferences";
    const nextProperties = {
      ...component.properties,
      [descriptor.name]: next,
    };
    const previousPropertyReferences = new Set(
      descriptors
        .filter((candidate) => candidate.kind === kind)
        .map((candidate) => component.properties[candidate.name])
        .filter((entry): entry is string => typeof entry === "string" && Boolean(entry)),
    );
    const explicitReferences = component[key].filter(
      (id) => !previousPropertyReferences.has(id),
    );
    const nextPropertyReferences = descriptors
      .filter((candidate) => candidate.kind === kind)
      .map((candidate) => nextProperties[candidate.name])
      .filter((entry): entry is string => typeof entry === "string" && Boolean(entry));
    const references = [
      ...new Set([...explicitReferences, ...nextPropertyReferences]),
    ];
    onPatch({
      properties: nextProperties,
      [key]: references,
    });
  };

  const fieldDisabled =
    descriptor.kind === "asset" || descriptor.kind === "entity"
      ? referencesDisabled
      : disabled;

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-600">
        {label}
      </span>
      {descriptor.kind === "boolean" ? (
        <input
          type="checkbox"
          checked={value === true}
          disabled={fieldDisabled}
          onChange={(event) => setValue(event.target.checked)}
          className="h-3.5 w-3.5"
        />
      ) : descriptor.kind === "number" ? (
        <ScrubNumberInput
          value={typeof value === "number" ? value : 0}
          disabled={fieldDisabled}
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          ariaLabel={descriptor.label ?? descriptor.name}
          scrubLabel={descriptor.label ?? descriptor.name}
          onChange={setValue}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-45"
        />
      ) : descriptor.kind === "enum" ? (
        <select
          value={typeof value === "string" ? value : ""}
          disabled={fieldDisabled}
          onChange={(event) => setValue(event.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-45"
        >
          {(descriptor.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : descriptor.kind === "color" ? (
        <input
          type="color"
          value={typeof value === "string" ? value : "#ffffff"}
          disabled={fieldDisabled}
          onChange={(event) => setValue(event.target.value)}
          className="h-7 w-full rounded border border-slate-300 disabled:opacity-45"
        />
      ) : descriptor.kind === "vec2" || descriptor.kind === "vec3" ? (
        <VectorField
          length={descriptor.kind === "vec2" ? 2 : 3}
          value={Array.isArray(value) ? (value as number[]) : []}
          disabled={fieldDisabled}
          onChange={(next) =>
            setValue(
              next.map((entry) =>
                Math.min(
                  descriptor.max ?? Number.POSITIVE_INFINITY,
                  Math.max(
                    descriptor.min ?? Number.NEGATIVE_INFINITY,
                    entry,
                  ),
                ),
              ),
            )
          }
        />
      ) : descriptor.kind === "asset" ? (
        <select
          value={typeof value === "string" ? value : ""}
          disabled={referencesDisabled}
          onChange={(event) => setReference("asset", event.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-45"
        >
          <option value="">なし</option>
          {Object.values(assets.assets)
            .filter(
              (asset) =>
                !descriptor.assetKind || asset.kind === descriptor.assetKind,
            )
            .map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
        </select>
      ) : descriptor.kind === "entity" ? (
        <select
          value={typeof value === "string" ? value : ""}
          disabled={referencesDisabled}
          onChange={(event) => setReference("entity", event.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-45"
        >
          <option value="">なし</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          disabled={fieldDisabled}
          onChange={(event) => setValue(event.target.value)}
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-45"
        />
      )}
      {descriptor.description ? (
        <span className="mt-0.5 block text-[10px] text-slate-500">
          {descriptor.description}
        </span>
      ) : null}
    </label>
  );
}

function VectorField({
  length,
  value,
  disabled,
  onChange,
}: {
  length: number;
  value: number[];
  disabled: boolean;
  onChange: (next: number[]) => void;
}) {
  const current = Array.from(
    { length },
    (_unused, index) => value[index] ?? 0,
  );
  return (
    <div className="flex gap-1">
      {current.map((entry, index) => (
        <ScrubNumberInput
          key={index}
          value={entry}
          scrubStep={0.01}
          disabled={disabled}
          size="sm"
          compact
          prefix={"XYZ"[index]}
          ariaLabel={`${"XYZ"[index]}軸`}
          scrubLabel={`${"XYZ"[index]}軸`}
          onChange={(next) => {
            const nextValue = [...current];
            nextValue[index] = next;
            onChange(nextValue);
          }}
        />
      ))}
    </div>
  );
}
