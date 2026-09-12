export type WorldAssetPart = {
  shape: "box" | "cylinder";
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  rotation?: [number, number, number];
  metalness?: number;
};
const box = (position: WorldAssetPart["position"], size: WorldAssetPart["size"], color: string): WorldAssetPart => ({ shape: "box", position, size, color });
/** Shared by the catalog and the portable TSX: the preview is the placed model. */
export const VEHICLE_BODY: WorldAssetPart[] = [
  box([0, 0.38, 0], [1.65, 0.25, 2.5], "#164e63"),
  box([0, 0.62, -0.94], [1.55, 0.3, 0.65], "#22b8a8"),
  box([0, 0.62, 1.04], [1.55, 0.3, 0.35], "#22b8a8"),
  box([0, 0.35, -1.35], [1.7, 0.12, 0.16], "#273449"),
  box([0, 0.35, 1.35], [1.7, 0.12, 0.16], "#273449"),
  box([0, 1.55, 0.2], [1.72, 0.1, 1.95], "#e2e8d9"),
  ...[-0.74, 0.74].flatMap(x => [
    box([x, 1.1, -0.62], [0.06, 0.9, 0.06], "#273449"),
    box([x, 1.1, 1.08], [0.06, 0.9, 0.06], "#273449"),
    box([x, 0.66, -1.28], [0.22, 0.12, 0.035], "#fff3bd"),
    ...[-0.83, 0.83].map(z => ({ shape: "cylinder" as const, position: [x * 1.18, 0.32, z] as [number, number, number], size: [0.31, 0.31, 0.22] as [number, number, number], rotation: [0, 0, Math.PI / 2] as [number, number, number], color: "#18202c" })),
  ]),
  box([-0.4, 0.99, -0.65], [0.35, 0.05, 0.12], "#273449"),
];
export const SEAT_BODY: WorldAssetPart[] = [
  box([0, -0.07, 0], [0.62, 0.14, 0.62], "#d49552"),
  box([0, 0.28, 0.27], [0.62, 0.55, 0.12], "#c47c42"),
  ...[-0.25, 0.25].flatMap(x => [-0.24, 0.24].map(z => box([x, -0.3, z], [0.05, 0.45, 0.05], "#26384a"))),
  ...[-0.32, 0.32].map(x => box([x, 0.16, 0.03], [0.055, 0.05, 0.55], "#26384a")),
];
export function worldAssetPartsSource(parts: readonly WorldAssetPart[]): string {
  return parts.map(p => `<mesh position={${JSON.stringify(p.position)}}${p.rotation ? ` rotation={${JSON.stringify(p.rotation)}}` : ""}><${p.shape}Geometry args={${JSON.stringify(p.shape === "cylinder" ? [...p.size, 20] : p.size)}} /><meshStandardMaterial color="${p.color}" roughness={0.65} metalness={${p.metalness ?? 0.15}} /></mesh>`).join("\n");
}
