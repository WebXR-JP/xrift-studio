import { Physics } from "@react-three/rapier";
import {
  BillboardY,
  EntryLogBoard,
  Grabbable,
  Interactable,
  LiveVideoPlayer,
  Mirror,
  Portal,
  ScreenShareDisplay,
  Skybox,
  SpawnPoint,
  TagBoard,
  TextInput,
  Video180Sphere,
  VideoPlayer,
  VideoScreen,
  XRiftProvider,
  type EntryLogBoardProps,
  type GrabbableProps,
  type InstanceContextValue,
  type InteractableProps,
  type MirrorProps,
  type PortalProps,
  type ScreenShareDisplayProps,
  type SkyboxProps,
  type SpawnPointProps,
  type TagBoardProps,
  type TextInputProps,
  type Video180SphereProps,
  type VideoPlayerProps,
  type VideoScreenProps,
} from "@xrift/world-components";
import {
  Suspense,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  createXriftComponent,
  type SceneComponent,
  type XriftComponentDefinition,
} from "../../lib/visual-editor";

type XriftSceneComponent = Extract<SceneComponent, { type: "xrift-component" }>;

const PREVIEW_INSTANCE_IMPLEMENTATION: InstanceContextValue = {
  async getInstanceInfo(instanceId) {
    return {
      id: instanceId,
      name: "Studio Preview",
      description: null,
      currentUsers: 0,
      maxCapacity: 32,
      isPublic: false,
      allowGuests: true,
      world: {
        id: "studio-preview-world",
        name: "XRift World",
        description: null,
        thumbnailUrl: null,
        isPublic: false,
        instanceCount: 1,
        totalVisitCount: 0,
        uniqueVisitorCount: 0,
        favoriteCount: 0,
      },
    };
  },
  navigateToInstance() {
    // Studio never performs platform navigation from an editor preview.
  },
};

export function OfficialXriftPreviewProvider({
  children,
  withPhysics = false,
  gravity = [0, 0, 0],
}: {
  children: ReactNode;
  withPhysics?: boolean;
  gravity?: [number, number, number];
}) {
  const content = (
    <XRiftProvider
      baseUrl=""
      instanceImplementation={PREVIEW_INSTANCE_IMPLEMENTATION}
      placementMode="preview"
    >
      {children}
    </XRiftProvider>
  );
  if (!withPhysics) return content;
  return (
    <Suspense fallback={null}>
      <Physics gravity={gravity} timeStep="vary">
        {content}
      </Physics>
    </Suspense>
  );
}

export function OfficialXriftComponentRenderer({
  component,
}: {
  component: XriftSceneComponent;
}) {
  if (!component.enabled || isOfficialXriftWrapperComponent(component)) {
    return null;
  }
  const properties = component.properties;
  switch (component.schemaId) {
    case XRIFT_COMPONENT_SCHEMA_IDS.mirror:
      return <Mirror {...(properties as unknown as MirrorProps)} />;
    case XRIFT_COMPONENT_SCHEMA_IDS.skybox:
      return <Skybox {...(properties as unknown as SkyboxProps)} />;
    case XRIFT_COMPONENT_SCHEMA_IDS.videoScreen:
      return <VideoScreen {...(properties as unknown as VideoScreenProps)} />;
    case XRIFT_COMPONENT_SCHEMA_IDS.videoPlayer:
      return <VideoPlayer {...(properties as unknown as VideoPlayerProps)} />;
    case XRIFT_COMPONENT_SCHEMA_IDS.liveVideoPlayer:
      return (
        <LiveVideoPlayer
          {...(properties as unknown as ComponentProps<typeof LiveVideoPlayer>)}
        />
      );
    case XRIFT_COMPONENT_SCHEMA_IDS.video180Sphere:
      return (
        <Video180Sphere
          {...(properties as unknown as Video180SphereProps)}
        />
      );
    case XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay:
      return (
        <ScreenShareDisplay
          {...(properties as unknown as ScreenShareDisplayProps)}
        />
      );
    case XRIFT_COMPONENT_SCHEMA_IDS.spawnPoint:
      return <SpawnPoint {...(properties as unknown as SpawnPointProps)} />;
    case XRIFT_COMPONENT_SCHEMA_IDS.tagBoard:
      return <TagBoard {...(properties as unknown as TagBoardProps)} />;
    case XRIFT_COMPONENT_SCHEMA_IDS.entryLogBoard:
      return (
        <EntryLogBoard
          {...(properties as unknown as EntryLogBoardProps)}
        />
      );
    case XRIFT_COMPONENT_SCHEMA_IDS.portal: {
      const portalProps = properties as unknown as PortalProps;
      return <Portal {...portalProps} instanceId={portalProps.instanceId ?? ""} />;
    }
    default:
      return null;
  }
}

