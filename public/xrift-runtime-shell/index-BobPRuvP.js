import { importShared } from './__federation_fn_import-CVj0xDfO.js';
import { World } from './__federation_expose_World-F4ccySPn.js';

true              &&(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
}());

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
