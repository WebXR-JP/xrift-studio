import { useAfterPhysicsStep } from "@react-three/rapier";
import { useLayoutEffect, useRef } from "react";

/** Notify once after Rapier has indexed the committed colliders for queries. */
export function WorldPlayPhysicsWarmup({ active, onReady }: { active: boolean; onReady(): void }) {
  const mounted = useRef(false);
  const reported = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useAfterPhysicsStep(() => {
    if (!active || reported.current) return;
    reported.current = true;
    queueMicrotask(() => {
      if (mounted.current && activeRef.current) onReady();
    });
  });
  return null;
}
