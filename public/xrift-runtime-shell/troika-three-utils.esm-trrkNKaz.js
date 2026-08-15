import { importShared } from './__federation_fn_import-CVj0xDfO.js';

function workerBootstrap() {
  var modules = /* @__PURE__ */ Object.create(null);
  function registerModule(ref, callback) {
    var id = ref.id;
    var name = ref.name;
    var dependencies = ref.dependencies;
    if (dependencies === void 0) dependencies = [];
    var init = ref.init;
    if (init === void 0) init = function() {
    };
    var getTransferables = ref.getTransferables;
    if (getTransferables === void 0) getTransferables = null;
    if (modules[id]) {
      return;
    }
    try {
      dependencies = dependencies.map(function(dep) {
        if (dep && dep.isWorkerModule) {
          registerModule(dep, function(depResult) {
            if (depResult instanceof Error) {
              throw depResult;
            }
          });
          dep = modules[dep.id].value;
        }
        return dep;
      });
      init = rehydrate("<" + name + ">.init", init);
      if (getTransferables) {
        getTransferables = rehydrate("<" + name + ">.getTransferables", getTransferables);
      }
      var value = null;
      if (typeof init === "function") {
        value = init.apply(void 0, dependencies);
      } else {
        console.error("worker module init function failed to rehydrate");
      }
      modules[id] = {
        id,
        value,
        getTransferables
      };
      callback(value);
    } catch (err) {
      if (!(err && err.noLog)) {
        console.error(err);
      }
      callback(err);
    }
  }
  function callModule(ref, callback) {
    var ref$1;
    var id = ref.id;
    var args = ref.args;
    if (!modules[id] || typeof modules[id].value !== "function") {
      callback(new Error("Worker module " + id + ": not found or its 'init' did not return a function"));
    }
    try {
      var result = (ref$1 = modules[id]).value.apply(ref$1, args);
      if (result && typeof result.then === "function") {
        result.then(handleResult, function(rej) {
          return callback(rej instanceof Error ? rej : new Error("" + rej));
        });
      } else {
        handleResult(result);
      }
    } catch (err) {
      callback(err);
    }
    function handleResult(result2) {
      try {
        var tx = modules[id].getTransferables && modules[id].getTransferables(result2);
        if (!tx || !Array.isArray(tx) || !tx.length) {
          tx = void 0;
        }
        callback(result2, tx);
      } catch (err) {
        console.error(err);
        callback(err);
      }
    }
  }
  function rehydrate(name, str) {
    var result = void 0;
    self.troikaDefine = function(r) {
      return result = r;
    };
    var url = URL.createObjectURL(
      new Blob(
        ["/** " + name.replace(/\*/g, "") + " **/\n\ntroikaDefine(\n" + str + "\n)"],
        { type: "application/javascript" }
      )
    );
    try {
      importScripts(url);
    } catch (err) {
      console.error(err);
    }
    URL.revokeObjectURL(url);
    delete self.troikaDefine;
    return result;
  }
  self.addEventListener("message", function(e) {
    var ref = e.data;
    var messageId = ref.messageId;
    var action = ref.action;
    var data = ref.data;
    try {
      if (action === "registerModule") {
        registerModule(data, function(result) {
          if (result instanceof Error) {
            postMessage({
              messageId,
              success: false,
              error: result.message
            });
          } else {
            postMessage({
              messageId,
              success: true,
              result: { isCallable: typeof result === "function" }
            });
          }
        });
      }
      if (action === "callModule") {
        callModule(data, function(result, transferables) {
          if (result instanceof Error) {
            postMessage({
              messageId,
              success: false,
              error: result.message
            });
          } else {
            postMessage({
              messageId,
              success: true,
              result
            }, transferables || void 0);
          }
        });
      }
    } catch (err) {
      postMessage({
        messageId,
        success: false,
        error: err.stack
      });
    }
  });
}
function defineMainThreadModule(options) {
  var moduleFunc = function() {
    var args = [], len = arguments.length;
    while (len--) args[len] = arguments[len];
    return moduleFunc._getInitResult().then(function(initResult) {
      if (typeof initResult === "function") {
        return initResult.apply(void 0, args);
      } else {
        throw new Error("Worker module function was called but `init` did not return a callable function");
      }
    });
  };
  moduleFunc._getInitResult = function() {
    var dependencies = options.dependencies;
    var init = options.init;
    dependencies = Array.isArray(dependencies) ? dependencies.map(function(dep) {
      if (dep) {
        dep = dep.onMainThread || dep;
        if (dep._getInitResult) {
          dep = dep._getInitResult();
        }
      }
      return dep;
    }) : [];
    var initPromise = Promise.all(dependencies).then(function(deps) {
      return init.apply(null, deps);
    });
    moduleFunc._getInitResult = function() {
      return initPromise;
    };
    return initPromise;
  };
  return moduleFunc;
}
var supportsWorkers = function() {
  var supported = false;
  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    try {
      var worker = new Worker(
        URL.createObjectURL(new Blob([""], { type: "application/javascript" }))
      );
      worker.terminate();
      supported = true;
    } catch (err) {
      {
        console.log(
          "Troika createWorkerModule: web workers not allowed; falling back to main thread execution. Cause: [" + err.message + "]"
        );
      }
    }
  }
  supportsWorkers = function() {
    return supported;
  };
  return supported;
};
var _workerModuleId = 0;
var _messageId = 0;
var _allowInitAsString = false;
var workers = /* @__PURE__ */ Object.create(null);
var registeredModules = /* @__PURE__ */ Object.create(null);
var openRequests = /* @__PURE__ */ Object.create(null);
function defineWorkerModule(options) {
  if ((!options || typeof options.init !== "function") && !_allowInitAsString) {
    throw new Error("requires `options.init` function");
  }
  var dependencies = options.dependencies;
  var init = options.init;
  var getTransferables = options.getTransferables;
  var workerId = options.workerId;
  var onMainThread = defineMainThreadModule(options);
  if (workerId == null) {
    workerId = "#default";
  }
  var id = "workerModule" + ++_workerModuleId;
  var name = options.name || id;
  var registrationPromise = null;
  dependencies = dependencies && dependencies.map(function(dep) {
    if (typeof dep === "function" && !dep.workerModuleData) {
      _allowInitAsString = true;
      dep = defineWorkerModule({
        workerId,
        name: "<" + name + "> function dependency: " + dep.name,
        init: "function(){return (\n" + stringifyFunction(dep) + "\n)}"
      });
      _allowInitAsString = false;
    }
    if (dep && dep.workerModuleData) {
      dep = dep.workerModuleData;
    }
    return dep;
  });
  function moduleFunc() {
    var args = [], len = arguments.length;
    while (len--) args[len] = arguments[len];
    if (!supportsWorkers()) {
      return onMainThread.apply(void 0, args);
    }
    if (!registrationPromise) {
      registrationPromise = callWorker(workerId, "registerModule", moduleFunc.workerModuleData);
      var unregister = function() {
        registrationPromise = null;
        registeredModules[workerId].delete(unregister);
      };
      (registeredModules[workerId] || (registeredModules[workerId] = /* @__PURE__ */ new Set())).add(unregister);
    }
    return registrationPromise.then(function(ref) {
      var isCallable = ref.isCallable;
      if (isCallable) {
        return callWorker(workerId, "callModule", { id, args });
      } else {
        throw new Error("Worker module function was called but `init` did not return a callable function");
      }
    });
  }
  moduleFunc.workerModuleData = {
    isWorkerModule: true,
    id,
    name,
    dependencies,
    init: stringifyFunction(init),
    getTransferables: getTransferables && stringifyFunction(getTransferables)
  };
  moduleFunc.onMainThread = onMainThread;
  return moduleFunc;
}
function terminateWorker(workerId) {
  if (registeredModules[workerId]) {
    registeredModules[workerId].forEach(function(unregister) {
      unregister();
    });
  }
  if (workers[workerId]) {
    workers[workerId].terminate();
    delete workers[workerId];
  }
}
function stringifyFunction(fn) {
  var str = fn.toString();
  if (!/^function/.test(str) && /^\w+\s*\(/.test(str)) {
    str = "function " + str;
  }
  return str;
}
function getWorker(workerId) {
  var worker = workers[workerId];
  if (!worker) {
    var bootstrap = stringifyFunction(workerBootstrap);
    worker = workers[workerId] = new Worker(
      URL.createObjectURL(
        new Blob(
          ["/** Worker Module Bootstrap: " + workerId.replace(/\*/g, "") + " **/\n\n;(" + bootstrap + ")()"],
          { type: "application/javascript" }
        )
      )
    );
    worker.onmessage = function(e) {
      var response = e.data;
      var msgId = response.messageId;
      var callback = openRequests[msgId];
      if (!callback) {
        throw new Error("WorkerModule response with empty or unknown messageId");
      }
      delete openRequests[msgId];
      callback(response);
    };
  }
  return worker;
}
function callWorker(workerId, action, data) {
  return new Promise(function(resolve, reject) {
    var messageId = ++_messageId;
    openRequests[messageId] = function(response) {
      if (response.success) {
        resolve(response.result);
      } else {
        reject(new Error("Error in worker " + action + " call: " + response.error));
      }
    };
    getWorker(workerId).postMessage({
      messageId,
      action,
      data
    });
  });
}

function SDFGenerator() {
var exports = (function (exports) {

  /**
   * Find the point on a quadratic bezier curve at t where t is in the range [0, 1]
   */
  function pointOnQuadraticBezier (x0, y0, x1, y1, x2, y2, t, pointOut) {
    var t2 = 1 - t;
    pointOut.x = t2 * t2 * x0 + 2 * t2 * t * x1 + t * t * x2;
    pointOut.y = t2 * t2 * y0 + 2 * t2 * t * y1 + t * t * y2;
  }

  /**
   * Find the point on a cubic bezier curve at t where t is in the range [0, 1]
   */
  function pointOnCubicBezier (x0, y0, x1, y1, x2, y2, x3, y3, t, pointOut) {
    var t2 = 1 - t;
    pointOut.x = t2 * t2 * t2 * x0 + 3 * t2 * t2 * t * x1 + 3 * t2 * t * t * x2 + t * t * t * x3;
    pointOut.y = t2 * t2 * t2 * y0 + 3 * t2 * t2 * t * y1 + 3 * t2 * t * t * y2 + t * t * t * y3;
  }

  /**
   * Parse a path string into its constituent line/curve commands, invoking a callback for each.
   * @param {string} pathString - An SVG-like path string to parse; should only contain commands: M/L/Q/C/Z
   * @param {function(
   *   command: 'L'|'Q'|'C',
   *   startX: number,
   *   startY: number,
   *   endX: number,
   *   endY: number,
   *   ctrl1X?: number,
   *   ctrl1Y?: number,
   *   ctrl2X?: number,
   *   ctrl2Y?: number
   * )} commandCallback - A callback function that will be called once for each parsed path command, passing the
   *                      command identifier (only L/Q/C commands) and its numeric arguments.
   */
  function forEachPathCommand(pathString, commandCallback) {
    var segmentRE = /([MLQCZ])([^MLQCZ]*)/g;
    var match, firstX, firstY, prevX, prevY;
    while ((match = segmentRE.exec(pathString))) {
      var args = match[2]
        .replace(/^\s*|\s*$/g, '')
        .split(/[,\s]+/)
        .map(function (v) { return parseFloat(v); });
      switch (match[1]) {
        case 'M':
          prevX = firstX = args[0];
          prevY = firstY = args[1];
          break
        case 'L':
          if (args[0] !== prevX || args[1] !== prevY) { // yup, some fonts have zero-length line commands
            commandCallback('L', prevX, prevY, (prevX = args[0]), (prevY = args[1]));
          }
          break
        case 'Q': {
          commandCallback('Q', prevX, prevY, (prevX = args[2]), (prevY = args[3]), args[0], args[1]);
          break
        }
        case 'C': {
          commandCallback('C', prevX, prevY, (prevX = args[4]), (prevY = args[5]), args[0], args[1], args[2], args[3]);
          break
        }
        case 'Z':
          if (prevX !== firstX || prevY !== firstY) {
            commandCallback('L', prevX, prevY, firstX, firstY);
          }
          break
      }
    }
  }

  /**
   * Convert a path string to a series of straight line segments
   * @param {string} pathString - An SVG-like path string to parse; should only contain commands: M/L/Q/C/Z
   * @param {function(x1:number, y1:number, x2:number, y2:number)} segmentCallback - A callback
   *        function that will be called once for every line segment
   * @param {number} [curvePoints] - How many straight line segments to use when approximating a
   *        bezier curve in the path. Defaults to 16.
   */
  function pathToLineSegments (pathString, segmentCallback, curvePoints) {
    if ( curvePoints === void 0 ) curvePoints = 16;

    var tempPoint = { x: 0, y: 0 };
    forEachPathCommand(pathString, function (command, startX, startY, endX, endY, ctrl1X, ctrl1Y, ctrl2X, ctrl2Y) {
      switch (command) {
        case 'L':
          segmentCallback(startX, startY, endX, endY);
          break
        case 'Q': {
          var prevCurveX = startX;
          var prevCurveY = startY;
          for (var i = 1; i < curvePoints; i++) {
            pointOnQuadraticBezier(
              startX, startY,
              ctrl1X, ctrl1Y,
              endX, endY,
              i / (curvePoints - 1),
              tempPoint
            );
            segmentCallback(prevCurveX, prevCurveY, tempPoint.x, tempPoint.y);
            prevCurveX = tempPoint.x;
            prevCurveY = tempPoint.y;
          }
          break
        }
        case 'C': {
          var prevCurveX$1 = startX;
          var prevCurveY$1 = startY;
          for (var i$1 = 1; i$1 < curvePoints; i$1++) {
            pointOnCubicBezier(
              startX, startY,
              ctrl1X, ctrl1Y,
              ctrl2X, ctrl2Y,
              endX, endY,
              i$1 / (curvePoints - 1),
              tempPoint
            );
            segmentCallback(prevCurveX$1, prevCurveY$1, tempPoint.x, tempPoint.y);
            prevCurveX$1 = tempPoint.x;
            prevCurveY$1 = tempPoint.y;
          }
          break
        }
      }
    });
  }

  var viewportQuadVertex = "precision highp float;attribute vec2 aUV;varying vec2 vUV;void main(){vUV=aUV;gl_Position=vec4(mix(vec2(-1.0),vec2(1.0),aUV),0.0,1.0);}";

  var copyTexFragment = "precision highp float;uniform sampler2D tex;varying vec2 vUV;void main(){gl_FragColor=texture2D(tex,vUV);}";

  var cache = new WeakMap();

  var glContextParams = {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: false,
    depth: false,
  };

  /**
   * This is a little helper library for WebGL. It assists with state management for a GL context.
   * It's pretty tightly wrapped to the needs of this package, not very general-purpose.
   *
   * @param { WebGLRenderingContext | HTMLCanvasElement | OffscreenCanvas } glOrCanvas - the GL context to wrap
   * @param { ({gl, getExtension, withProgram, withTexture, withTextureFramebuffer, handleContextLoss}) => void } callback
   */
  function withWebGLContext (glOrCanvas, callback) {
    var gl = glOrCanvas.getContext ? glOrCanvas.getContext('webgl', glContextParams) : glOrCanvas;
    var wrapper = cache.get(gl);
    if (!wrapper) {
      var isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      var extensions = {};
      var programs = {};
      var textures = {};
      var textureUnit = -1;
      var framebufferStack = [];

      gl.canvas.addEventListener('webglcontextlost', function (e) {
        handleContextLoss();
        e.preventDefault();
      }, false);

      function getExtension (name) {
        var ext = extensions[name];
        if (!ext) {
          ext = extensions[name] = gl.getExtension(name);
          if (!ext) {
            throw new Error((name + " not supported"))
          }
        }
        return ext
      }

      function compileShader (src, type) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        // const status = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
        // if (!status && !gl.isContextLost()) {
        //   throw new Error(gl.getShaderInfoLog(shader).trim())
        // }
        return shader
      }

      function withProgram (name, vert, frag, func) {
        if (!programs[name]) {
          var attributes = {};
          var uniforms = {};
          var program = gl.createProgram();
          gl.attachShader(program, compileShader(vert, gl.VERTEX_SHADER));
          gl.attachShader(program, compileShader(frag, gl.FRAGMENT_SHADER));
          gl.linkProgram(program);

          programs[name] = {
            program: program,
            transaction: function transaction (func) {
              gl.useProgram(program);
              func({
                setUniform: function setUniform (type, name) {
                  var values = [], len = arguments.length - 2;
                  while ( len-- > 0 ) values[ len ] = arguments[ len + 2 ];

                  var uniformLoc = uniforms[name] || (uniforms[name] = gl.getUniformLocation(program, name));
                  gl[("uniform" + type)].apply(gl, [ uniformLoc ].concat( values ));
                },

                setAttribute: function setAttribute (name, size, usage, instancingDivisor, data) {
                  var attr = attributes[name];
                  if (!attr) {
                    attr = attributes[name] = {
                      buf: gl.createBuffer(), // TODO should we destroy our buffers?
                      loc: gl.getAttribLocation(program, name),
                      data: null
                    };
                  }
                  gl.bindBuffer(gl.ARRAY_BUFFER, attr.buf);
                  gl.vertexAttribPointer(attr.loc, size, gl.FLOAT, false, 0, 0);
                  gl.enableVertexAttribArray(attr.loc);
                  if (isWebGL2) {
                    gl.vertexAttribDivisor(attr.loc, instancingDivisor);
                  } else {
                    getExtension('ANGLE_instanced_arrays').vertexAttribDivisorANGLE(attr.loc, instancingDivisor);
                  }
                  if (data !== attr.data) {
                    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
                    attr.data = data;
                  }
                }
              });
            }
          };
        }

        programs[name].transaction(func);
      }

      function withTexture (name, func) {
        textureUnit++;
        try {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          var texture = textures[name];
          if (!texture) {
            texture = textures[name] = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          }
          gl.bindTexture(gl.TEXTURE_2D, texture);
          func(texture, textureUnit);
        } finally {
          textureUnit--;
        }
      }

      function withTextureFramebuffer (texture, textureUnit, func) {
        var framebuffer = gl.createFramebuffer();
        framebufferStack.push(framebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        try {
          func(framebuffer);
        } finally {
          gl.deleteFramebuffer(framebuffer);
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferStack[--framebufferStack.length - 1] || null);
        }
      }

      function handleContextLoss () {
        extensions = {};
        programs = {};
        textures = {};
        textureUnit = -1;
        framebufferStack.length = 0;
      }

      cache.set(gl, wrapper = {
        gl: gl,
        isWebGL2: isWebGL2,
        getExtension: getExtension,
        withProgram: withProgram,
        withTexture: withTexture,
        withTextureFramebuffer: withTextureFramebuffer,
        handleContextLoss: handleContextLoss,
      });
    }
    callback(wrapper);
  }


  function renderImageData(glOrCanvas, imageData, x, y, width, height, channels, framebuffer) {
    if ( channels === void 0 ) channels = 15;
    if ( framebuffer === void 0 ) framebuffer = null;

    withWebGLContext(glOrCanvas, function (ref) {
      var gl = ref.gl;
      var withProgram = ref.withProgram;
      var withTexture = ref.withTexture;

      withTexture('copy', function (tex, texUnit) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
        withProgram('copy', viewportQuadVertex, copyTexFragment, function (ref) {
          var setUniform = ref.setUniform;
          var setAttribute = ref.setAttribute;

          setAttribute('aUV', 2, gl.STATIC_DRAW, 0, new Float32Array([0, 0, 2, 0, 0, 2]));
          setUniform('1i', 'image', texUnit);
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer || null);
          gl.disable(gl.BLEND);
          gl.colorMask(channels & 8, channels & 4, channels & 2, channels & 1);
          gl.viewport(x, y, width, height);
          gl.scissor(x, y, width, height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
      });
    });
  }

  /**
   * Resizing a canvas clears its contents; this utility copies the previous contents over.
   * @param canvas
   * @param newWidth
   * @param newHeight
   */
  function resizeWebGLCanvasWithoutClearing(canvas, newWidth, newHeight) {
    var width = canvas.width;
    var height = canvas.height;
    withWebGLContext(canvas, function (ref) {
      var gl = ref.gl;

      var data = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      canvas.width = newWidth;
      canvas.height = newHeight;
      renderImageData(gl, data, 0, 0, width, height);
    });
  }

  var webglUtils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    withWebGLContext: withWebGLContext,
    renderImageData: renderImageData,
    resizeWebGLCanvasWithoutClearing: resizeWebGLCanvasWithoutClearing
  });

  function generate$2 (sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent) {
    if ( sdfExponent === void 0 ) sdfExponent = 1;

    var textureData = new Uint8Array(sdfWidth * sdfHeight);

    var viewBoxWidth = viewBox[2] - viewBox[0];
    var viewBoxHeight = viewBox[3] - viewBox[1];

    // Decompose all paths into straight line segments and add them to an index
    var segments = [];
    pathToLineSegments(path, function (x1, y1, x2, y2) {
      segments.push({
        x1: x1, y1: y1, x2: x2, y2: y2,
        minX: Math.min(x1, x2),
        minY: Math.min(y1, y2),
        maxX: Math.max(x1, x2),
        maxY: Math.max(y1, y2)
      });
    });

    // Sort segments by maxX, this will let us short-circuit some loops below
    segments.sort(function (a, b) { return a.maxX - b.maxX; });

    // For each target SDF texel, find the distance from its center to its nearest line segment,
    // map that distance to an alpha value, and write that alpha to the texel
    for (var sdfX = 0; sdfX < sdfWidth; sdfX++) {
      for (var sdfY = 0; sdfY < sdfHeight; sdfY++) {
        var signedDist = findNearestSignedDistance(
          viewBox[0] + viewBoxWidth * (sdfX + 0.5) / sdfWidth,
          viewBox[1] + viewBoxHeight * (sdfY + 0.5) / sdfHeight
        );

        // Use an exponential scale to ensure the texels very near the glyph path have adequate
        // precision, while allowing the distance field to cover the entire texture, given that
        // there are only 8 bits available. Formula visualized: https://www.desmos.com/calculator/uiaq5aqiam
        var alpha = Math.pow((1 - Math.abs(signedDist) / maxDistance), sdfExponent) / 2;
        if (signedDist < 0) {
          alpha = 1 - alpha;
        }

        alpha = Math.max(0, Math.min(255, Math.round(alpha * 255))); //clamp
        textureData[sdfY * sdfWidth + sdfX] = alpha;
      }
    }

    return textureData

    /**
     * For a given x/y, search the index for the closest line segment and return
     * its signed distance. Negative = inside, positive = outside, zero = on edge
     * @param x
     * @param y
     * @returns {number}
     */
    function findNearestSignedDistance (x, y) {
      var closestDistSq = Infinity;
      var closestDist = Infinity;

      for (var i = segments.length; i--;) {
        var seg = segments[i];
        if (seg.maxX + closestDist <= x) { break } //sorting by maxX means no more can be closer, so we can short-circuit
        if (x + closestDist > seg.minX && y - closestDist < seg.maxY && y + closestDist > seg.minY) {
          var distSq = absSquareDistanceToLineSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
          if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closestDist = Math.sqrt(closestDistSq);
          }
        }
      }

      // Flip to negative distance if inside the poly
      if (isPointInPoly(x, y)) {
        closestDist = -closestDist;
      }
      return closestDist
    }

    /**
     * Determine whether the given point lies inside or outside the glyph. Uses a simple
     * winding-number ray casting algorithm using a ray pointing east from the point.
     */
    function isPointInPoly (x, y) {
      var winding = 0;
      for (var i = segments.length; i--;) {
        var seg = segments[i];
        if (seg.maxX <= x) { break } //sorting by maxX means no more can cross, so we can short-circuit
        var intersects = ((seg.y1 > y) !== (seg.y2 > y)) && (x < (seg.x2 - seg.x1) * (y - seg.y1) / (seg.y2 - seg.y1) + seg.x1);
        if (intersects) {
          winding += seg.y1 < seg.y2 ? 1 : -1;
        }
      }
      return winding !== 0
    }
  }

  function generateIntoCanvas$2(sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent, canvas, x, y, channel) {
    if ( sdfExponent === void 0 ) sdfExponent = 1;
    if ( x === void 0 ) x = 0;
    if ( y === void 0 ) y = 0;
    if ( channel === void 0 ) channel = 0;

    generateIntoFramebuffer$1(sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent, canvas, null, x, y, channel);
  }

  function generateIntoFramebuffer$1 (sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent, glOrCanvas, framebuffer, x, y, channel) {
    if ( sdfExponent === void 0 ) sdfExponent = 1;
    if ( x === void 0 ) x = 0;
    if ( y === void 0 ) y = 0;
    if ( channel === void 0 ) channel = 0;

    var data = generate$2(sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent);
    // Expand single-channel data to rbga
    var rgbaData = new Uint8Array(data.length * 4);
    for (var i = 0; i < data.length; i++) {
      rgbaData[i * 4 + channel] = data[i];
    }
    renderImageData(glOrCanvas, rgbaData, x, y, sdfWidth, sdfHeight, 1 << (3 - channel), framebuffer);
  }

  /**
   * Find the absolute distance from a point to a line segment at closest approach
   */
  function absSquareDistanceToLineSegment (x, y, lineX0, lineY0, lineX1, lineY1) {
    var ldx = lineX1 - lineX0;
    var ldy = lineY1 - lineY0;
    var lengthSq = ldx * ldx + ldy * ldy;
    var t = lengthSq ? Math.max(0, Math.min(1, ((x - lineX0) * ldx + (y - lineY0) * ldy) / lengthSq)) : 0;
    var dx = x - (lineX0 + t * ldx);
    var dy = y - (lineY0 + t * ldy);
    return dx * dx + dy * dy
  }

  var javascript = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$2,
    generateIntoCanvas: generateIntoCanvas$2,
    generateIntoFramebuffer: generateIntoFramebuffer$1
  });

  var mainVertex = "precision highp float;uniform vec4 uGlyphBounds;attribute vec2 aUV;attribute vec4 aLineSegment;varying vec4 vLineSegment;varying vec2 vGlyphXY;void main(){vLineSegment=aLineSegment;vGlyphXY=mix(uGlyphBounds.xy,uGlyphBounds.zw,aUV);gl_Position=vec4(mix(vec2(-1.0),vec2(1.0),aUV),0.0,1.0);}";

  var mainFragment = "precision highp float;uniform vec4 uGlyphBounds;uniform float uMaxDistance;uniform float uExponent;varying vec4 vLineSegment;varying vec2 vGlyphXY;float absDistToSegment(vec2 point,vec2 lineA,vec2 lineB){vec2 lineDir=lineB-lineA;float lenSq=dot(lineDir,lineDir);float t=lenSq==0.0 ? 0.0 : clamp(dot(point-lineA,lineDir)/lenSq,0.0,1.0);vec2 linePt=lineA+t*lineDir;return distance(point,linePt);}void main(){vec4 seg=vLineSegment;vec2 p=vGlyphXY;float dist=absDistToSegment(p,seg.xy,seg.zw);float val=pow(1.0-clamp(dist/uMaxDistance,0.0,1.0),uExponent)*0.5;bool crossing=(seg.y>p.y!=seg.w>p.y)&&(p.x<(seg.z-seg.x)*(p.y-seg.y)/(seg.w-seg.y)+seg.x);bool crossingUp=crossing&&vLineSegment.y<vLineSegment.w;gl_FragColor=vec4(crossingUp ? 1.0/255.0 : 0.0,crossing&&!crossingUp ? 1.0/255.0 : 0.0,0.0,val);}";

  var postFragment = "precision highp float;uniform sampler2D tex;varying vec2 vUV;void main(){vec4 color=texture2D(tex,vUV);bool inside=color.r!=color.g;float val=inside ? 1.0-color.a : color.a;gl_FragColor=vec4(val);}";

  // Single triangle covering viewport
  var viewportUVs = new Float32Array([0, 0, 2, 0, 0, 2]);

  var implicitContext = null;
  var isTestingSupport = false;
  var NULL_OBJECT = {};
  var supportByCanvas = new WeakMap(); // canvas -> bool

  function validateSupport (glOrCanvas) {
    if (!isTestingSupport && !isSupported(glOrCanvas)) {
      throw new Error('WebGL generation not supported')
    }
  }

  function generate$1 (sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent, glOrCanvas) {
    if ( sdfExponent === void 0 ) sdfExponent = 1;
    if ( glOrCanvas === void 0 ) glOrCanvas = null;

    if (!glOrCanvas) {
      glOrCanvas = implicitContext;
      if (!glOrCanvas) {
        var canvas = typeof OffscreenCanvas === 'function'
          ? new OffscreenCanvas(1, 1)
          : typeof document !== 'undefined'
            ? document.createElement('canvas')
            : null;
        if (!canvas) {
          throw new Error('OffscreenCanvas or DOM canvas not supported')
        }
        glOrCanvas = implicitContext = canvas.getContext('webgl', { depth: false });
      }
    }

    validateSupport(glOrCanvas);

    var rgbaData = new Uint8Array(sdfWidth * sdfHeight * 4); //not Uint8ClampedArray, cuz Safari

    // Render into a background texture framebuffer
    withWebGLContext(glOrCanvas, function (ref) {
      var gl = ref.gl;
      var withTexture = ref.withTexture;
      var withTextureFramebuffer = ref.withTextureFramebuffer;

      withTexture('readable', function (texture, textureUnit) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sdfWidth, sdfHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        withTextureFramebuffer(texture, textureUnit, function (framebuffer) {
          generateIntoFramebuffer(
            sdfWidth,
            sdfHeight,
            path,
            viewBox,
            maxDistance,
            sdfExponent,
            gl,
            framebuffer,
            0,
            0,
            0 // red channel
          );
          gl.readPixels(0, 0, sdfWidth, sdfHeight, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
        });
      });
    });

    // Throw away all but the red channel
    var data = new Uint8Array(sdfWidth * sdfHeight);
    for (var i = 0, j = 0; i < rgbaData.length; i += 4) {
      data[j++] = rgbaData[i];
    }

    return data
  }

  function generateIntoCanvas$1(sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent, canvas, x, y, channel) {
    if ( sdfExponent === void 0 ) sdfExponent = 1;
    if ( x === void 0 ) x = 0;
    if ( y === void 0 ) y = 0;
    if ( channel === void 0 ) channel = 0;

    generateIntoFramebuffer(sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent, canvas, null, x, y, channel);
  }

  function generateIntoFramebuffer (sdfWidth, sdfHeight, path, viewBox, maxDistance, sdfExponent, glOrCanvas, framebuffer, x, y, channel) {
    if ( sdfExponent === void 0 ) sdfExponent = 1;
    if ( x === void 0 ) x = 0;
    if ( y === void 0 ) y = 0;
    if ( channel === void 0 ) channel = 0;

    // Verify support
    validateSupport(glOrCanvas);

    // Compute path segments
    var lineSegmentCoords = [];
    pathToLineSegments(path, function (x1, y1, x2, y2) {
      lineSegmentCoords.push(x1, y1, x2, y2);
    });
    lineSegmentCoords = new Float32Array(lineSegmentCoords);

    withWebGLContext(glOrCanvas, function (ref) {
      var gl = ref.gl;
      var isWebGL2 = ref.isWebGL2;
      var getExtension = ref.getExtension;
      var withProgram = ref.withProgram;
      var withTexture = ref.withTexture;
      var withTextureFramebuffer = ref.withTextureFramebuffer;
      var handleContextLoss = ref.handleContextLoss;

      withTexture('rawDistances', function (intermediateTexture, intermediateTextureUnit) {
        if (sdfWidth !== intermediateTexture._lastWidth || sdfHeight !== intermediateTexture._lastHeight) {
          gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA,
            intermediateTexture._lastWidth = sdfWidth,
            intermediateTexture._lastHeight = sdfHeight,
            0, gl.RGBA, gl.UNSIGNED_BYTE, null
          );
        }

        // Unsigned distance pass
        withProgram('main', mainVertex, mainFragment, function (ref) {
          var setAttribute = ref.setAttribute;
          var setUniform = ref.setUniform;

          // Init extensions
          var instancingExtension = !isWebGL2 && getExtension('ANGLE_instanced_arrays');
          var blendMinMaxExtension = !isWebGL2 && getExtension('EXT_blend_minmax');

          // Init/update attributes
          setAttribute('aUV', 2, gl.STATIC_DRAW, 0, viewportUVs);
          setAttribute('aLineSegment', 4, gl.DYNAMIC_DRAW, 1, lineSegmentCoords);

          // Init/update uniforms
          setUniform.apply(void 0, [ '4f', 'uGlyphBounds' ].concat( viewBox ));
          setUniform('1f', 'uMaxDistance', maxDistance);
          setUniform('1f', 'uExponent', sdfExponent);

          // Render initial unsigned distance / winding number info to a texture
          withTextureFramebuffer(intermediateTexture, intermediateTextureUnit, function (framebuffer) {
            gl.enable(gl.BLEND);
            gl.colorMask(true, true, true, true);
            gl.viewport(0, 0, sdfWidth, sdfHeight);
            gl.scissor(0, 0, sdfWidth, sdfHeight);
            gl.blendFunc(gl.ONE, gl.ONE);
            // Red+Green channels are incremented (FUNC_ADD) for segment-ray crossings to give a "winding number".
            // Alpha holds the closest (MAX) unsigned distance.
            gl.blendEquationSeparate(gl.FUNC_ADD, isWebGL2 ? gl.MAX : blendMinMaxExtension.MAX_EXT);
            gl.clear(gl.COLOR_BUFFER_BIT);
            if (isWebGL2) {
              gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, lineSegmentCoords.length / 4);
            } else {
              instancingExtension.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 3, lineSegmentCoords.length / 4);
            }
            // Debug
            // const debug = new Uint8Array(sdfWidth * sdfHeight * 4)
            // gl.readPixels(0, 0, sdfWidth, sdfHeight, gl.RGBA, gl.UNSIGNED_BYTE, debug)
            // console.log('intermediate texture data: ', debug)
          });
        });

        // Use the data stored in the texture to apply inside/outside and write to the output framebuffer rect+channel.
        withProgram('post', viewportQuadVertex, postFragment, function (program) {
          program.setAttribute('aUV', 2, gl.STATIC_DRAW, 0, viewportUVs);
          program.setUniform('1i', 'tex', intermediateTextureUnit);
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
          gl.disable(gl.BLEND);
          gl.colorMask(channel === 0, channel === 1, channel === 2, channel === 3);
          gl.viewport(x, y, sdfWidth, sdfHeight);
          gl.scissor(x, y, sdfWidth, sdfHeight);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
      });

      // Handle context loss occurring during any of the above calls
      if (gl.isContextLost()) {
        handleContextLoss();
        throw new Error('webgl context lost')
      }
    });
  }

  function isSupported (glOrCanvas) {
    var key = (!glOrCanvas || glOrCanvas === implicitContext) ? NULL_OBJECT : (glOrCanvas.canvas || glOrCanvas);
    var supported = supportByCanvas.get(key);
    if (supported === undefined) {
      isTestingSupport = true;
      var failReason = null;
      try {
        // Since we can't detect all failure modes up front, let's just do a trial run of a
        // simple path and compare what we get back to the correct expected result. This will
        // also serve to prime the shader compilation.
        var expectedResult = [
          97, 106, 97, 61,
          99, 137, 118, 80,
          80, 118, 137, 99,
          61, 97, 106, 97
        ];
        var testResult = generate$1(
          4,
          4,
          'M8,8L16,8L24,24L16,24Z',
          [0, 0, 32, 32],
          24,
          1,
          glOrCanvas
        );
        supported = testResult && expectedResult.length === testResult.length &&
          testResult.every(function (val, i) { return val === expectedResult[i]; });
        if (!supported) {
          failReason = 'bad trial run results';
          console.info(expectedResult, testResult);
        }
      } catch (err) {
        // TODO if it threw due to webgl context loss, should we maybe leave isSupported as null and try again later?
        supported = false;
        failReason = err.message;
      }
      if (failReason) {
        console.warn('WebGL SDF generation not supported:', failReason);
      }
      isTestingSupport = false;
      supportByCanvas.set(key, supported);
    }
    return supported
  }

  var webgl = /*#__PURE__*/Object.freeze({
    __proto__: null,
    generate: generate$1,
    generateIntoCanvas: generateIntoCanvas$1,
    generateIntoFramebuffer: generateIntoFramebuffer,
    isSupported: isSupported
  });

  /**
   * Generate an SDF texture image for a 2D path.
   *
   * @param {number} sdfWidth - width of the SDF output image in pixels.
   * @param {number} sdfHeight - height of the SDF output image in pixels.
   * @param {string} path - an SVG-like path string describing the glyph; should only contain commands: M/L/Q/C/Z.
   * @param {number[]} viewBox - [minX, minY, maxX, maxY] in font units aligning with the texture's edges.
   * @param {number} maxDistance - the maximum distance from the glyph path in font units that will be encoded; defaults
   *        to half the maximum viewBox dimension.
   * @param {number} [sdfExponent] - specifies an exponent for encoding the SDF's distance values; higher exponents
   *        will give greater precision nearer the glyph's path.
   * @return {Uint8Array}
   */
  function generate(
    sdfWidth,
    sdfHeight,
    path,
    viewBox,
    maxDistance,
    sdfExponent
  ) {
    if ( maxDistance === void 0 ) maxDistance = Math.max(viewBox[2] - viewBox[0], viewBox[3] - viewBox[1]) / 2;
    if ( sdfExponent === void 0 ) sdfExponent = 1;

    try {
      return generate$1.apply(webgl, arguments)
    } catch(e) {
      console.info('WebGL SDF generation failed, falling back to JS', e);
      return generate$2.apply(javascript, arguments)
    }
  }

  /**
   * Generate an SDF texture image for a 2D path, inserting the result into a WebGL `canvas` at a given x/y position
   * and color channel. This is generally much faster than calling `generate` because it does not require reading pixels
   * back from the GPU->CPU -- the `canvas` can be used directly as a WebGL texture image, so it all stays on the GPU.
   *
   * @param {number} sdfWidth - width of the SDF output image in pixels.
   * @param {number} sdfHeight - height of the SDF output image in pixels.
   * @param {string} path - an SVG-like path string describing the glyph; should only contain commands: M/L/Q/C/Z.
   * @param {number[]} viewBox - [minX, minY, maxX, maxY] in font units aligning with the texture's edges.
   * @param {number} maxDistance - the maximum distance from the glyph path in font units that will be encoded; defaults
   *        to half the maximum viewBox dimension.
   * @param {number} [sdfExponent] - specifies an exponent for encoding the SDF's distance values; higher exponents
   *        will give greater precision nearer the glyph's path.
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas - a WebGL-enabled canvas into which the SDF will be rendered.
   *        Only the relevant rect/channel will be modified, the rest will be preserved. To avoid unpredictable results
   *        due to shared GL context state, this canvas should be dedicated to use by this library alone.
   * @param {number} x - the x position at which to render the SDF.
   * @param {number} y - the y position at which to render the SDF.
   * @param {number} channel - the color channel index (0-4) into which the SDF will be rendered.
   * @return {Uint8Array}
   */
  function generateIntoCanvas(
    sdfWidth,
    sdfHeight,
    path,
    viewBox,
    maxDistance,
    sdfExponent,
    canvas,
    x,
    y,
    channel
  ) {
    if ( maxDistance === void 0 ) maxDistance = Math.max(viewBox[2] - viewBox[0], viewBox[3] - viewBox[1]) / 2;
    if ( sdfExponent === void 0 ) sdfExponent = 1;
    if ( x === void 0 ) x = 0;
    if ( y === void 0 ) y = 0;
    if ( channel === void 0 ) channel = 0;

    try {
      return generateIntoCanvas$1.apply(webgl, arguments)
    } catch(e) {
      console.info('WebGL SDF generation failed, falling back to JS', e);
      return generateIntoCanvas$2.apply(javascript, arguments)
    }
  }

  exports.forEachPathCommand = forEachPathCommand;
  exports.generate = generate;
  exports.generateIntoCanvas = generateIntoCanvas;
  exports.javascript = javascript;
  exports.pathToLineSegments = pathToLineSegments;
  exports.webgl = webgl;
  exports.webglUtils = webglUtils;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

}({}));
return exports
}

