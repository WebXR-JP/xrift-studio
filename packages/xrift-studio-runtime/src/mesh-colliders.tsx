import { createPortal } from "@react-three/fiber";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BallCollider, ConvexHullCollider, CuboidCollider, TrimeshCollider, useRapier, type RapierCollider } from "@react-three/rapier";
import type { Group, Object3D } from "three";
import type { XriftColliderLoadRegistration, XriftColliderLoadState, XriftColliderLoadTracker } from "./mesh-collider-status.js";
import { collectXriftMeshColliderShapes, findXriftColliderBody, observeXriftColliderChildren, type XriftMeshColliderShape, type XriftMeshColliderType } from "./mesh-collider-geometry.js";

export const XriftColliderLoadContext = createContext<XriftColliderLoadTracker | null>(null);

export type XriftMeshCollidersProps = {
  type: XriftMeshColliderType;
  children: ReactNode;
  sensor?: boolean;
  friction?: number;
  restitution?: number;
};
type XriftColliderProjection = { shapes: readonly XriftMeshColliderShape[]; body: Object3D | null; revision: number };

/** Child effects have created the actual Rapier shapes before this reports ready. */
function XriftCommittedMeshColliders({ projection, type, surface, report }: {
  projection: XriftColliderProjection;
  type: XriftMeshColliderType;
  surface: Pick<XriftMeshCollidersProps, "sensor" | "friction" | "restitution">;
  report(revision: number, state: XriftColliderLoadState): void;
}) {
  const { world } = useRapier();
  const handles = useRef(new Map<string, RapierCollider>());
  // The verifier is keyed by generation; old handles cannot satisfy a new load.
  useEffect(() => {
    const valid = projection.shapes.every((shape) => {
      const collider = handles.current.get(shape.key);
      return collider !== undefined && world.getCollider(collider.handle) != null;
    });
    report(projection.revision, valid
      ? { status: "ready" }
      : { status: "error", message: "Mesh Colliderを物理空間に登録できませんでした" });
  }, [projection, report, world]);
  return <>{projection.shapes.map((shape) => {
    const key = `${projection.revision}:${type}:${shape.key}`;
    const ref = (collider: RapierCollider | null) => {
      if (collider) handles.current.set(shape.key, collider);
      else handles.current.delete(shape.key);
    };
    if (type === "cuboid") return <CuboidCollider key={key} ref={ref} args={shape.halfExtents} position={shape.position} quaternion={shape.quaternion} {...surface} />;
    if (type === "ball") return <BallCollider key={key} ref={ref} args={[shape.radius]} position={shape.ballPosition} {...surface} />;
    if (type === "hull") return <ConvexHullCollider key={key} ref={ref} args={[shape.geometry.vertices]} {...surface} />;
    return <TrimeshCollider key={key} ref={ref} args={[shape.geometry.vertices, shape.geometry.indices]} {...surface} />;
  })}</>;
}

/** Follow late model loads without remounting their scripts or rigid bodies. */
export function XRiftStudioMeshColliders({ type, children, ...surface }: XriftMeshCollidersProps) {
  const source = useRef<Group>(null);
  const tracker = useContext(XriftColliderLoadContext);
  const registration = useRef<XriftColliderLoadRegistration | null>(null);
  const revision = useRef(0);
  const [projection, setProjection] = useState<XriftColliderProjection>({ shapes: [], body: null, revision: 0 });
  useLayoutEffect(() => {
    const resource = tracker?.register() ?? null;
    registration.current = resource;
    return () => { resource?.dispose(); registration.current = null; };
  }, [tracker]);
  const report = useCallback((forRevision: number, state: XriftColliderLoadState) => {
    if (forRevision === revision.current) registration.current?.update(state);
  }, []);
  useLayoutEffect(() => {
    const root = source.current;
    if (!root) return;
    let active = true;
    let queued = false;
    const refresh = () => {
      if (!active) return;
      const nextRevision = ++revision.current;
      registration.current?.update({ status: "loading" });
      try {
        const body = findXriftColliderBody(root);
        setProjection({ body, shapes: collectXriftMeshColliderShapes(root, body ?? root), revision: nextRevision });
      } catch (error) {
        // Never mark this failed generation ready through an empty projection.
        const message = error instanceof Error ? error.message : String(error);
        setProjection({ shapes: [], body: null, revision: -nextRevision });
        registration.current?.update({ status: "error", message });
        console.error("Mesh Colliderを生成できませんでした:", error);
      }
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      // Block startup immediately, not only after the queued React update.
      registration.current?.update({ status: "loading" });
      queueMicrotask(() => { queued = false; refresh(); });
    };
    const stop = observeXriftColliderChildren(root, schedule);
    refresh();
    return () => { active = false; revision.current += 1; stop(); };
  }, [children, type, tracker]);
  const colliders = projection.revision > 0
    ? <XriftCommittedMeshColliders key={projection.revision} projection={projection} type={type} surface={surface} report={report} />
    : null;
  return (
    <group userData={{ r3RapierType: "MeshCollider" }}>
      <group ref={source}>{children}</group>
      {projection.body ? createPortal(colliders, projection.body) : colliders}
    </group>
  );
}
