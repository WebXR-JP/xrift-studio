import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { attachModelSelectionHighlight } from "../src/components/visual-editor/model-selection-highlight";

function Poles({ selected, select }: { selected: number | null; select: (id: number) => void }) {
  const poles = useMemo(() => [-3, 0, 3].map((x, index) => {
    const group = new Group();
    group.position.x = x;
    group.userData.pole = index;
    const material = new MeshStandardMaterial({ color: "#737b85" });
    const shaft = new Mesh(new BoxGeometry(0.2, 3.5, 0.2), material);
    shaft.position.y = 1.75;
    const crossbar = new Mesh(new BoxGeometry(1.2, 0.12, 0.14), material);
    crossbar.position.y = 3;
    group.add(shaft, crossbar);
    return group;
  }), []);
  useLayoutEffect(() => selected === null ? undefined : attachModelSelectionHighlight(poles[selected]), [poles, selected]);
  return <>{poles.map((pole, index) => <primitive key={index} object={pole} onClick={(event: { stopPropagation(): void }) => { event.stopPropagation(); select(index); }} />)}</>;
}

function Ready({ report }: { report: () => void }) {
  const frames = useRef(0);
  useFrame(() => { if (++frames.current === 2) report(); });
  return null;
}

function Fixture() {
  const [selected, select] = useState<number | null>(0);
  const [ready, setReady] = useState(false);
  return <div data-testid="selection-fixture" data-ready={ready} style={{ position: "fixed", inset: 0, background: "#e2e8f0" }}>
    <div style={{ position: "absolute", zIndex: 1, padding: 16 }}>
      <p role="status">{selected === null ? "未選択" : `電柱 ${selected + 1} を選択中`}</p>
      <button onClick={() => select(null)}>選択を解除</button>
    </div>
    <Canvas orthographic camera={{ position: [0, 2, 12], zoom: 75 }}>
      <ambientLight intensity={2} />
      <directionalLight position={[3, 5, 6]} intensity={2} />
      <Poles selected={selected} select={select} />
      <Ready report={() => setReady(true)} />
    </Canvas>
  </div>;
}

export function mountModelSelectionFixture() {
  document.getElementById("root")!.style.display = "none";
  const root = document.createElement("div");
  document.body.append(root);
  createRoot(root).render(<Fixture />);
}
