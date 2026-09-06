import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Object3D } from "three";
import { createModelInstancing } from "../model-instancing.js";

export function XriftModelInstancing({ entityIds, entityKey = "xriftEntityId", root }: {
  entityIds: readonly string[]; entityKey?: string; root?: Object3D;
}) {
  const anchor = useRef<Group>(null);
  const manager = useRef<ReturnType<typeof createModelInstancing> | null>(null);
  const elapsed = useRef(0);
  useEffect(() => {
    const target = root ?? anchor.current?.parent;
    if (!target || entityIds.length === 0) return;
    const current = createModelInstancing(target, entityIds, entityKey);
    manager.current = current;
    // Models/materials can finish loading after the parent Suspense boundary.
    current.update();
    return () => { manager.current = null; current.dispose(); };
  }, [root, entityIds, entityKey]);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    manager.current?.update();
  });
  return <group ref={anchor} />;
}
