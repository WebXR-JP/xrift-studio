declare module "troika-three-text" {
  import { Mesh } from "three";

  export class Text extends Mesh {
    text: string;
    color: string | number;
    fontSize: number;
    maxWidth: number;
    anchorX: "left" | "center" | "right";
    anchorY: "top" | "middle" | "bottom";
    outlineWidth: number | string;
    outlineColor: string | number;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
