import { PerspectiveCamera, View } from "@react-three/drei";
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

export function OfficialXriftPreviewCanvas({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative isolate ${className}`}>
      {children}
      <Canvas
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20"
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}

export function OfficialXriftComponentThumbnail({
  definition,
  featured = false,
}: {
  definition: XriftComponentDefinition;
  featured?: boolean;
}) {
  const Icon = EDITOR_ICONS[definition.icon];
  const portal = definition.importName === "Portal";
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      <View className="absolute inset-0" frames={Infinity}>
        <OfficialXriftPreviewProvider withPhysics={portal}>
          <color attach="background" args={["#f8fafc"]} />
          <PreviewCamera definition={definition} featured={featured} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[3, 5, 4]} intensity={2.1} />
          <directionalLight position={[-3, 2, 1]} intensity={0.65} color="#c4b5fd" />
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
      </View>
      <div className="pointer-events-none absolute left-2 top-2 z-30 inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 shadow-sm backdrop-blur">
        <Icon size={10} aria-hidden="true" />
        Official WebGL
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
