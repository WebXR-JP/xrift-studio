/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const proxyMarker = /* @__PURE__ */ Symbol("Comlink.proxy");
const createEndpoint = /* @__PURE__ */ Symbol("Comlink.endpoint");
const releaseProxy = /* @__PURE__ */ Symbol("Comlink.releaseProxy");
const finalizer = /* @__PURE__ */ Symbol("Comlink.finalizer");
const throwMarker = /* @__PURE__ */ Symbol("Comlink.thrown");
const isObject = (val) => typeof val === "object" && val !== null || typeof val === "function";
const proxyTransferHandler = {
  canHandle: (val) => isObject(val) && val[proxyMarker],
  serialize(obj) {
    const { port1, port2 } = new MessageChannel();
    expose(obj, port1);
    return [port2, [port2]];
  },
  deserialize(port) {
    port.start();
    return wrap(port);
  }
};
const throwTransferHandler = {
  canHandle: (value) => isObject(value) && throwMarker in value,
  serialize({ value }) {
    let serialized;
    if (value instanceof Error) {
      serialized = {
        isError: true,
        value: {
          message: value.message,
          name: value.name,
          stack: value.stack
        }
      };
    } else {
      serialized = { isError: false, value };
    }
    return [serialized, []];
  },
  deserialize(serialized) {
    if (serialized.isError) {
      throw Object.assign(new Error(serialized.value.message), serialized.value);
    }
    throw serialized.value;
  }
};
const transferHandlers = /* @__PURE__ */ new Map([
  ["proxy", proxyTransferHandler],
  ["throw", throwTransferHandler]
]);
function isAllowedOrigin(allowedOrigins, origin) {
  for (const allowedOrigin of allowedOrigins) {
    if (origin === allowedOrigin || allowedOrigin === "*") {
      return true;
    }
    if (allowedOrigin instanceof RegExp && allowedOrigin.test(origin)) {
      return true;
    }
  }
  return false;
}
function expose(obj, ep = globalThis, allowedOrigins = ["*"]) {
  ep.addEventListener("message", function callback(ev) {
    if (!ev || !ev.data) {
      return;
    }
    if (!isAllowedOrigin(allowedOrigins, ev.origin)) {
      console.warn(`Invalid origin '${ev.origin}' for comlink proxy`);
      return;
    }
    const { id, type, path } = Object.assign({ path: [] }, ev.data);
    const argumentList = (ev.data.argumentList || []).map(fromWireValue);
    let returnValue;
    try {
      const parent = path.slice(0, -1).reduce((obj2, prop) => obj2[prop], obj);
      const rawValue = path.reduce((obj2, prop) => obj2[prop], obj);
      switch (type) {
        case "GET":
          {
            returnValue = rawValue;
          }
          break;
        case "SET":
          {
            parent[path.slice(-1)[0]] = fromWireValue(ev.data.value);
            returnValue = true;
          }
          break;
        case "APPLY":
          {
            returnValue = rawValue.apply(parent, argumentList);
          }
          break;
        case "CONSTRUCT":
          {
            const value = new rawValue(...argumentList);
            returnValue = proxy(value);
          }
          break;
        case "ENDPOINT":
          {
            const { port1, port2 } = new MessageChannel();
            expose(obj, port2);
            returnValue = transfer(port1, [port1]);
          }
          break;
        case "RELEASE":
          {
            returnValue = void 0;
          }
          break;
        default:
          return;
      }
    } catch (value) {
      returnValue = { value, [throwMarker]: 0 };
    }
    Promise.resolve(returnValue).catch((value) => {
      return { value, [throwMarker]: 0 };
    }).then((returnValue2) => {
      const [wireValue, transferables] = toWireValue(returnValue2);
      ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
      if (type === "RELEASE") {
        ep.removeEventListener("message", callback);
        closeEndPoint(ep);
        if (finalizer in obj && typeof obj[finalizer] === "function") {
          obj[finalizer]();
        }
      }
    }).catch((error) => {
      const [wireValue, transferables] = toWireValue({
        value: new TypeError("Unserializable return value"),
        [throwMarker]: 0
      });
      ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
    });
  });
  if (ep.start) {
    ep.start();
  }
}
function isMessagePort(endpoint) {
  return endpoint.constructor.name === "MessagePort";
}
function closeEndPoint(endpoint) {
  if (isMessagePort(endpoint))
    endpoint.close();
}
function wrap(ep, target) {
  const pendingListeners = /* @__PURE__ */ new Map();
  ep.addEventListener("message", function handleMessage(ev) {
    const { data } = ev;
    if (!data || !data.id) {
      return;
    }
    const resolver = pendingListeners.get(data.id);
    if (!resolver) {
      return;
    }
    try {
      resolver(data);
    } finally {
      pendingListeners.delete(data.id);
    }
  });
  return createProxy(ep, pendingListeners, [], target);
}
function throwIfProxyReleased(isReleased) {
  if (isReleased) {
    throw new Error("Proxy has been released and is not useable");
  }
}
function releaseEndpoint(ep) {
  return requestResponseMessage(ep, /* @__PURE__ */ new Map(), {
    type: "RELEASE"
  }).then(() => {
    closeEndPoint(ep);
  });
}
const proxyCounter = /* @__PURE__ */ new WeakMap();
const proxyFinalizers = "FinalizationRegistry" in globalThis && new FinalizationRegistry((ep) => {
  const newCount = (proxyCounter.get(ep) || 0) - 1;
  proxyCounter.set(ep, newCount);
  if (newCount === 0) {
    releaseEndpoint(ep);
  }
});
function registerProxy(proxy2, ep) {
  const newCount = (proxyCounter.get(ep) || 0) + 1;
  proxyCounter.set(ep, newCount);
  if (proxyFinalizers) {
    proxyFinalizers.register(proxy2, ep, proxy2);
  }
}
function unregisterProxy(proxy2) {
  if (proxyFinalizers) {
    proxyFinalizers.unregister(proxy2);
  }
}
function createProxy(ep, pendingListeners, path = [], target = function() {
}) {
  let isProxyReleased = false;
  const proxy2 = new Proxy(target, {
    get(_target, prop) {
      throwIfProxyReleased(isProxyReleased);
      if (prop === releaseProxy) {
        return () => {
          unregisterProxy(proxy2);
          releaseEndpoint(ep);
          pendingListeners.clear();
          isProxyReleased = true;
        };
      }
      if (prop === "then") {
        if (path.length === 0) {
          return { then: () => proxy2 };
        }
        const r = requestResponseMessage(ep, pendingListeners, {
          type: "GET",
          path: path.map((p) => p.toString())
        }).then(fromWireValue);
        return r.then.bind(r);
      }
      return createProxy(ep, pendingListeners, [...path, prop]);
    },
    set(_target, prop, rawValue) {
      throwIfProxyReleased(isProxyReleased);
      const [value, transferables] = toWireValue(rawValue);
      return requestResponseMessage(ep, pendingListeners, {
        type: "SET",
        path: [...path, prop].map((p) => p.toString()),
        value
      }, transferables).then(fromWireValue);
    },
    apply(_target, _thisArg, rawArgumentList) {
      throwIfProxyReleased(isProxyReleased);
      const last = path[path.length - 1];
      if (last === createEndpoint) {
        return requestResponseMessage(ep, pendingListeners, {
          type: "ENDPOINT"
        }).then(fromWireValue);
      }
      if (last === "bind") {
        return createProxy(ep, pendingListeners, path.slice(0, -1));
      }
      const [argumentList, transferables] = processArguments(rawArgumentList);
      return requestResponseMessage(ep, pendingListeners, {
        type: "APPLY",
        path: path.map((p) => p.toString()),
        argumentList
      }, transferables).then(fromWireValue);
    },
    construct(_target, rawArgumentList) {
      throwIfProxyReleased(isProxyReleased);
      const [argumentList, transferables] = processArguments(rawArgumentList);
      return requestResponseMessage(ep, pendingListeners, {
        type: "CONSTRUCT",
        path: path.map((p) => p.toString()),
        argumentList
      }, transferables).then(fromWireValue);
    }
  });
  registerProxy(proxy2, ep);
  return proxy2;
}
function myFlat(arr) {
  return Array.prototype.concat.apply([], arr);
}
function processArguments(argumentList) {
  const processed = argumentList.map(toWireValue);
  return [processed.map((v) => v[0]), myFlat(processed.map((v) => v[1]))];
}
const transferCache = /* @__PURE__ */ new WeakMap();
function transfer(obj, transfers) {
  transferCache.set(obj, transfers);
  return obj;
}
function proxy(obj) {
  return Object.assign(obj, { [proxyMarker]: true });
}
function toWireValue(value) {
  for (const [name, handler] of transferHandlers) {
    if (handler.canHandle(value)) {
      const [serializedValue, transferables] = handler.serialize(value);
      return [
        {
          type: "HANDLER",
          name,
          value: serializedValue
        },
        transferables
      ];
    }
  }
  return [
    {
      type: "RAW",
      value
    },
    transferCache.get(value) || []
  ];
}
function fromWireValue(value) {
  switch (value.type) {
    case "HANDLER":
      return transferHandlers.get(value.name).deserialize(value.value);
    case "RAW":
      return value.value;
  }
}
function requestResponseMessage(ep, pendingListeners, msg, transfers) {
  return new Promise((resolve) => {
    const id = generateUUID();
    pendingListeners.set(id, resolve);
    if (ep.start) {
      ep.start();
    }
    ep.postMessage(Object.assign({ id }, msg), transfers);
  });
}
function generateUUID() {
  return new Array(4).fill(0).map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-");
}