export function OfficialXriftEntityWrappers({
  components,
  children,
}: {
  components: readonly XriftSceneComponent[];
  children: ReactNode;
}) {
  return components
    .filter((component) => component.enabled && isOfficialXriftWrapperComponent(component))
    .reduceRight<ReactNode>(
      (content, component) => wrapOfficialComponent(component, content),
      children,
    );
}

export function OfficialXriftComponentSample({
  definition,
}: {
  definition: XriftComponentDefinition;
}) {
  const component = useMemo(
    () =>
      createXriftComponent(definition.schemaId, {
        properties: officialSampleProperties(definition.importName),
      }),
    [definition.importName, definition.schemaId],
  );
  if (!component) return null;
  if (isOfficialXriftWrapperComponent(component)) {
    return (
      <OfficialXriftEntityWrappers components={[component]}>
        <OfficialWrapperSample importName={definition.importName} />
      </OfficialXriftEntityWrappers>
    );
  }
  return <OfficialXriftComponentRenderer component={component} />;
}

function officialSampleProperties(
  importName: string,
): Record<string, string | number | boolean | number[]> {
  switch (importName) {
    case "Mirror":
      return { position: [0, 0, 0], size: [2, 1.25] };
    case "VideoScreen":
      return { position: [0, 0, 0], scale: [2, 1.125], playing: false };
    case "VideoPlayer":
    case "LiveVideoPlayer":
      return { position: [0, 0, 0], width: 2, playing: false };
    case "ScreenShareDisplay":
      return { position: [0, 0, 0], width: 2 };
    case "Video180Sphere":
      return {
        url: "",
        position: [0, 0, 0],
        radius: 1.4,
        segments: 32,
        playing: false,
      };
    case "TagBoard":
    case "EntryLogBoard":
      return { position: [0, 0, 0], scale: 0.8 };
    case "Portal":
      return {
        instanceId: "00000000-0000-4000-8000-000000000043",
        position: [0, 0, 0],
        disabled: false,
      };
    case "SpawnPoint":
      return { position: [0, 0, 0], yaw: 0 };
    default:
      return {};
  }
}

export function isOfficialXriftWrapperComponent(
  component: XriftSceneComponent,
): boolean {
  return (
    component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.interactable ||
    component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.grabbable ||
    component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.textInput ||
    component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.billboardY
  );
}

export function officialXriftComponentNeedsPhysics(
  component: XriftSceneComponent,
): boolean {
  return component.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.portal;
}

function wrapOfficialComponent(
  component: XriftSceneComponent,
  children: ReactNode,
): ReactNode {
  const properties = component.properties;
  switch (component.schemaId) {
    case XRIFT_COMPONENT_SCHEMA_IDS.interactable: {
      const props = properties as unknown as Omit<
        InteractableProps,
        "children" | "onInteract"
      >;
      return (
        <Interactable {...props} onInteract={() => {}}>
          {children}
        </Interactable>
      );
    }
    case XRIFT_COMPONENT_SCHEMA_IDS.grabbable: {
      const props = properties as unknown as Omit<
        GrabbableProps,
        "children" | "onMove"
      >;
      return (
        <Grabbable {...props} onMove={() => {}}>
          {children}
        </Grabbable>
      );
    }
    case XRIFT_COMPONENT_SCHEMA_IDS.textInput: {
      const props = properties as unknown as Omit<
        TextInputProps,
        "children" | "onSubmit"
      >;
      return (
        <TextInput {...props} onSubmit={() => {}}>
          {children}
        </TextInput>
      );
    }
    case XRIFT_COMPONENT_SCHEMA_IDS.billboardY:
      return (
        <BillboardY
          {...(properties as unknown as ComponentProps<typeof BillboardY>)}
        >
          {children}
        </BillboardY>
      );
    default:
      return children;
  }
}

function OfficialWrapperSample({ importName }: { importName: string }) {
  switch (importName) {
    case "Interactable":
      return (
        <mesh>
          <boxGeometry args={[1, 0.35, 0.2]} />
          <meshStandardMaterial color="#8b5cf6" />
        </mesh>
      );
    case "Grabbable":
      return (
        <mesh>
          <sphereGeometry args={[0.3, 24, 16]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      );
    case "TextInput":
      return (
        <mesh>
          <boxGeometry args={[1.8, 0.5, 0.1]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      );
    case "BillboardY":
      return (
        <mesh>
          <planeGeometry args={[2, 0.5]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      );
    default:
      return null;
  }
}