function bidiFactory() {
var bidi = (function (exports) {

  // Bidi character types data, auto generated
  var DATA = {
    "R": "13k,1a,2,3,3,2+1j,ch+16,a+1,5+2,2+n,5,a,4,6+16,4+3,h+1b,4mo,179q,2+9,2+11,2i9+7y,2+68,4,3+4,5+13,4+3,2+4k,3+29,8+cf,1t+7z,w+17,3+3m,1t+3z,16o1+5r,8+30,8+mc,29+1r,29+4v,75+73",
    "EN": "1c+9,3d+1,6,187+9,513,4+5,7+9,sf+j,175h+9,qw+q,161f+1d,4xt+a,25i+9",
    "ES": "17,2,6dp+1,f+1,av,16vr,mx+1,4o,2",
    "ET": "z+2,3h+3,b+1,ym,3e+1,2o,p4+1,8,6u,7c,g6,1wc,1n9+4,30+1b,2n,6d,qhx+1,h0m,a+1,49+2,63+1,4+1,6bb+3,12jj",
    "AN": "16o+5,2j+9,2+1,35,ed,1ff2+9,87+u",
    "CS": "18,2+1,b,2u,12k,55v,l,17v0,2,3,53,2+1,b",
    "B": "a,3,f+2,2v,690",
    "S": "9,2,k",
    "WS": "c,k,4f4,1vk+a,u,1j,335",
    "ON": "x+1,4+4,h+5,r+5,r+3,z,5+3,2+1,2+1,5,2+2,3+4,o,w,ci+1,8+d,3+d,6+8,2+g,39+1,9,6+1,2,33,b8,3+1,3c+1,7+1,5r,b,7h+3,sa+5,2,3i+6,jg+3,ur+9,2v,ij+1,9g+9,7+a,8m,4+1,49+x,14u,2+2,c+2,e+2,e+2,e+1,i+n,e+e,2+p,u+2,e+2,36+1,2+3,2+1,b,2+2,6+5,2,2,2,h+1,5+4,6+3,3+f,16+2,5+3l,3+81,1y+p,2+40,q+a,m+13,2r+ch,2+9e,75+hf,3+v,2+2w,6e+5,f+6,75+2a,1a+p,2+2g,d+5x,r+b,6+3,4+o,g,6+1,6+2,2k+1,4,2j,5h+z,1m+1,1e+f,t+2,1f+e,d+3,4o+3,2s+1,w,535+1r,h3l+1i,93+2,2s,b+1,3l+x,2v,4g+3,21+3,kz+1,g5v+1,5a,j+9,n+v,2,3,2+8,2+1,3+2,2,3,46+1,4+4,h+5,r+5,r+a,3h+2,4+6,b+4,78,1r+24,4+c,4,1hb,ey+6,103+j,16j+c,1ux+7,5+g,fsh,jdq+1t,4,57+2e,p1,1m,1m,1m,1m,4kt+1,7j+17,5+2r,d+e,3+e,2+e,2+10,m+4,w,1n+5,1q,4z+5,4b+rb,9+c,4+c,4+37,d+2g,8+b,l+b,5+1j,9+9,7+13,9+t,3+1,27+3c,2+29,2+3q,d+d,3+4,4+2,6+6,a+o,8+6,a+2,e+6,16+42,2+1i",
    "BN": "0+8,6+d,2s+5,2+p,e,4m9,1kt+2,2b+5,5+5,17q9+v,7k,6p+8,6+1,119d+3,440+7,96s+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+75,6p+2rz,1ben+1,1ekf+1,1ekf+1",
    "NSM": "lc+33,7o+6,7c+18,2,2+1,2+1,2,21+a,1d+k,h,2u+6,3+5,3+1,2+3,10,v+q,2k+a,1n+8,a,p+3,2+8,2+2,2+4,18+2,3c+e,2+v,1k,2,5+7,5,4+6,b+1,u,1n,5+3,9,l+1,r,3+1,1m,5+1,5+1,3+2,4,v+1,4,c+1,1m,5+4,2+1,5,l+1,n+5,2,1n,3,2+3,9,8+1,c+1,v,1q,d,1f,4,1m+2,6+2,2+3,8+1,c+1,u,1n,g+1,l+1,t+1,1m+1,5+3,9,l+1,u,21,8+2,2,2j,3+6,d+7,2r,3+8,c+5,23+1,s,2,2,1k+d,2+4,2+1,6+a,2+z,a,2v+3,2+5,2+1,3+1,q+1,5+2,h+3,e,3+1,7,g,jk+2,qb+2,u+2,u+1,v+1,1t+1,2+6,9,3+a,a,1a+2,3c+1,z,3b+2,5+1,a,7+2,64+1,3,1n,2+6,2,2,3+7,7+9,3,1d+g,1s+3,1d,2+4,2,6,15+8,d+1,x+3,3+1,2+2,1l,2+1,4,2+2,1n+7,3+1,49+2,2+c,2+6,5,7,4+1,5j+1l,2+4,k1+w,2db+2,3y,2p+v,ff+3,30+1,n9x+3,2+9,x+1,29+1,7l,4,5,q+1,6,48+1,r+h,e,13+7,q+a,1b+2,1d,3+3,3+1,14,1w+5,3+1,3+1,d,9,1c,1g,2+2,3+1,6+1,2,17+1,9,6n,3,5,fn5,ki+f,h+f,r2,6b,46+4,1af+2,2+1,6+3,15+2,5,4m+1,fy+3,as+1,4a+a,4x,1j+e,1l+2,1e+3,3+1,1y+2,11+4,2+7,1r,d+1,1h+8,b+3,3,2o+2,3,2+1,7,4h,4+7,m+1,1m+1,4,12+6,4+4,5g+7,3+2,2,o,2d+5,2,5+1,2+1,6n+3,7+1,2+1,s+1,2e+7,3,2+1,2z,2,3+5,2,2u+2,3+3,2+4,78+8,2+1,75+1,2,5,41+3,3+1,5,x+5,3+1,15+5,3+3,9,a+5,3+2,1b+c,2+1,bb+6,2+5,2d+l,3+6,2+1,2+1,3f+5,4,2+1,2+6,2,21+1,4,2,9o+1,f0c+4,1o+6,t5,1s+3,2a,f5l+1,43t+2,i+7,3+6,v+3,45+2,1j0+1i,5+1d,9,f,n+4,2+e,11t+6,2+g,3+6,2+1,2+4,7a+6,c6+3,15t+6,32+6,gzhy+6n",
    "AL": "16w,3,2,e+1b,z+2,2+2s,g+1,8+1,b+m,2+t,s+2i,c+e,4h+f,1d+1e,1bwe+dp,3+3z,x+c,2+1,35+3y,2rm+z,5+7,b+5,dt+l,c+u,17nl+27,1t+27,4x+6n,3+d",
    "LRO": "6ct",
    "RLO": "6cu",
    "LRE": "6cq",
    "RLE": "6cr",
    "PDF": "6cs",
    "LRI": "6ee",
    "RLI": "6ef",
    "FSI": "6eg",
    "PDI": "6eh"
  };

  var TYPES = {};
  var TYPES_TO_NAMES = {};
  TYPES.L = 1; //L is the default
  TYPES_TO_NAMES[1] = 'L';
  Object.keys(DATA).forEach(function (type, i) {
    TYPES[type] = 1 << (i + 1);
    TYPES_TO_NAMES[TYPES[type]] = type;
  });
  Object.freeze(TYPES);

  var ISOLATE_INIT_TYPES = TYPES.LRI | TYPES.RLI | TYPES.FSI;
  var STRONG_TYPES = TYPES.L | TYPES.R | TYPES.AL;
  var NEUTRAL_ISOLATE_TYPES = TYPES.B | TYPES.S | TYPES.WS | TYPES.ON | TYPES.FSI | TYPES.LRI | TYPES.RLI | TYPES.PDI;
  var BN_LIKE_TYPES = TYPES.BN | TYPES.RLE | TYPES.LRE | TYPES.RLO | TYPES.LRO | TYPES.PDF;
  var TRAILING_TYPES = TYPES.S | TYPES.WS | TYPES.B | ISOLATE_INIT_TYPES | TYPES.PDI | BN_LIKE_TYPES;

  var map = null;

  function parseData () {
    if (!map) {
      //const start = performance.now()
      map = new Map();
      var loop = function ( type ) {
        if (DATA.hasOwnProperty(type)) {
          var lastCode = 0;
          DATA[type].split(',').forEach(function (range) {
            var ref = range.split('+');
            var skip = ref[0];
            var step = ref[1];
            skip = parseInt(skip, 36);
            step = step ? parseInt(step, 36) : 0;
            map.set(lastCode += skip, TYPES[type]);
            for (var i = 0; i < step; i++) {
              map.set(++lastCode, TYPES[type]);
            }
          });
        }
      };

      for (var type in DATA) loop( type );
      //console.log(`char types parsed in ${performance.now() - start}ms`)
    }
  }

  /**
   * @param {string} char
   * @return {number}
   */
  function getBidiCharType (char) {
    parseData();
    return map.get(char.codePointAt(0)) || TYPES.L
  }

  function getBidiCharTypeName(char) {
    return TYPES_TO_NAMES[getBidiCharType(char)]
  }

  // Bidi bracket pairs data, auto generated
  var data$1 = {
    "pairs": "14>1,1e>2,u>2,2wt>1,1>1,1ge>1,1wp>1,1j>1,f>1,hm>1,1>1,u>1,u6>1,1>1,+5,28>1,w>1,1>1,+3,b8>1,1>1,+3,1>3,-1>-1,3>1,1>1,+2,1s>1,1>1,x>1,th>1,1>1,+2,db>1,1>1,+3,3>1,1>1,+2,14qm>1,1>1,+1,4q>1,1e>2,u>2,2>1,+1",
    "canonical": "6f1>-6dx,6dy>-6dx,6ec>-6ed,6ee>-6ed,6ww>2jj,-2ji>2jj,14r4>-1e7l,1e7m>-1e7l,1e7m>-1e5c,1e5d>-1e5b,1e5c>-14qx,14qy>-14qx,14vn>-1ecg,1ech>-1ecg,1edu>-1ecg,1eci>-1ecg,1eda>-1ecg,1eci>-1ecg,1eci>-168q,168r>-168q,168s>-14ye,14yf>-14ye"
  };

  /**
   * Parses an string that holds encoded codepoint mappings, e.g. for bracket pairs or
   * mirroring characters, as encoded by scripts/generateBidiData.js. Returns an object
   * holding the `map`, and optionally a `reverseMap` if `includeReverse:true`.
   * @param {string} encodedString
   * @param {boolean} includeReverse - true if you want reverseMap in the output
   * @return {{map: Map<number, number>, reverseMap?: Map<number, number>}}
   */
  function parseCharacterMap (encodedString, includeReverse) {
    var radix = 36;
    var lastCode = 0;
    var map = new Map();
    var reverseMap = includeReverse && new Map();
    var prevPair;
    encodedString.split(',').forEach(function visit(entry) {
      if (entry.indexOf('+') !== -1) {
        for (var i = +entry; i--;) {
          visit(prevPair);
        }
      } else {
        prevPair = entry;
        var ref = entry.split('>');
        var a = ref[0];
        var b = ref[1];
        a = String.fromCodePoint(lastCode += parseInt(a, radix));
        b = String.fromCodePoint(lastCode += parseInt(b, radix));
        map.set(a, b);
        includeReverse && reverseMap.set(b, a);
      }
    });
    return { map: map, reverseMap: reverseMap }
  }

  var openToClose, closeToOpen, canonical;

  function parse$1 () {
    if (!openToClose) {
      //const start = performance.now()
      var ref = parseCharacterMap(data$1.pairs, true);
      var map = ref.map;
      var reverseMap = ref.reverseMap;
      openToClose = map;
      closeToOpen = reverseMap;
      canonical = parseCharacterMap(data$1.canonical, false).map;
      //console.log(`brackets parsed in ${performance.now() - start}ms`)
    }
  }

  function openingToClosingBracket (char) {
    parse$1();
    return openToClose.get(char) || null
  }

  function closingToOpeningBracket (char) {
    parse$1();
    return closeToOpen.get(char) || null
  }

  function getCanonicalBracket (char) {
    parse$1();
    return canonical.get(char) || null
  }

  // Local type aliases
  var TYPE_L = TYPES.L;
  var TYPE_R = TYPES.R;
  var TYPE_EN = TYPES.EN;
  var TYPE_ES = TYPES.ES;
  var TYPE_ET = TYPES.ET;
  var TYPE_AN = TYPES.AN;
  var TYPE_CS = TYPES.CS;
  var TYPE_B = TYPES.B;
  var TYPE_S = TYPES.S;
  var TYPE_ON = TYPES.ON;
  var TYPE_BN = TYPES.BN;
  var TYPE_NSM = TYPES.NSM;
  var TYPE_AL = TYPES.AL;
  var TYPE_LRO = TYPES.LRO;
  var TYPE_RLO = TYPES.RLO;
  var TYPE_LRE = TYPES.LRE;
  var TYPE_RLE = TYPES.RLE;
  var TYPE_PDF = TYPES.PDF;
  var TYPE_LRI = TYPES.LRI;
  var TYPE_RLI = TYPES.RLI;
  var TYPE_FSI = TYPES.FSI;
  var TYPE_PDI = TYPES.PDI;

  /**
   * @typedef {object} GetEmbeddingLevelsResult
   * @property {{start, end, level}[]} paragraphs
   * @property {Uint8Array} levels
   */

  /**
   * This function applies the Bidirectional Algorithm to a string, returning the resolved embedding levels
   * in a single Uint8Array plus a list of objects holding each paragraph's start and end indices and resolved
   * base embedding level.
   *
   * @param {string} string - The input string
   * @param {"ltr"|"rtl"|"auto"} [baseDirection] - Use "ltr" or "rtl" to force a base paragraph direction,
   *        otherwise a direction will be chosen automatically from each paragraph's contents.
   * @return {GetEmbeddingLevelsResult}
   */
  function getEmbeddingLevels (string, baseDirection) {
    var MAX_DEPTH = 125;

    // Start by mapping all characters to their unicode type, as a bitmask integer
    var charTypes = new Uint32Array(string.length);
    for (var i = 0; i < string.length; i++) {
      charTypes[i] = getBidiCharType(string[i]);
    }

    var charTypeCounts = new Map(); //will be cleared at start of each paragraph
    function changeCharType(i, type) {
      var oldType = charTypes[i];
      charTypes[i] = type;
      charTypeCounts.set(oldType, charTypeCounts.get(oldType) - 1);
      if (oldType & NEUTRAL_ISOLATE_TYPES) {
        charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) - 1);
      }
      charTypeCounts.set(type, (charTypeCounts.get(type) || 0) + 1);
      if (type & NEUTRAL_ISOLATE_TYPES) {
        charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) || 0) + 1);
      }
    }

    var embedLevels = new Uint8Array(string.length);
    var isolationPairs = new Map(); //init->pdi and pdi->init

    // === 3.3.1 The Paragraph Level ===
    // 3.3.1 P1: Split the text into paragraphs
    var paragraphs = []; // [{start, end, level}, ...]
    var paragraph = null;
    for (var i$1 = 0; i$1 < string.length; i$1++) {
      if (!paragraph) {
        paragraphs.push(paragraph = {
          start: i$1,
          end: string.length - 1,
          // 3.3.1 P2-P3: Determine the paragraph level
          level: baseDirection === 'rtl' ? 1 : baseDirection === 'ltr' ? 0 : determineAutoEmbedLevel(i$1, false)
        });
      }
      if (charTypes[i$1] & TYPE_B) {
        paragraph.end = i$1;
        paragraph = null;
      }
    }

    var FORMATTING_TYPES = TYPE_RLE | TYPE_LRE | TYPE_RLO | TYPE_LRO | ISOLATE_INIT_TYPES | TYPE_PDI | TYPE_PDF | TYPE_B;
    var nextEven = function (n) { return n + ((n & 1) ? 1 : 2); };
    var nextOdd = function (n) { return n + ((n & 1) ? 2 : 1); };

    // Everything from here on will operate per paragraph.
    for (var paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
      paragraph = paragraphs[paraIdx];
      var statusStack = [{
        _level: paragraph.level,
        _override: 0, //0=neutral, 1=L, 2=R
        _isolate: 0 //bool
      }];
      var stackTop = (void 0);
      var overflowIsolateCount = 0;
      var overflowEmbeddingCount = 0;
      var validIsolateCount = 0;
      charTypeCounts.clear();

      // === 3.3.2 Explicit Levels and Directions ===
      for (var i$2 = paragraph.start; i$2 <= paragraph.end; i$2++) {
        var charType = charTypes[i$2];
        stackTop = statusStack[statusStack.length - 1];

        // Set initial counts
        charTypeCounts.set(charType, (charTypeCounts.get(charType) || 0) + 1);
        if (charType & NEUTRAL_ISOLATE_TYPES) {
          charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) || 0) + 1);
        }

        // Explicit Embeddings: 3.3.2 X2 - X3
        if (charType & FORMATTING_TYPES) { //prefilter all formatters
          if (charType & (TYPE_RLE | TYPE_LRE)) {
            embedLevels[i$2] = stackTop._level; // 5.2
            var level = (charType === TYPE_RLE ? nextOdd : nextEven)(stackTop._level);
            if (level <= MAX_DEPTH && !overflowIsolateCount && !overflowEmbeddingCount) {
              statusStack.push({
                _level: level,
                _override: 0,
                _isolate: 0
              });
            } else if (!overflowIsolateCount) {
              overflowEmbeddingCount++;
            }
          }

          // Explicit Overrides: 3.3.2 X4 - X5
          else if (charType & (TYPE_RLO | TYPE_LRO)) {
            embedLevels[i$2] = stackTop._level; // 5.2
            var level$1 = (charType === TYPE_RLO ? nextOdd : nextEven)(stackTop._level);
            if (level$1 <= MAX_DEPTH && !overflowIsolateCount && !overflowEmbeddingCount) {
              statusStack.push({
                _level: level$1,
                _override: (charType & TYPE_RLO) ? TYPE_R : TYPE_L,
                _isolate: 0
              });
            } else if (!overflowIsolateCount) {
              overflowEmbeddingCount++;
            }
          }

          // Isolates: 3.3.2 X5a - X5c
          else if (charType & ISOLATE_INIT_TYPES) {
            // X5c - FSI becomes either RLI or LRI
            if (charType & TYPE_FSI) {
              charType = determineAutoEmbedLevel(i$2 + 1, true) === 1 ? TYPE_RLI : TYPE_LRI;
            }

            embedLevels[i$2] = stackTop._level;
            if (stackTop._override) {
              changeCharType(i$2, stackTop._override);
            }
            var level$2 = (charType === TYPE_RLI ? nextOdd : nextEven)(stackTop._level);
            if (level$2 <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
              validIsolateCount++;
              statusStack.push({
                _level: level$2,
                _override: 0,
                _isolate: 1,
                _isolInitIndex: i$2
              });
            } else {
              overflowIsolateCount++;
            }
          }

          // Terminating Isolates: 3.3.2 X6a
          else if (charType & TYPE_PDI) {
            if (overflowIsolateCount > 0) {
              overflowIsolateCount--;
            } else if (validIsolateCount > 0) {
              overflowEmbeddingCount = 0;
              while (!statusStack[statusStack.length - 1]._isolate) {
                statusStack.pop();
              }
              // Add to isolation pairs bidirectional mapping:
              var isolInitIndex = statusStack[statusStack.length - 1]._isolInitIndex;
              if (isolInitIndex != null) {
                isolationPairs.set(isolInitIndex, i$2);
                isolationPairs.set(i$2, isolInitIndex);
              }
              statusStack.pop();
              validIsolateCount--;
            }
            stackTop = statusStack[statusStack.length - 1];
            embedLevels[i$2] = stackTop._level;
            if (stackTop._override) {
              changeCharType(i$2, stackTop._override);
            }
          }


          // Terminating Embeddings and Overrides: 3.3.2 X7
          else if (charType & TYPE_PDF) {
            if (overflowIsolateCount === 0) {
              if (overflowEmbeddingCount > 0) {
                overflowEmbeddingCount--;
              } else if (!stackTop._isolate && statusStack.length > 1) {
                statusStack.pop();
                stackTop = statusStack[statusStack.length - 1];
              }
            }
            embedLevels[i$2] = stackTop._level; // 5.2
          }

          // End of Paragraph: 3.3.2 X8
          else if (charType & TYPE_B) {
            embedLevels[i$2] = paragraph.level;
          }
        }

        // Non-formatting characters: 3.3.2 X6
        else {
          embedLevels[i$2] = stackTop._level;
          // NOTE: This exclusion of BN seems to go against what section 5.2 says, but is required for test passage
          if (stackTop._override && charType !== TYPE_BN) {
            changeCharType(i$2, stackTop._override);
          }
        }
      }

      // === 3.3.3 Preparations for Implicit Processing ===

      // Remove all RLE, LRE, RLO, LRO, PDF, and BN characters: 3.3.3 X9
      // Note: Due to section 5.2, we won't remove them, but we'll use the BN_LIKE_TYPES bitset to
      // easily ignore them all from here on out.

      // 3.3.3 X10
      // Compute the set of isolating run sequences as specified by BD13
      var levelRuns = [];
      var currentRun = null;
      for (var i$3 = paragraph.start; i$3 <= paragraph.end; i$3++) {
        var charType$1 = charTypes[i$3];
        if (!(charType$1 & BN_LIKE_TYPES)) {
          var lvl = embedLevels[i$3];
          var isIsolInit = charType$1 & ISOLATE_INIT_TYPES;
          var isPDI = charType$1 === TYPE_PDI;
          if (currentRun && lvl === currentRun._level) {
            currentRun._end = i$3;
            currentRun._endsWithIsolInit = isIsolInit;
          } else {
            levelRuns.push(currentRun = {
              _start: i$3,
              _end: i$3,
              _level: lvl,
              _startsWithPDI: isPDI,
              _endsWithIsolInit: isIsolInit
            });
          }
        }
      }
      var isolatingRunSeqs = []; // [{seqIndices: [], sosType: L|R, eosType: L|R}]
      for (var runIdx = 0; runIdx < levelRuns.length; runIdx++) {
        var run = levelRuns[runIdx];
        if (!run._startsWithPDI || (run._startsWithPDI && !isolationPairs.has(run._start))) {
          var seqRuns = [currentRun = run];
          for (var pdiIndex = (void 0); currentRun && currentRun._endsWithIsolInit && (pdiIndex = isolationPairs.get(currentRun._end)) != null;) {
            for (var i$4 = runIdx + 1; i$4 < levelRuns.length; i$4++) {
              if (levelRuns[i$4]._start === pdiIndex) {
                seqRuns.push(currentRun = levelRuns[i$4]);
                break
              }
            }
          }
          // build flat list of indices across all runs:
          var seqIndices = [];
          for (var i$5 = 0; i$5 < seqRuns.length; i$5++) {
            var run$1 = seqRuns[i$5];
            for (var j = run$1._start; j <= run$1._end; j++) {
              seqIndices.push(j);
            }
          }
          // determine the sos/eos types:
          var firstLevel = embedLevels[seqIndices[0]];
          var prevLevel = paragraph.level;
          for (var i$6 = seqIndices[0] - 1; i$6 >= 0; i$6--) {
            if (!(charTypes[i$6] & BN_LIKE_TYPES)) { //5.2
              prevLevel = embedLevels[i$6];
              break
            }
          }
          var lastIndex = seqIndices[seqIndices.length - 1];
          var lastLevel = embedLevels[lastIndex];
          var nextLevel = paragraph.level;
          if (!(charTypes[lastIndex] & ISOLATE_INIT_TYPES)) {
            for (var i$7 = lastIndex + 1; i$7 <= paragraph.end; i$7++) {
              if (!(charTypes[i$7] & BN_LIKE_TYPES)) { //5.2
                nextLevel = embedLevels[i$7];
                break
              }
            }
          }
          isolatingRunSeqs.push({
            _seqIndices: seqIndices,
            _sosType: Math.max(prevLevel, firstLevel) % 2 ? TYPE_R : TYPE_L,
            _eosType: Math.max(nextLevel, lastLevel) % 2 ? TYPE_R : TYPE_L
          });
        }
      }

      // The next steps are done per isolating run sequence
      for (var seqIdx = 0; seqIdx < isolatingRunSeqs.length; seqIdx++) {
        var ref = isolatingRunSeqs[seqIdx];
        var seqIndices$1 = ref._seqIndices;
        var sosType = ref._sosType;
        var eosType = ref._eosType;
        /**
         * All the level runs in an isolating run sequence have the same embedding level.
         * 
         * DO NOT change any `embedLevels[i]` within the current scope.
         */
        var embedDirection = ((embedLevels[seqIndices$1[0]]) & 1) ? TYPE_R : TYPE_L;

        // === 3.3.4 Resolving Weak Types ===

        // W1 + 5.2. Search backward from each NSM to the first character in the isolating run sequence whose
        // bidirectional type is not BN, and set the NSM to ON if it is an isolate initiator or PDI, and to its
        // type otherwise. If the NSM is the first non-BN character, change the NSM to the type of sos.
        if (charTypeCounts.get(TYPE_NSM)) {
          for (var si = 0; si < seqIndices$1.length; si++) {
            var i$8 = seqIndices$1[si];
            if (charTypes[i$8] & TYPE_NSM) {
              var prevType = sosType;
              for (var sj = si - 1; sj >= 0; sj--) {
                if (!(charTypes[seqIndices$1[sj]] & BN_LIKE_TYPES)) { //5.2 scan back to first non-BN
                  prevType = charTypes[seqIndices$1[sj]];
                  break
                }
              }
              changeCharType(i$8, (prevType & (ISOLATE_INIT_TYPES | TYPE_PDI)) ? TYPE_ON : prevType);
            }
          }
        }

        // W2. Search backward from each instance of a European number until the first strong type (R, L, AL, or sos)
        // is found. If an AL is found, change the type of the European number to Arabic number.
        if (charTypeCounts.get(TYPE_EN)) {
          for (var si$1 = 0; si$1 < seqIndices$1.length; si$1++) {
            var i$9 = seqIndices$1[si$1];
            if (charTypes[i$9] & TYPE_EN) {
              for (var sj$1 = si$1 - 1; sj$1 >= -1; sj$1--) {
                var prevCharType = sj$1 === -1 ? sosType : charTypes[seqIndices$1[sj$1]];
                if (prevCharType & STRONG_TYPES) {
                  if (prevCharType === TYPE_AL) {
                    changeCharType(i$9, TYPE_AN);
                  }
                  break
                }
              }
            }
          }
        }

        // W3. Change all ALs to R
        if (charTypeCounts.get(TYPE_AL)) {
          for (var si$2 = 0; si$2 < seqIndices$1.length; si$2++) {
            var i$10 = seqIndices$1[si$2];
            if (charTypes[i$10] & TYPE_AL) {
              changeCharType(i$10, TYPE_R);
            }
          }
        }

        // W4. A single European separator between two European numbers changes to a European number. A single common
        // separator between two numbers of the same type changes to that type.
        if (charTypeCounts.get(TYPE_ES) || charTypeCounts.get(TYPE_CS)) {
          for (var si$3 = 1; si$3 < seqIndices$1.length - 1; si$3++) {
            var i$11 = seqIndices$1[si$3];
            if (charTypes[i$11] & (TYPE_ES | TYPE_CS)) {
              var prevType$1 = 0, nextType = 0;
              for (var sj$2 = si$3 - 1; sj$2 >= 0; sj$2--) {
                prevType$1 = charTypes[seqIndices$1[sj$2]];
                if (!(prevType$1 & BN_LIKE_TYPES)) { //5.2
                  break
                }
              }
              for (var sj$3 = si$3 + 1; sj$3 < seqIndices$1.length; sj$3++) {
                nextType = charTypes[seqIndices$1[sj$3]];
                if (!(nextType & BN_LIKE_TYPES)) { //5.2
                  break
                }
              }
              if (prevType$1 === nextType && (charTypes[i$11] === TYPE_ES ? prevType$1 === TYPE_EN : (prevType$1 & (TYPE_EN | TYPE_AN)))) {
                changeCharType(i$11, prevType$1);
              }
            }
          }
        }

        // W5. A sequence of European terminators adjacent to European numbers changes to all European numbers.
        if (charTypeCounts.get(TYPE_EN)) {
          for (var si$4 = 0; si$4 < seqIndices$1.length; si$4++) {
            var i$12 = seqIndices$1[si$4];
            if (charTypes[i$12] & TYPE_EN) {
              for (var sj$4 = si$4 - 1; sj$4 >= 0 && (charTypes[seqIndices$1[sj$4]] & (TYPE_ET | BN_LIKE_TYPES)); sj$4--) {
                changeCharType(seqIndices$1[sj$4], TYPE_EN);
              }
              for (si$4++; si$4 < seqIndices$1.length && (charTypes[seqIndices$1[si$4]] & (TYPE_ET | BN_LIKE_TYPES | TYPE_EN)); si$4++) {
                if (charTypes[seqIndices$1[si$4]] !== TYPE_EN) {
                  changeCharType(seqIndices$1[si$4], TYPE_EN);
                }
              }
            }
          }
        }

        // W6. Otherwise, separators and terminators change to Other Neutral.
        if (charTypeCounts.get(TYPE_ET) || charTypeCounts.get(TYPE_ES) || charTypeCounts.get(TYPE_CS)) {
          for (var si$5 = 0; si$5 < seqIndices$1.length; si$5++) {
            var i$13 = seqIndices$1[si$5];
            if (charTypes[i$13] & (TYPE_ET | TYPE_ES | TYPE_CS)) {
              changeCharType(i$13, TYPE_ON);
              // 5.2 transform adjacent BNs too:
              for (var sj$5 = si$5 - 1; sj$5 >= 0 && (charTypes[seqIndices$1[sj$5]] & BN_LIKE_TYPES); sj$5--) {
                changeCharType(seqIndices$1[sj$5], TYPE_ON);
              }
              for (var sj$6 = si$5 + 1; sj$6 < seqIndices$1.length && (charTypes[seqIndices$1[sj$6]] & BN_LIKE_TYPES); sj$6++) {
                changeCharType(seqIndices$1[sj$6], TYPE_ON);
              }
            }
          }
        }

        // W7. Search backward from each instance of a European number until the first strong type (R, L, or sos)
        // is found. If an L is found, then change the type of the European number to L.
        // NOTE: implemented in single forward pass for efficiency
        if (charTypeCounts.get(TYPE_EN)) {
          for (var si$6 = 0, prevStrongType = sosType; si$6 < seqIndices$1.length; si$6++) {
            var i$14 = seqIndices$1[si$6];
            var type = charTypes[i$14];
            if (type & TYPE_EN) {
              if (prevStrongType === TYPE_L) {
                changeCharType(i$14, TYPE_L);
              }
            } else if (type & STRONG_TYPES) {
              prevStrongType = type;
            }
          }
        }

        // === 3.3.5 Resolving Neutral and Isolate Formatting Types ===

        if (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES)) {
          // N0. Process bracket pairs in an isolating run sequence sequentially in the logical order of the text
          // positions of the opening paired brackets using the logic given below. Within this scope, bidirectional
          // types EN and AN are treated as R.
          var R_TYPES_FOR_N_STEPS = (TYPE_R | TYPE_EN | TYPE_AN);
          var STRONG_TYPES_FOR_N_STEPS = R_TYPES_FOR_N_STEPS | TYPE_L;

          // * Identify the bracket pairs in the current isolating run sequence according to BD16.
          var bracketPairs = [];
          {
            var openerStack = [];
            for (var si$7 = 0; si$7 < seqIndices$1.length; si$7++) {
              // NOTE: for any potential bracket character we also test that it still carries a NI
              // type, as that may have been changed earlier. This doesn't seem to be explicitly
              // called out in the spec, but is required for passage of certain tests.
              if (charTypes[seqIndices$1[si$7]] & NEUTRAL_ISOLATE_TYPES) {
                var char = string[seqIndices$1[si$7]];
                var oppositeBracket = (void 0);
                // Opening bracket
                if (openingToClosingBracket(char) !== null) {
                  if (openerStack.length < 63) {
                    openerStack.push({ char: char, seqIndex: si$7 });
                  } else {
                    break
                  }
                }
                // Closing bracket
                else if ((oppositeBracket = closingToOpeningBracket(char)) !== null) {
                  for (var stackIdx = openerStack.length - 1; stackIdx >= 0; stackIdx--) {
                    var stackChar = openerStack[stackIdx].char;
                    if (stackChar === oppositeBracket ||
                      stackChar === closingToOpeningBracket(getCanonicalBracket(char)) ||
                      openingToClosingBracket(getCanonicalBracket(stackChar)) === char
                    ) {
                      bracketPairs.push([openerStack[stackIdx].seqIndex, si$7]);
                      openerStack.length = stackIdx; //pop the matching bracket and all following
                      break
                    }
                  }
                }
              }
            }
            bracketPairs.sort(function (a, b) { return a[0] - b[0]; });
          }
          // * For each bracket-pair element in the list of pairs of text positions
          for (var pairIdx = 0; pairIdx < bracketPairs.length; pairIdx++) {
            var ref$1 = bracketPairs[pairIdx];
            var openSeqIdx = ref$1[0];
            var closeSeqIdx = ref$1[1];
            // a. Inspect the bidirectional types of the characters enclosed within the bracket pair.
            // b. If any strong type (either L or R) matching the embedding direction is found, set the type for both
            // brackets in the pair to match the embedding direction.
            var foundStrongType = false;
            var useStrongType = 0;
            for (var si$8 = openSeqIdx + 1; si$8 < closeSeqIdx; si$8++) {
              var i$15 = seqIndices$1[si$8];
              if (charTypes[i$15] & STRONG_TYPES_FOR_N_STEPS) {
                foundStrongType = true;
                var lr = (charTypes[i$15] & R_TYPES_FOR_N_STEPS) ? TYPE_R : TYPE_L;
                if (lr === embedDirection) {
                  useStrongType = lr;
                  break
                }
              }
            }
            // c. Otherwise, if there is a strong type it must be opposite the embedding direction. Therefore, test
            // for an established context with a preceding strong type by checking backwards before the opening paired
            // bracket until the first strong type (L, R, or sos) is found.
            //    1. If the preceding strong type is also opposite the embedding direction, context is established, so
            //    set the type for both brackets in the pair to that direction.
            //    2. Otherwise set the type for both brackets in the pair to the embedding direction.
            if (foundStrongType && !useStrongType) {
              useStrongType = sosType;
              for (var si$9 = openSeqIdx - 1; si$9 >= 0; si$9--) {
                var i$16 = seqIndices$1[si$9];
                if (charTypes[i$16] & STRONG_TYPES_FOR_N_STEPS) {
                  var lr$1 = (charTypes[i$16] & R_TYPES_FOR_N_STEPS) ? TYPE_R : TYPE_L;
                  if (lr$1 !== embedDirection) {
                    useStrongType = lr$1;
                  } else {
                    useStrongType = embedDirection;
                  }
                  break
                }
              }
            }
            if (useStrongType) {
              charTypes[seqIndices$1[openSeqIdx]] = charTypes[seqIndices$1[closeSeqIdx]] = useStrongType;
              // * Any number of characters that had original bidirectional character type NSM prior to the application
              // of W1 that immediately follow a paired bracket which changed to L or R under N0 should change to match
              // the type of their preceding bracket.
              if (useStrongType !== embedDirection) {
                for (var si$10 = openSeqIdx + 1; si$10 < seqIndices$1.length; si$10++) {
                  if (!(charTypes[seqIndices$1[si$10]] & BN_LIKE_TYPES)) {
                    if (getBidiCharType(string[seqIndices$1[si$10]]) & TYPE_NSM) {
                      charTypes[seqIndices$1[si$10]] = useStrongType;
                    }
                    break
                  }
                }
              }
              if (useStrongType !== embedDirection) {
                for (var si$11 = closeSeqIdx + 1; si$11 < seqIndices$1.length; si$11++) {
                  if (!(charTypes[seqIndices$1[si$11]] & BN_LIKE_TYPES)) {
                    if (getBidiCharType(string[seqIndices$1[si$11]]) & TYPE_NSM) {
                      charTypes[seqIndices$1[si$11]] = useStrongType;
                    }
                    break
                  }
                }
              }
            }
          }

          // N1. A sequence of NIs takes the direction of the surrounding strong text if the text on both sides has the
          // same direction.
          // N2. Any remaining NIs take the embedding direction.
          for (var si$12 = 0; si$12 < seqIndices$1.length; si$12++) {
            if (charTypes[seqIndices$1[si$12]] & NEUTRAL_ISOLATE_TYPES) {
              var niRunStart = si$12, niRunEnd = si$12;
              var prevType$2 = sosType; //si === 0 ? sosType : (charTypes[seqIndices[si - 1]] & R_TYPES_FOR_N_STEPS) ? TYPE_R : TYPE_L
              for (var si2 = si$12 - 1; si2 >= 0; si2--) {
                if (charTypes[seqIndices$1[si2]] & BN_LIKE_TYPES) {
                  niRunStart = si2; //5.2 treat BNs adjacent to NIs as NIs
                } else {
                  prevType$2 = (charTypes[seqIndices$1[si2]] & R_TYPES_FOR_N_STEPS) ? TYPE_R : TYPE_L;
                  break
                }
              }
              var nextType$1 = eosType;
              for (var si2$1 = si$12 + 1; si2$1 < seqIndices$1.length; si2$1++) {
                if (charTypes[seqIndices$1[si2$1]] & (NEUTRAL_ISOLATE_TYPES | BN_LIKE_TYPES)) {
                  niRunEnd = si2$1;
                } else {
                  nextType$1 = (charTypes[seqIndices$1[si2$1]] & R_TYPES_FOR_N_STEPS) ? TYPE_R : TYPE_L;
                  break
                }
              }
              for (var sj$7 = niRunStart; sj$7 <= niRunEnd; sj$7++) {
                charTypes[seqIndices$1[sj$7]] = prevType$2 === nextType$1 ? prevType$2 : embedDirection;
              }
              si$12 = niRunEnd;
            }
          }
        }
      }

      // === 3.3.6 Resolving Implicit Levels ===

      for (var i$17 = paragraph.start; i$17 <= paragraph.end; i$17++) {
        var level$3 = embedLevels[i$17];
        var type$1 = charTypes[i$17];
        // I2. For all characters with an odd (right-to-left) embedding level, those of type L, EN or AN go up one level.
        if (level$3 & 1) {
          if (type$1 & (TYPE_L | TYPE_EN | TYPE_AN)) {
            embedLevels[i$17]++;
          }
        }
          // I1. For all characters with an even (left-to-right) embedding level, those of type R go up one level
        // and those of type AN or EN go up two levels.
        else {
          if (type$1 & TYPE_R) {
            embedLevels[i$17]++;
          } else if (type$1 & (TYPE_AN | TYPE_EN)) {
            embedLevels[i$17] += 2;
          }
        }

        // 5.2: Resolve any LRE, RLE, LRO, RLO, PDF, or BN to the level of the preceding character if there is one,
        // and otherwise to the base level.
        if (type$1 & BN_LIKE_TYPES) {
          embedLevels[i$17] = i$17 === 0 ? paragraph.level : embedLevels[i$17 - 1];
        }

        // 3.4 L1.1-4: Reset the embedding level of segment/paragraph separators, and any sequence of whitespace or
        // isolate formatting characters preceding them or the end of the paragraph, to the paragraph level.
        // NOTE: this will also need to be applied to each individual line ending after line wrapping occurs.
        if (i$17 === paragraph.end || getBidiCharType(string[i$17]) & (TYPE_S | TYPE_B)) {
          for (var j$1 = i$17; j$1 >= 0 && (getBidiCharType(string[j$1]) & TRAILING_TYPES); j$1--) {
            embedLevels[j$1] = paragraph.level;
          }
        }
      }
    }

    // DONE! The resolved levels can then be used, after line wrapping, to flip runs of characters
    // according to section 3.4 Reordering Resolved Levels
    return {
      levels: embedLevels,
      paragraphs: paragraphs
    }

    function determineAutoEmbedLevel (start, isFSI) {
      // 3.3.1 P2 - P3
      for (var i = start; i < string.length; i++) {
        var charType = charTypes[i];
        if (charType & (TYPE_R | TYPE_AL)) {
          return 1
        }
        if ((charType & (TYPE_B | TYPE_L)) || (isFSI && charType === TYPE_PDI)) {
          return 0
        }
        if (charType & ISOLATE_INIT_TYPES) {
          var pdi = indexOfMatchingPDI(i);
          i = pdi === -1 ? string.length : pdi;
        }
      }
      return 0
    }

    function indexOfMatchingPDI (isolateStart) {
      // 3.1.2 BD9
      var isolationLevel = 1;
      for (var i = isolateStart + 1; i < string.length; i++) {
        var charType = charTypes[i];
        if (charType & TYPE_B) {
          break
        }
        if (charType & TYPE_PDI) {
          if (--isolationLevel === 0) {
            return i
          }
        } else if (charType & ISOLATE_INIT_TYPES) {
          isolationLevel++;
        }
      }
      return -1
    }
  }

  // Bidi mirrored chars data, auto generated
  var data = "14>1,j>2,t>2,u>2,1a>g,2v3>1,1>1,1ge>1,1wd>1,b>1,1j>1,f>1,ai>3,-2>3,+1,8>1k0,-1jq>1y7,-1y6>1hf,-1he>1h6,-1h5>1ha,-1h8>1qi,-1pu>1,6>3u,-3s>7,6>1,1>1,f>1,1>1,+2,3>1,1>1,+13,4>1,1>1,6>1eo,-1ee>1,3>1mg,-1me>1mk,-1mj>1mi,-1mg>1mi,-1md>1,1>1,+2,1>10k,-103>1,1>1,4>1,5>1,1>1,+10,3>1,1>8,-7>8,+1,-6>7,+1,a>1,1>1,u>1,u6>1,1>1,+5,26>1,1>1,2>1,2>2,8>1,7>1,4>1,1>1,+5,b8>1,1>1,+3,1>3,-2>1,2>1,1>1,+2,c>1,3>1,1>1,+2,h>1,3>1,a>1,1>1,2>1,3>1,1>1,d>1,f>1,3>1,1a>1,1>1,6>1,7>1,13>1,k>1,1>1,+19,4>1,1>1,+2,2>1,1>1,+18,m>1,a>1,1>1,lk>1,1>1,4>1,2>1,f>1,3>1,1>1,+3,db>1,1>1,+3,3>1,1>1,+2,14qm>1,1>1,+1,6>1,4j>1,j>2,t>2,u>2,2>1,+1";

  var mirrorMap;

  function parse () {
    if (!mirrorMap) {
      //const start = performance.now()
      var ref = parseCharacterMap(data, true);
      var map = ref.map;
      var reverseMap = ref.reverseMap;
      // Combine both maps into one
      reverseMap.forEach(function (value, key) {
        map.set(key, value);
      });
      mirrorMap = map;
      //console.log(`mirrored chars parsed in ${performance.now() - start}ms`)
    }
  }

  function getMirroredCharacter (char) {
    parse();
    return mirrorMap.get(char) || null
  }

  /**
   * Given a string and its resolved embedding levels, build a map of indices to replacement chars
   * for any characters in right-to-left segments that have defined mirrored characters.
   * @param string
   * @param embeddingLevels
   * @param [start]
   * @param [end]
   * @return {Map<number, string>}
   */
  function getMirroredCharactersMap(string, embeddingLevels, start, end) {
    var strLen = string.length;
    start = Math.max(0, start == null ? 0 : +start);
    end = Math.min(strLen - 1, end == null ? strLen - 1 : +end);

    var map = new Map();
    for (var i = start; i <= end; i++) {
      if (embeddingLevels[i] & 1) { //only odd (rtl) levels
        var mirror = getMirroredCharacter(string[i]);
        if (mirror !== null) {
          map.set(i, mirror);
        }
      }
    }
    return map
  }

  /**
   * Given a start and end denoting a single line within a string, and a set of precalculated
   * bidi embedding levels, produce a list of segments whose ordering should be flipped, in sequence.
   * @param {string} string - the full input string
   * @param {GetEmbeddingLevelsResult} embeddingLevelsResult - the result object from getEmbeddingLevels
   * @param {number} [start] - first character in a subset of the full string
   * @param {number} [end] - last character in a subset of the full string
   * @return {number[][]} - the list of start/end segments that should be flipped, in order.
   */
  function getReorderSegments(string, embeddingLevelsResult, start, end) {
    var strLen = string.length;
    start = Math.max(0, start == null ? 0 : +start);
    end = Math.min(strLen - 1, end == null ? strLen - 1 : +end);

    var segments = [];
    embeddingLevelsResult.paragraphs.forEach(function (paragraph) {
      var lineStart = Math.max(start, paragraph.start);
      var lineEnd = Math.min(end, paragraph.end);
      if (lineStart < lineEnd) {
        // Local slice for mutation
        var lineLevels = embeddingLevelsResult.levels.slice(lineStart, lineEnd + 1);

        // 3.4 L1.4: Reset any sequence of whitespace characters and/or isolate formatting characters at the
        // end of the line to the paragraph level.
        for (var i = lineEnd; i >= lineStart && (getBidiCharType(string[i]) & TRAILING_TYPES); i--) {
          lineLevels[i] = paragraph.level;
        }

        // L2. From the highest level found in the text to the lowest odd level on each line, including intermediate levels
        // not actually present in the text, reverse any contiguous sequence of characters that are at that level or higher.
        var maxLevel = paragraph.level;
        var minOddLevel = Infinity;
        for (var i$1 = 0; i$1 < lineLevels.length; i$1++) {
          var level = lineLevels[i$1];
          if (level > maxLevel) { maxLevel = level; }
          if (level < minOddLevel) { minOddLevel = level | 1; }
        }
        for (var lvl = maxLevel; lvl >= minOddLevel; lvl--) {
          for (var i$2 = 0; i$2 < lineLevels.length; i$2++) {
            if (lineLevels[i$2] >= lvl) {
              var segStart = i$2;
              while (i$2 + 1 < lineLevels.length && lineLevels[i$2 + 1] >= lvl) {
                i$2++;
              }
              if (i$2 > segStart) {
                segments.push([segStart + lineStart, i$2 + lineStart]);
              }
            }
          }
        }
      }
    });
    return segments
  }

  /**
   * @param {string} string
   * @param {GetEmbeddingLevelsResult} embedLevelsResult
   * @param {number} [start]
   * @param {number} [end]
   * @return {string} the new string with bidi segments reordered
   */
  function getReorderedString(string, embedLevelsResult, start, end) {
    var indices = getReorderedIndices(string, embedLevelsResult, start, end);
    var chars = [].concat( string );
    indices.forEach(function (charIndex, i) {
      chars[i] = (
        (embedLevelsResult.levels[charIndex] & 1) ? getMirroredCharacter(string[charIndex]) : null
      ) || string[charIndex];
    });
    return chars.join('')
  }

  /**
   * @param {string} string
   * @param {GetEmbeddingLevelsResult} embedLevelsResult
   * @param {number} [start]
   * @param {number} [end]
   * @return {number[]} an array with character indices in their new bidi order
   */
  function getReorderedIndices(string, embedLevelsResult, start, end) {
    var segments = getReorderSegments(string, embedLevelsResult, start, end);
    // Fill an array with indices
    var indices = [];
    for (var i = 0; i < string.length; i++) {
      indices[i] = i;
    }
    // Reverse each segment in order
    segments.forEach(function (ref) {
      var start = ref[0];
      var end = ref[1];

      var slice = indices.slice(start, end + 1);
      for (var i = slice.length; i--;) {
        indices[end - i] = slice[i];
      }
    });
    return indices
  }

  exports.closingToOpeningBracket = closingToOpeningBracket;
  exports.getBidiCharType = getBidiCharType;
  exports.getBidiCharTypeName = getBidiCharTypeName;
  exports.getCanonicalBracket = getCanonicalBracket;
  exports.getEmbeddingLevels = getEmbeddingLevels;
  exports.getMirroredCharacter = getMirroredCharacter;
  exports.getMirroredCharactersMap = getMirroredCharactersMap;
  exports.getReorderSegments = getReorderSegments;
  exports.getReorderedIndices = getReorderedIndices;
  exports.getReorderedString = getReorderedString;
  exports.openingToClosingBracket = openingToClosingBracket;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

}({}));
return bidi}

