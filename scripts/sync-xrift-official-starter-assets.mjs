import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const revision = "05abcf6a11844f9108363dc6823a1908569452ac";
const baseUrl = `https://raw.githubusercontent.com/WebXR-JP/xrift-world-template/${revision}`;
const outputDirectory = path.resolve("public/visual-editor/starter-assets");
const upstream = [
  {
    source: "public/tokyo-station.jpg",
    // Upstream keeps a .jpg name, but its bytes are PNG.
    target: "xrift-world-template-tokyo-station.png",
    sha256: "613c5e5af594cf273bc14076cc86761a74826e9c57fbcec1e45c42a988fd3265",
  },
  {
    source: "src/World.tsx",
    target: "xrift-world-template-World.tsx.txt",
    sha256: "511e0698a6ad05bd54218fd05867f63f91a1da97b5218db5544c6ab0c12c80fa",
  },
  {
    source: "LICENSE",
    target: "xrift-world-template-LICENSE.txt",
    sha256: "73dec738d6d49a07e506b0d4014ec6a6247c1b50ca6bf8aee62763e81f65f176",
  },
];

await mkdir(outputDirectory, { recursive: true });
for (const asset of upstream) {
  const response = await fetch(`${baseUrl}/${asset.source}`);
  if (!response.ok) throw new Error(`${asset.source}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== asset.sha256) {
    throw new Error(`${asset.source}: SHA-256 mismatch (${actual})`);
  }
  await writeFile(path.join(outputDirectory, asset.target), bytes);
  process.stdout.write(`${asset.target} ${bytes.byteLength} ${actual}\n`);
}
