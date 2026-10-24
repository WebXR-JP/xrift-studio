import { importShared } from './__federation_fn_import-CscxdL7B.js';
import { X as XriftItem } from './index-1s7m4X3Y.js';

const {jsx} = await importShared('react/jsx-runtime');
const MANIFEST_URL = new URL("./xrift-runtime.json", import.meta.url).href;
const Item = ({ position = [0, 0, 0], scale = 1 }) => /* @__PURE__ */ jsx("group", { position, scale, children: /* @__PURE__ */ jsx(XriftItem, { manifest: MANIFEST_URL }) });

export { Item, Item as default };