const {ShaderChunk,UniformsUtils,MeshDepthMaterial,RGBADepthPacking,MeshDistanceMaterial,ShaderLib,Matrix4,Vector3,Mesh,CylinderGeometry,Vector2,MeshStandardMaterial,DoubleSide} = await importShared('three');


/**
 * Regular expression for matching the `void main() {` opener line in GLSL.
 * @type {RegExp}
 */
const voidMainRegExp = /\bvoid\s+main\s*\(\s*\)\s*{/g;

/**
 * Recursively expands all `#include <xyz>` statements within string of shader code.
 * Copied from three's WebGLProgram#parseIncludes for external use.
 *
 * @param {string} source - The GLSL source code to evaluate
 * @return {string} The GLSL code with all includes expanded
 */
function expandShaderIncludes( source ) {
  const pattern = /^[ \t]*#include +<([\w\d./]+)>/gm;
  function replace(match, include) {
    let chunk = ShaderChunk[include];
    return chunk ? expandShaderIncludes(chunk) : match
  }
  return source.replace( pattern, replace )
}

/*
 * This is a direct copy of MathUtils.generateUUID from Three.js, to preserve compatibility with three
 * versions before 0.113.0 as it was changed from Math to MathUtils in that version.
 * https://github.com/mrdoob/three.js/blob/dd8b5aa3b270c17096b90945cd2d6d1b13aaec53/src/math/MathUtils.js#L16
 */

const _lut = [];

for (let i = 0; i < 256; i++) {
  _lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
}

function generateUUID() {

  // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136

  const d0 = Math.random() * 0xffffffff | 0;
  const d1 = Math.random() * 0xffffffff | 0;
  const d2 = Math.random() * 0xffffffff | 0;
  const d3 = Math.random() * 0xffffffff | 0;
  const uuid = _lut[d0 & 0xff] + _lut[d0 >> 8 & 0xff] + _lut[d0 >> 16 & 0xff] + _lut[d0 >> 24 & 0xff] + '-' +
    _lut[d1 & 0xff] + _lut[d1 >> 8 & 0xff] + '-' + _lut[d1 >> 16 & 0x0f | 0x40] + _lut[d1 >> 24 & 0xff] + '-' +
    _lut[d2 & 0x3f | 0x80] + _lut[d2 >> 8 & 0xff] + '-' + _lut[d2 >> 16 & 0xff] + _lut[d2 >> 24 & 0xff] +
    _lut[d3 & 0xff] + _lut[d3 >> 8 & 0xff] + _lut[d3 >> 16 & 0xff] + _lut[d3 >> 24 & 0xff];

  // .toUpperCase() here flattens concatenated strings to save heap memory space.
  return uuid.toUpperCase()

}

// Local assign polyfill to avoid importing troika-core
const assign = Object.assign || function(/*target, ...sources*/) {
  let target = arguments[0];
  for (let i = 1, len = arguments.length; i < len; i++) {
    let source = arguments[i];
    if (source) {
      for (let prop in source) {
        if (Object.prototype.hasOwnProperty.call(source, prop)) {
          target[prop] = source[prop];
        }
      }
    }
  }
  return target
};


const epoch = Date.now();
const CONSTRUCTOR_CACHE = new WeakMap();
const SHADER_UPGRADE_CACHE = new Map();

// Material ids must be integers, but we can't access the increment from Three's `Material` module,
// so let's choose a sufficiently large starting value that should theoretically never collide.
let materialInstanceId = 1e10;

/**
 * A utility for creating a custom shader material derived from another material's
 * shaders. This allows you to inject custom shader logic and transforms into the
 * builtin ThreeJS materials without having to recreate them from scratch.
 *
 * @param {THREE.Material} baseMaterial - the original material to derive from
 *
 * @param {Object} options - How the base material should be modified.
 * @param {Object=} options.defines - Custom `defines` for the material
 * @param {Object=} options.extensions - Custom `extensions` for the material, e.g. `{derivatives: true}`
 * @param {Object=} options.uniforms - Custom `uniforms` for use in the modified shader. These can
 *        be accessed and manipulated via the resulting material's `uniforms` property, just like
 *        in a ShaderMaterial. You do not need to repeat the base material's own uniforms here.
 * @param {String=} options.timeUniform - If specified, a uniform of this name will be injected into
 *        both shaders, and it will automatically be updated on each render frame with a number of
 *        elapsed milliseconds. The "zero" epoch time is not significant so don't rely on this as a
 *        true calendar time.
 * @param {String=} options.vertexDefs - Custom GLSL code to inject into the vertex shader's top-level
 *        definitions, above the `void main()` function.
 * @param {String=} options.vertexMainIntro - Custom GLSL code to inject at the top of the vertex
 *        shader's `void main` function.
 * @param {String=} options.vertexMainOutro - Custom GLSL code to inject at the end of the vertex
 *        shader's `void main` function.
 * @param {String=} options.vertexTransform - Custom GLSL code to manipulate the `position`, `normal`,
 *        and/or `uv` vertex attributes. This code will be wrapped within a standalone function with
 *        those attributes exposed by their normal names as read/write values.
 * @param {String=} options.fragmentDefs - Custom GLSL code to inject into the fragment shader's top-level
 *        definitions, above the `void main()` function.
 * @param {String=} options.fragmentMainIntro - Custom GLSL code to inject at the top of the fragment
 *        shader's `void main` function.
 * @param {String=} options.fragmentMainOutro - Custom GLSL code to inject at the end of the fragment
 *        shader's `void main` function. You can manipulate `gl_FragColor` here but keep in mind it goes
 *        after any of ThreeJS's color postprocessing shader chunks (tonemapping, fog, etc.), so if you
 *        want those to apply to your changes use `fragmentColorTransform` instead.
 * @param {String=} options.fragmentColorTransform - Custom GLSL code to manipulate the `gl_FragColor`
 *        output value. Will be injected near the end of the `void main` function, but before any
 *        of ThreeJS's color postprocessing shader chunks (tonemapping, fog, etc.), and before the
 *        `fragmentMainOutro`.
 * @param {function({fragmentShader: string, vertexShader:string}):
 *        {fragmentShader: string, vertexShader:string}} options.customRewriter - A function
 *        for performing custom rewrites of the full shader code. Useful if you need to do something
 *        special that's not covered by the other builtin options. This function will be executed before
 *        any other transforms are applied.
 * @param {boolean=} options.chained - Set to `true` to prototype-chain the derived material to the base
 *        material, rather than the default behavior of copying it. This allows the derived material to
 *        automatically pick up changes made to the base material and its properties. This can be useful
 *        where the derived material is hidden from the user as an implementation detail, allowing them
 *        to work with the original material like normal. But it can result in unexpected behavior if not
 *        handled carefully.
 *
 * @return {THREE.Material}
 *
 * The returned material will also have two new methods, `getDepthMaterial()` and `getDistanceMaterial()`,
 * which can be called to get a variant of the derived material for use in shadow casting. If the
 * target mesh is expected to cast shadows, then you can assign these to the mesh's `customDepthMaterial`
 * (for directional and spot lights) and/or `customDistanceMaterial` (for point lights) properties to
 * allow the cast shadow to honor your derived shader's vertex transforms and discarded fragments. These
 * will also set a custom `#define IS_DEPTH_MATERIAL` or `#define IS_DISTANCE_MATERIAL` that you can look
 * for in your derived shaders with `#ifdef` to customize their behavior for the depth or distance
 * scenarios, e.g. skipping antialiasing or expensive shader logic.
 */
function createDerivedMaterial(baseMaterial, options) {
  // Generate a key that is unique to the content of these `options`. We'll use this
  // throughout for caching and for generating the upgraded shader code. This increases
  // the likelihood that the resulting shaders will line up across multiple calls so
  // their GL programs can be shared and cached.
  const optionsKey = getKeyForOptions(options);

  // First check to see if we've already derived from this baseMaterial using this
  // unique set of options, and if so reuse the constructor to avoid some allocations.
  let ctorsByDerivation = CONSTRUCTOR_CACHE.get(baseMaterial);
  if (!ctorsByDerivation) {
    CONSTRUCTOR_CACHE.set(baseMaterial, (ctorsByDerivation = Object.create(null)));
  }
  if (ctorsByDerivation[optionsKey]) {
    return new ctorsByDerivation[optionsKey]()
  }

  const privateBeforeCompileProp = `_onBeforeCompile${optionsKey}`;

  // Private onBeforeCompile handler that injects the modified shaders and uniforms when
  // the renderer switches to this material's program
  const onBeforeCompile = function (shaderInfo, renderer) {
    baseMaterial.onBeforeCompile.call(this, shaderInfo, renderer);

    // Upgrade the shaders, caching the result by incoming source code
    const cacheKey = this.customProgramCacheKey() + '|' + shaderInfo.vertexShader + '|' + shaderInfo.fragmentShader;
    let upgradedShaders = SHADER_UPGRADE_CACHE[cacheKey];
    if (!upgradedShaders) {
      const upgraded = upgradeShaders(this, shaderInfo, options, optionsKey);
      upgradedShaders = SHADER_UPGRADE_CACHE[cacheKey] = upgraded;
    }

    // Inject upgraded shaders and uniforms into the program
    shaderInfo.vertexShader = upgradedShaders.vertexShader;
    shaderInfo.fragmentShader = upgradedShaders.fragmentShader;
    assign(shaderInfo.uniforms, this.uniforms);

    // Inject auto-updating time uniform if requested
    if (options.timeUniform) {
      shaderInfo.uniforms[options.timeUniform] = {
        get value() {return Date.now() - epoch}
      };
    }

    // Users can still add their own handlers on top of ours
    if (this[privateBeforeCompileProp]) {
      this[privateBeforeCompileProp](shaderInfo);
    }
  };

  const DerivedMaterial = function DerivedMaterial() {
    return derive(options.chained ? baseMaterial : baseMaterial.clone())
  };

  const derive = function(base) {
    // Prototype chain to the base material
    const derived = Object.create(base, descriptor);

    // Store the baseMaterial for reference; this is always the original even when cloning
    Object.defineProperty(derived, 'baseMaterial', { value: baseMaterial });

    // Needs its own ids
    Object.defineProperty(derived, 'id', { value: materialInstanceId++ });
    derived.uuid = generateUUID();

    // Merge uniforms, defines, and extensions
    derived.uniforms = assign({}, base.uniforms, options.uniforms);
    derived.defines = assign({}, base.defines, options.defines);
    derived.defines[`TROIKA_DERIVED_MATERIAL_${optionsKey}`] = ''; //force a program change from the base material
    derived.extensions = assign({}, base.extensions, options.extensions);

    // Don't inherit EventDispatcher listeners
    derived._listeners = undefined;

    return derived
  };

  const descriptor = {
    constructor: {value: DerivedMaterial},
    isDerivedMaterial: {value: true},

    type: {
      get: () => baseMaterial.type,
      set: (value) => {baseMaterial.type = value;}
    },

    isDerivedFrom: {
      writable: true,
      configurable: true,
      value: function (testMaterial) {
        const base = this.baseMaterial;
        return testMaterial === base || (base.isDerivedMaterial && base.isDerivedFrom(testMaterial)) || false
      }
    },

    customProgramCacheKey: {
      writable: true,
      configurable: true,
      value: function () {
        return baseMaterial.customProgramCacheKey() + '|' + optionsKey
      }
    },

    onBeforeCompile: {
      get() {
        return onBeforeCompile
      },
      set(fn) {
        this[privateBeforeCompileProp] = fn;
      }
    },

    copy: {
      writable: true,
      configurable: true,
      value: function (source) {
        baseMaterial.copy.call(this, source);
        if (!baseMaterial.isShaderMaterial && !baseMaterial.isDerivedMaterial) {
          assign(this.extensions, source.extensions);
          assign(this.defines, source.defines);
          assign(this.uniforms, UniformsUtils.clone(source.uniforms));
        }
        return this
      }
    },

    clone: {
      writable: true,
      configurable: true,
      value: function () {
        const newBase = new baseMaterial.constructor();
        return derive(newBase).copy(this)
      }
    },

    /**
     * Utility to get a MeshDepthMaterial that will honor this derived material's vertex
     * transformations and discarded fragments.
     */
    getDepthMaterial: {
      writable: true,
      configurable: true,
      value: function() {
        let depthMaterial = this._depthMaterial;
        if (!depthMaterial) {
          depthMaterial = this._depthMaterial = createDerivedMaterial(
            baseMaterial.isDerivedMaterial
              ? baseMaterial.getDepthMaterial()
              : new MeshDepthMaterial({ depthPacking: RGBADepthPacking }),
            options
          );
          depthMaterial.defines.IS_DEPTH_MATERIAL = '';
          depthMaterial.uniforms = this.uniforms; //automatically recieve same uniform values
        }
        return depthMaterial
      }
    },

    /**
     * Utility to get a MeshDistanceMaterial that will honor this derived material's vertex
     * transformations and discarded fragments.
     */
    getDistanceMaterial: {
      writable: true,
      configurable: true,
      value: function() {
        let distanceMaterial = this._distanceMaterial;
        if (!distanceMaterial) {
          distanceMaterial = this._distanceMaterial = createDerivedMaterial(
            baseMaterial.isDerivedMaterial
              ? baseMaterial.getDistanceMaterial()
              : new MeshDistanceMaterial(),
            options
          );
          distanceMaterial.defines.IS_DISTANCE_MATERIAL = '';
          distanceMaterial.uniforms = this.uniforms; //automatically recieve same uniform values
        }
        return distanceMaterial
      }
    },

    dispose: {
      writable: true,
      configurable: true,
      value() {
        const {_depthMaterial, _distanceMaterial} = this;
        if (_depthMaterial) _depthMaterial.dispose();
        if (_distanceMaterial) _distanceMaterial.dispose();
        baseMaterial.dispose.call(this);
      }
    }
  };

  ctorsByDerivation[optionsKey] = DerivedMaterial;
  return new DerivedMaterial()
}


function upgradeShaders(material, {vertexShader, fragmentShader}, options, key) {
  let {
    vertexDefs,
    vertexMainIntro,
    vertexMainOutro,
    vertexTransform,
    fragmentDefs,
    fragmentMainIntro,
    fragmentMainOutro,
    fragmentColorTransform,
    customRewriter,
    timeUniform
  } = options;

  vertexDefs = vertexDefs || '';
  vertexMainIntro = vertexMainIntro || '';
  vertexMainOutro = vertexMainOutro || '';
  fragmentDefs = fragmentDefs || '';
  fragmentMainIntro = fragmentMainIntro || '';
  fragmentMainOutro = fragmentMainOutro || '';

  // Expand includes if needed
  if (vertexTransform || customRewriter) {
    vertexShader = expandShaderIncludes(vertexShader);
  }
  if (fragmentColorTransform || customRewriter) {
    // We need to be able to find postprocessing chunks after include expansion in order to
    // put them after the fragmentColorTransform, so mark them with comments first. Even if
    // this particular derivation doesn't have a fragmentColorTransform, other derivations may,
    // so we still mark them.
    fragmentShader = fragmentShader.replace(
      /^[ \t]*#include <((?:tonemapping|encodings|colorspace|fog|premultiplied_alpha|dithering)_fragment)>/gm,
      '\n//!BEGIN_POST_CHUNK $1\n$&\n//!END_POST_CHUNK\n'
    );
    fragmentShader = expandShaderIncludes(fragmentShader);
  }

  // Apply custom rewriter function
  if (customRewriter) {
    let res = customRewriter({vertexShader, fragmentShader});
    vertexShader = res.vertexShader;
    fragmentShader = res.fragmentShader;
  }

  // The fragmentColorTransform needs to go before any postprocessing chunks, so extract
  // those and re-insert them into the outro in the correct place:
  if (fragmentColorTransform) {
    let postChunks = [];
    fragmentShader = fragmentShader.replace(
      /^\/\/!BEGIN_POST_CHUNK[^]+?^\/\/!END_POST_CHUNK/gm, // [^]+? = non-greedy match of any chars including newlines
      match => {
        postChunks.push(match);
        return ''
      }
    );
    fragmentMainOutro = `${fragmentColorTransform}\n${postChunks.join('\n')}\n${fragmentMainOutro}`;
  }

  // Inject auto-updating time uniform if requested
  if (timeUniform) {
    const code = `\nuniform float ${timeUniform};\n`;
    vertexDefs = code + vertexDefs;
    fragmentDefs = code + fragmentDefs;
  }

  // Inject a function for the vertexTransform and rename all usages of position/normal/uv
  if (vertexTransform) {
    // Hoist these defs to the very top so they work in other function defs
    vertexShader = `vec3 troika_position_${key};
vec3 troika_normal_${key};
vec2 troika_uv_${key};
${vertexShader}
`;
    vertexDefs = `${vertexDefs}
void troikaVertexTransform${key}() {
  vec3 position = troika_position_${key};
  vec3 normal = troika_normal_${key};
  vec2 uv = troika_uv_${key};
  ${vertexTransform}
  troika_position_${key} = position;
  troika_normal_${key} = normal;
  troika_uv_${key} = uv;
}
`;
    vertexMainIntro = `
troika_position_${key} = vec3(position);
troika_normal_${key} = vec3(normal);
troika_uv_${key} = vec2(uv);
troikaVertexTransform${key}();
${vertexMainIntro}
`;
    vertexShader = vertexShader.replace(/\b(position|normal|uv)\b/g, (match, match1, index, fullStr) => {
      return /\battribute\s+vec[23]\s+$/.test(fullStr.substr(0, index)) ? match1 : `troika_${match1}_${key}`
    });

    // Three r152 introduced the MAP_UV token, replace it too if it's pointing to the main 'uv'
    // Perhaps the other textures too going forward?
    if (!(material.map && material.map.channel > 0)) {
      vertexShader = vertexShader.replace(/\bMAP_UV\b/g, `troika_uv_${key}`);
    }
  }

  // Inject defs and intro/outro snippets
  vertexShader = injectIntoShaderCode(vertexShader, key, vertexDefs, vertexMainIntro, vertexMainOutro);
  fragmentShader = injectIntoShaderCode(fragmentShader, key, fragmentDefs, fragmentMainIntro, fragmentMainOutro);

  return {
    vertexShader,
    fragmentShader
  }
}

function injectIntoShaderCode(shaderCode, id, defs, intro, outro) {
  if (intro || outro || defs) {
    shaderCode = shaderCode.replace(voidMainRegExp, `
${defs}
void troikaOrigMain${id}() {`
    );
    shaderCode += `
void main() {
  ${intro}
  troikaOrigMain${id}();
  ${outro}
}`;
  }
  return shaderCode
}


function optionsJsonReplacer(key, value) {
  return key === 'uniforms' ? undefined : typeof value === 'function' ? value.toString() : value
}

let _idCtr = 0;
const optionsHashesToIds = new Map();
function getKeyForOptions(options) {
  const optionsHash = JSON.stringify(options, optionsJsonReplacer);
  let id = optionsHashesToIds.get(optionsHash);
  if (id == null) {
    optionsHashesToIds.set(optionsHash, (id = ++_idCtr));
  }
  return id
}

export { SDFGenerator as S, bidiFactory as b, createDerivedMaterial as c, defineWorkerModule as d, terminateWorker as t, voidMainRegExp as v };
