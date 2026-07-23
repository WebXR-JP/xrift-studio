import { PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import type { PerspectiveCamera as ThreePerspectiveCamera } from "three";
import type { XriftComponentDefinition } from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";
import {
  OfficialXriftComponentSample,
  OfficialXriftPreviewProvider,
} from "./OfficialXriftComponentRenderer";

export function OfficialXriftComponentStaticPreview({
  definition,
  className = "h-[180px] w-[320px]",
}: {
  definition: XriftComponentDefinition;
  className?: string;
}) {
  const portal = definition.importName === "Portal";
  const Icon = EDITOR_ICONS[definition.icon];
  return (
    <div
      className={`relative overflow-hidden bg-slate-50 ${className}`}
      data-official-xrift-static-preview={definition.importName}
    >
      <Canvas
        frameloop="always"
        dpr={1}
        gl={{ alpha: false, antialias: true, powerPreference: "high-performance" }}
      >
        <OfficialXriftPreviewProvider withPhysics={portal}>
          <color attach="background" args={["#f8fafc"]} />
          <PreviewCamera definition={definition} featured />
          <ambientLight intensity={1.4} />
          <directionalLight position={[3, 5, 4]} intensity={2.1} />
          <directionalLight
            position={[-3, 2, 1]}
            intensity={0.65}
            color="#c4b5fd"
          />
          <PreviewPosition definition={definition}>
            <OfficialXriftComponentSample definition={definition} />
          </PreviewPosition>
          {definition.importName !== "Skybox" &&
          definition.importName !== "Video180Sphere" ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]}>
              <circleGeometry args={[2.5, 48]} />
              <meshStandardMaterial color="#e8edf3" roughness={0.96} />
            </mesh>
          ) : null}
        </OfficialXriftPreviewProvider>
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent px-3 pb-2.5 pt-8 text-white">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <Icon size={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{definition.label}</span>
        </span>
        <span className="ml-2 shrink-0 text-[9px] font-medium tracking-wide text-slate-200">
          XRift Official
        </span>
      </div>
    </div>
  );
}

function PreviewCamera({
  definition,
  featured,
}: {
  definition: XriftComponentDefinition;
  featured: boolean;
}) {
  const cameraRef = useRef<ThreePerspectiveCamera | null>(null);
  const config = cameraConfig(definition.importName, featured);
  useLayoutEffect(() => {
    cameraRef.current?.lookAt(
      config.target[0],
      config.target[1],
      config.target[2],
    );
    cameraRef.current?.updateProjectionMatrix();
  }, [config.target]);
  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={config.position}
      fov={config.fov}
      near={0.01}
      far={1000}
    />
  );
}

function PreviewPosition({
  definition,
  children,
}: {
  definition: XriftComponentDefinition;
  children: ReactNode;
}) {
  const name = definition.importName;
  if (name === "Portal") {
    return <group scale={0.72} position={[0, -0.62, 0]}>{children}</group>;
  }
  if (name === "SpawnPoint") {
    return <group position={[0, -0.62, 0]}>{children}</group>;
  }
  if (name === "TagBoard" || name === "EntryLogBoard") {
    return <group scale={0.72} position={[0, -0.05, 0]}>{children}</group>;
  }
  return <group>{children}</group>;
}

function cameraConfig(name: string, featured: boolean) {
  if (name === "Portal") {
    return {
      position: featured
        ? ([2.65, 2.15, 3.25] as const)
        : ([2.85, 2.3, 3.45] as const),
      target: [0, 0.25, 0] as const,
      fov: featured ? 33 : 36,
    };
  }
  if (name === "Skybox" || name === "Video180Sphere") {
    return {
      position: [0, 0.15, 0.08] as const,
      target: [0, 0.1, -1] as const,
      fov: 62,
    };
  }
  return {
    position: [2.3, 1.45, 3.2] as const,
    target: [0, -0.02, 0] as const,
    fov: 34,
  };
}