var MSDFGeneratorWorkerClient = class {
  worker;
  api;
  initPromise;
  constructor(workerUrl, wasmBinaryUrl) {
    this.worker = new Worker(workerUrl, { type: "module" });
    this.api = wrap(this.worker);
    this.initPromise = this.api.initialize(wasmBinaryUrl);
  }
  initialize = () => this.initPromise;
  loadFont = async (fontData) => {
    await this.initPromise;
    return this.api.loadFont(fontData);
  };
  generateAtlas = (options) => this.api.generateAtlas(options);
  exportJSON = (options) => this.api.exportJSON(options);
  dispose = () => this.api.dispose();
  generateMSDFAtlas = (options) => this.api.generateMSDFAtlas(options);
  generateMSDFFont = (options) => this.api.generateMSDFFont(options);
  terminate = () => this.worker.terminate();
};
var MSDF = class {
  static Encoder = new TextEncoder();
  client = null;
  workerUrl;
  wasmUrl;
  initialized = false;
  constructor(config = {}) {
    this.workerUrl = config.workerUrl || new URL("/worker-_Lh8Vt-i.js", import.meta.url).href;
    this.wasmUrl = config.wasmUrl;
  }
  async initialize() {
    if (this.initialized) return;
    this.client = new MSDFGeneratorWorkerClient(this.workerUrl, this.wasmUrl);
    await this.client.initialize();
    this.initialized = true;
  }
  async generate(options) {
    if (!this.client || !this.initialized) {
      throw new Error("MSDF not initialized. Call initialize() first.");
    }
    if (options.fonts) return this.generateMultiple(options);
    return this.generateSingle(options);
  }
  async generateSingle(options) {
    await this.client.loadFont(options.font);
    const atlas = await this.client.generateAtlas(options);
    const json = await this.client.exportJSON({
      atlas,
      fontSize: options.fontSize || 48
    });
    const blob = await this.atlasToBlob(atlas);
    const base64 = await this.blobToBase64(blob);
    const jsonWithInlinedTexture = {
      ...json,
      pages: [`data:image/png;base64,${base64}`]
    };
    options.onProgress?.(100, 1, 1);
    return this.toFontFamily(
      jsonWithInlinedTexture,
      atlas.info.name || "font",
      atlas.info.weight || 400
    );
  }
  // TODO - We should worker-pool this, wasm bit is tricky tho
  async generateMultiple(options) {
    const { fonts, onProgress, ...globalOptions } = options;
    if (!fonts || fonts.length === 0) throw new Error("No fonts provided");
    const result = {};
    let completed = 0;
    const total = fonts.length;
    for (const fontConfig of fonts) {
      const { font, ...fontOptions } = fontConfig;
      const mergedOptions = {
        ...globalOptions,
        ...fontOptions,
        font,
        charset: fontOptions.charset ?? globalOptions.charset ?? ""
      };
      if (!mergedOptions.charset)
        throw new Error("charset is required globally or per-font");
      const fontFamily = await this.generateSingle(mergedOptions);
      for (const [fontName, weights] of Object.entries(fontFamily)) {
        for (const [weight, fontData] of Object.entries(weights)) {
          const weightNum = Number(weight);
          if (result[fontName]?.[weightNum]) {
            console.warn(
              `Duplicate font: ${fontName} (${weightNum}). Overwriting.`
            );
          }
          if (!result[fontName]) result[fontName] = {};
          result[fontName][weightNum] = fontData;
        }
      }
      completed++;
      onProgress?.(Math.round(completed / total * 100), completed, total);
    }
    return result;
  }
  async generateAtlas(options) {
    if (!this.client || !this.initialized) {
      throw new Error("MSDF not initialized. Call initialize() first.");
    }
    await this.client.loadFont(options.font);
    return await this.client.generateAtlas(options);
  }
  async dispose() {
    if (this.client) {
      await this.client.dispose();
      this.client.terminate();
      this.client = null;
      this.initialized = false;
    }
  }
  async toFontFamily(json, fontName, fontWeight) {
    return {
      [fontName]: {
        [fontWeight]: json
      }
    };
  }
  atlasToBlob(atlas) {
    const canvas = document.createElement("canvas");
    canvas.width = atlas.textureSize[0];
    canvas.height = atlas.textureSize[1];
    canvas.getContext("2d").putImageData(atlas.texture, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Failed to create blob")),
        "image/png"
      );
    });
  }
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};

export { MSDF };
