import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Cuboid,
  Puzzle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  BUILTIN_PRIMITIVE_CREATION_CATALOG,
  EDITOR_COMPONENT_REGISTRY,
  getXriftComponentMenuGroups,
  type BuiltinPrefabRecipe,
  type EditorComponentDefinition,
  type SceneEntity,
  type VisualProjectKind,
} from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";

type CreateMenuPage = "root" | "primitive" | "xrift" | "component";

type Props = {
  open: boolean;
  readOnly: boolean;
  importBusy: boolean;
  projectKind: VisualProjectKind;
  selectedEntity?: SceneEntity;
  builtinPrefabRecipes: readonly BuiltinPrefabRecipe[];
  onClose: () => void;
  onCreateEmpty: () => void;
  onCreatePrimitive: (creationId: string) => void;
  onPlaceBuiltinPrefab: (recipeId: string) => void;
  onCreateXriftObject: (definitionId: string) => void;
  onAddComponent: (entityId: string, definitionId: string) => void;
};

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  core: "Core",
  rendering: "Rendering",
  physics: "Physics",
  interaction: "Interaction",
  media: "Media",
  world: "World",
};

export function EditorCreateMenu({
  open,
  readOnly,
  importBusy,
  projectKind,
  selectedEntity,
  builtinPrefabRecipes,
  onClose,
  onCreateEmpty,
  onCreatePrimitive,
  onPlaceBuiltinPrefab,
  onCreateXriftObject,
  onAddComponent,
}: Props) {
  const [page, setPage] = useState<CreateMenuPage>("root");

  useEffect(() => {
    if (!open) setPage("root");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const componentGroups = useMemo(() => {
    const definitions = EDITOR_COMPONENT_REGISTRY.filter(
      (definition) =>
        definition.componentType !== "official-xrift" &&
        definition.id !== "core.spawn" &&
        definition.projectKinds.includes(projectKind),
    );
    return Array.from(
      definitions.reduce((groups, definition) => {
        const entries = groups.get(definition.category) ?? [];
        entries.push(definition);
        groups.set(definition.category, entries);
        return groups;
      }, new Map<string, EditorComponentDefinition[]>()),
    );
  }, [projectKind]);

  const xriftGroups = useMemo(
    () => getXriftComponentMenuGroups(projectKind),
    [projectKind],
  );

  if (!open) return null;

  const disabled = readOnly || importBusy;
  const placeRecipe = (recipeId: string) => {
    onPlaceBuiltinPrefab(recipeId);
    onClose();
  };
  const addComponent = (definitionId: string) => {
    if (!selectedEntity) return;
    onAddComponent(selectedEntity.id, definitionId);
    onClose();
  };

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onPointerDown={onClose}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
      />
      <div
        role="menu"
        aria-label="Create"
        className="absolute left-0 top-8 z-50 flex max-h-[min(620px,calc(100vh-150px))] w-[340px] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl"
      >
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-2">
        {page !== "root" ? (
          <button
            type="button"
            onClick={() => setPage("root")}
            aria-label="Createの最初へ戻る"
            className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-900"
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900">
            {page === "root"
              ? "Create"
              : page === "primitive"
                ? "Primitive"
                : page === "xrift"
                  ? "XRift Component"
                  : "Component"}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {page === "root"
              ? "Sceneへ作成するものを選びます"
              : page === "xrift"
                ? selectedEntity
                  ? `Sceneへ配置、または「${selectedEntity.name}」へ追加`
                  : "Sceneへ配置。Entityを選択するとComponentも追加できます"
                : page === "component"
                  ? selectedEntity
                    ? `「${selectedEntity.name}」へ追加`
                    : "Hierarchyで追加先のEntityを選択してください"
                  : "基本形状をSceneへ追加"}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {page === "root" ? (
          <div className="space-y-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onCreateEmpty();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600">
                <EDITOR_ICONS.sceneEntity size={16} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-800">
                  Empty Entity
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                  Transformだけを持つ整理用のEntity
                </span>
              </span>
              <span className="text-[10px] font-medium text-slate-400">作成</span>
            </button>
            <RootChoice
              icon={Cuboid}
              title="Primitive"
              description="Box、Sphere、Planeなどの基本形状"
              onClick={() => setPage("primitive")}
            />
            <RootChoice
              icon={Sparkles}
              title="XRift Component"
              description="Spawn、MirrorなどXRift向けの機能"
              onClick={() => setPage("xrift")}
            />
            <RootChoice
              icon={Puzzle}
              title="Component"
              description={
                selectedEntity
                  ? `Transform、Collider、Lightを「${selectedEntity.name}」へ追加`
                  : "Entityを選択してRenderer、Collider、Lightを追加"
              }
              disabled={!selectedEntity}
              onClick={() => setPage("component")}
            />
          </div>
        ) : null}

        {page === "primitive" ? (
          <MenuSection label="Scene Object">
            {BUILTIN_PRIMITIVE_CREATION_CATALOG.map((entry) => (
              <MenuItem
                key={entry.creationId}
                icon={EDITOR_ICONS.primitive}
                label={entry.name}
                detail={entry.description}
                disabled={disabled}
                trailing="作成"
                onClick={() => {
                  onCreatePrimitive(entry.creationId);
                  onClose();
                }}
              />
            ))}
          </MenuSection>
        ) : null}

        {page === "xrift" ? (
          <div className="space-y-2">
            <MenuSection label="Sceneへ配置">
              {builtinPrefabRecipes.map((recipe) => {
                const Icon =
                  recipe.icon === "spawn-point"
                    ? EDITOR_ICONS.spawn
                    : EDITOR_ICONS.mirror;
                return (
                  <MenuItem
                    key={recipe.id}
                    icon={Icon}
                    label={recipe.name}
                    detail={recipe.description}
                    disabled={disabled}
                    trailing="配置"
                    onClick={() => placeRecipe(recipe.id)}
                  />
                );
              })}
            </MenuSection>

            {xriftGroups.map((group) => (
              <MenuSection
                key={group.category}
                label={`${group.label} Component`}
              >
                {group.components.map((definition) => {
                  const canCreateHost = definition.attachBehavior.kind === "leaf";
                  const duplicate = Boolean(
                    !definition.allowMultiplePerEntity &&
                      selectedEntity?.components.some(
                        (component) =>
                          component.type === "xrift-component" &&
                          component.schemaId === definition.schemaId,
                      ),
                  );
                  return (
                    <MenuItem
                      key={definition.schemaId}
                      icon={Puzzle}
                      label={definition.label}
                      detail={definition.description}
                      disabled={
                        disabled ||
                        duplicate ||
                        (!selectedEntity && !canCreateHost)
                      }
                      trailing={
                        duplicate
                          ? "追加済み"
                          : selectedEntity
                            ? "追加"
                            : canCreateHost
                              ? "作成"
                              : "Entityを選択"
                      }
                      onClick={() => {
                        if (selectedEntity) addComponent(definition.schemaId);
                        else {
                          onCreateXriftObject(definition.schemaId);
                          onClose();
                        }
                      }}
                    />
                  );
                })}
              </MenuSection>
            ))}
          </div>
        ) : null}

        {page === "component" ? (
          <div className="space-y-2">
            {componentGroups.map(([category, definitions]) => (
              <MenuSection
                key={category}
                label={CATEGORY_LABELS[category] ?? category}
              >
                {definitions.map((definition) => {
                  const duplicate = Boolean(
                    !definition.allowMultiple &&
                      selectedEntity?.components.some((component) =>
                        definition.componentType === "builtin-mesh"
                          ? component.type === "mesh"
                          : component.type === definition.componentType,
                      ),
                  );
                  return (
                    <MenuItem
                      key={definition.id}
                      icon={Puzzle}
                      label={definition.label}
                      disabled={disabled || !selectedEntity || duplicate}
                      trailing={duplicate ? "追加済み" : "追加"}
                      onClick={() => addComponent(definition.id)}
                    />
                  );
                })}
              </MenuSection>
            ))}
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}

function RootChoice({
  icon: Icon,
  title,
  description,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-600 group-hover:border-violet-200 group-hover:bg-white group-hover:text-violet-700">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
          {description}
        </span>
      </span>
      <ChevronRight size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
    </button>
  );
}

function MenuSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function MenuItem({
  icon: Icon,
  label,
  detail,
  trailing,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  trailing?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
            {detail}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-[10px] font-medium text-slate-400">
          {trailing}
        </span>
      ) : null}
    </button>
  );
}
