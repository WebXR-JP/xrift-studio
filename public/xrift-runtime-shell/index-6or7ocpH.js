import { importShared } from './__federation_fn_import-cj4OIX5H.js';
import { World } from './__federation_expose_World-BP_wbAIi.js';

const world = {"physics":{"gravity":9.81,"allowInfiniteJump":true},"camera":{"near":0.1,"far":1000}};
const xriftConfig = {
  world,
};

const {jsx} = await importShared('react/jsx-runtime');

const {DevEnvironment,XRiftProvider} = await importShared('@xrift/world-components');

const {createRoot} = await importShared('react-dom/client');
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const worldConfig = xriftConfig.world;
createRoot(rootElement).render(
  /* @__PURE__ */ jsx(XRiftProvider, { baseUrl: "/", children: /* @__PURE__ */ jsx(
    DevEnvironment,
    {
      physicsConfig: worldConfig.physics,
      camera: worldConfig.camera,
      outputBufferType: worldConfig.outputBufferType,
      children: /* @__PURE__ */ jsx(World, {})
    }
  ) })
);
