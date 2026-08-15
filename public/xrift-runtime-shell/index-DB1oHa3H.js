const isPromise = (promise) => typeof promise === "object" && typeof promise.then === "function";
const globalCache = [];
function shallowEqualArrays(arrA, arrB, equal = (a, b) => a === b) {
  if (arrA === arrB) return true;
  if (!arrA || !arrB) return false;
  const len = arrA.length;
  if (arrB.length !== len) return false;
  for (let i = 0; i < len; i++) if (!equal(arrA[i], arrB[i])) return false;
  return true;
}
function query(fn, keys = null, preload2 = false, config = {}) {
  if (keys === null) keys = [fn];
  for (const entry2 of globalCache) {
    if (shallowEqualArrays(keys, entry2.keys, entry2.equal)) {
      if (preload2) return void 0;
      if (Object.prototype.hasOwnProperty.call(entry2, "error")) throw entry2.error;
      if (Object.prototype.hasOwnProperty.call(entry2, "response")) {
        if (config.lifespan && config.lifespan > 0) {
          if (entry2.timeout) clearTimeout(entry2.timeout);
          entry2.timeout = setTimeout(entry2.remove, config.lifespan);
        }
        return entry2.response;
      }
      if (!preload2) throw entry2.promise;
    }
  }
  const entry = {
    keys,
    equal: config.equal,
    remove: () => {
      const index = globalCache.indexOf(entry);
      if (index !== -1) globalCache.splice(index, 1);
    },
    promise: (
      // Execute the promise
      (isPromise(fn) ? fn : fn(...keys)).then((response) => {
        entry.response = response;
        if (config.lifespan && config.lifespan > 0) {
          entry.timeout = setTimeout(entry.remove, config.lifespan);
        }
      }).catch((error) => entry.error = error)
    )
  };
  globalCache.push(entry);
  if (!preload2) throw entry.promise;
  return void 0;
}
const suspend = (fn, keys, config) => query(fn, keys, false, config);
const preload = (fn, keys, config) => void query(fn, keys, true, config);
const clear = (keys) => {
  if (keys === void 0 || keys.length === 0) globalCache.splice(0, globalCache.length);
  else {
    const entry = globalCache.find((entry2) => shallowEqualArrays(keys, entry2.keys, entry2.equal));
    if (entry) entry.remove();
  }
};

export { clear as c, preload as p, suspend as s };
