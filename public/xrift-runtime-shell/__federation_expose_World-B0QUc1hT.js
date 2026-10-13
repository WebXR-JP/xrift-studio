import { importShared } from './__federation_fn_import-DBzjo2-f.js';
import { a as XriftWorld } from './index-CJleTosm.js';

const {jsx} = await importShared('react/jsx-runtime');
const MANIFEST_URL = new URL("./xrift-runtime.json", import.meta.url).href;
const World = ({ position = [0, 0, 0], scale = 1 }) => /* @__PURE__ */ jsx("group", { position, scale, children: /* @__PURE__ */ jsx(XriftWorld, { manifest: MANIFEST_URL, physics: "inherit" }) });

export { World };
