import { triangulatePlane } from "./triangulate.js";
const $ = (q) => document.querySelector(q);
const support = $('#support'), caps = $('#caps'), vrButton = $('#vr-test'), arButton = $('#ar-test'), captureButton = $('#capture'), downloadButton = $('#download'), downloadGlbButton = $('#download-glb'), result = $('#result'), sessionReport = $('#session-report');
let lastCapture = null;
const LABELS = { FLOOR: 'floor', CEILING: 'ceiling', WALL_FACE: 'wall', INNER_WALL_FACE: 'wall', OTHER_ROOM_FACE: 'wall', INVISIBLE_WALL_FACE: 'invisible-wall', DOOR_FRAME: 'door', WINDOW_FRAME: 'window', WALL_ART: 'wall-art', TABLE: 'table', DESK: 'desk', COUCH: 'couch', SOFA: 'couch', CHAIR: 'chair', BED: 'bed', SCREEN: 'screen', LAMP: 'lamp', STORAGE: 'storage', PLANT: 'plant', GLOBAL_MESH: 'global-mesh', SCENE_MESH: 'global-mesh', OPENING: 'opening', OTHER: 'other' };
const normalizeLabel = (v) => { const raw = String(v ?? '').trim(); if (!raw)
    return 'other'; const key = raw.replace(/[\s-]+/g, '_').toUpperCase(); return LABELS[key] ?? raw.toLowerCase().replaceAll('_', '-'); };
const vec3 = v => [Number(v?.x ?? 0), Number(v?.y ?? 0), Number(v?.z ?? 0)], quat = v => [Number(v?.x ?? 0), Number(v?.y ?? 0), Number(v?.z ?? 0), Number(v?.w ?? 1)];
const ids = new WeakMap();
let idSeq = 1;
const oid = (prefix, obj) => { if (ids.has(obj))
    return ids.get(obj); const id = `${prefix}-${idSeq++}`; ids.set(obj, id); return id; };
function pose(frame, space, base) { const p = frame.getPose(space, base)?.transform; return { position: vec3(p?.position), rotation: quat(p?.orientation) }; }
function flattenVertices(value) { const list = Array.from(value ?? []); if (!list.length)
    return []; if (typeof list[0] === 'number')
    return list.map(Number); return list.flatMap(v => vec3(v)); }
function planeToSurface(plane, frame, base) { const source = plane.semanticLabel ? String(plane.semanticLabel) : undefined; return { id: oid('plane', plane), kind: 'plane', semanticLabel: normalizeLabel(source), sourceSemanticLabel: source, pose: pose(frame, plane.planeSpace, base), orientation: plane.orientation ?? 'unknown', boundary: { points: Array.from(plane.polygon ?? []).map(vec3) }, lastChangedTime: Number.isFinite(plane.lastChangedTime) ? Number(plane.lastChangedTime) : undefined }; }
function meshToSurface(mesh, frame, base) { const source = mesh.semanticLabel ? String(mesh.semanticLabel) : undefined; const label = normalizeLabel(source); const vertices = flattenVertices(mesh.vertices), indices = mesh.indices ? Array.from(mesh.indices, Number) : []; return { id: oid('mesh', mesh), kind: mesh.isBounded3D ? 'bounded-object' : 'mesh', semanticLabel: label, sourceSemanticLabel: source, pose: pose(frame, mesh.meshSpace, base), mesh: vertices.length ? { vertices, indices } : undefined, bounds: mesh.min && mesh.max ? { min: vec3(mesh.min), max: vec3(mesh.max) } : undefined, lastChangedTime: Number.isFinite(mesh.lastChangedTime) ? Number(mesh.lastChangedTime) : undefined, purposes: label === 'global-mesh' ? ['occlusion', 'static-collider'] : undefined }; }
async function glLayer(session) { const canvas = $('#xr-canvas'); const gl = canvas.getContext('webgl2', { xrCompatible: true, alpha: true }) || canvas.getContext('webgl', { xrCompatible: true, alpha: true }); if (!gl)
    throw new Error('WebGLを作成できません'); await gl.makeXRCompatible?.(); session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) }); return gl; }
async function initialize() { const rows = []; const xr = navigator.xr; const secure = isSecureContext; const gpu = !!navigator.gpu; const layers = typeof XRWebGLBinding === 'function'; let vr = false, ar = false; if (xr) {
    [vr, ar] = await Promise.all([xr.isSessionSupported('immersive-vr').catch(() => false), xr.isSessionSupported('immersive-ar').catch(() => false)]);
} rows.push(['Secure Context', secure], ['WebXR API', !!xr], ['immersive-vr', vr], ['immersive-ar', ar], ['WebGPU', gpu], ['WebXR Layers API', layers]); caps.innerHTML = rows.map(([k, v]) => `<span class="pill ${v ? 'yes' : 'no'}">${v ? '✓' : '×'} ${k}</span>`).join(''); if (!xr) {
    support.textContent = 'このブラウザはWebXRに対応していません。Quest Browser、またはPCのWebXR対応Chromiumで開いてください。';
    support.className = 'warn';
    return;
} support.textContent = `WebXR利用可能 / ${navigator.userAgent}`; support.className = 'ok'; vrButton.disabled = !vr; arButton.disabled = !ar; captureButton.disabled = !ar; }
async function testSession(mode) { let session; try {
    session = await navigator.xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'layers', 'bounded-floor', 'anchors', 'hit-test', 'plane-detection', 'mesh-detection'] });
    const gl = await glLayer(session);
    const base = await session.requestReferenceSpace('local-floor');
    const started = performance.now();
    await new Promise(resolve => { const tick = (_t, frame) => { const viewer = frame.getViewerPose(base); const sources = Array.from(session.inputSources ?? []).map(s => ({ handedness: s.handedness, targetRayMode: s.targetRayMode, profiles: s.profiles, handTracking: !!s.hand, gamepadButtons: s.gamepad?.buttons?.length ?? 0 })); sessionReport.textContent = JSON.stringify({ mode, environmentBlendMode: session.environmentBlendMode, interactionMode: session.interactionMode, views: viewer?.views?.length ?? 0, inputSources: sources, webglVersion: gl instanceof WebGL2RenderingContext ? 2 : 1 }, null, 2); if (performance.now() - started > 2500) {
        resolve();
        return;
    } session.requestAnimationFrame(tick); }; session.requestAnimationFrame(tick); });
}
catch (e) {
    sessionReport.textContent = `XR session error: ${e?.message ?? e}`;
}
finally {
    await session?.end?.().catch(() => { });
} }
vrButton.addEventListener('click', () => testSession('immersive-vr'));
arButton.addEventListener('click', () => testSession('immersive-ar'));
function depthInfo(frame, base) { try {
    const view = frame.getViewerPose?.(base)?.views?.[0], info = view && frame.getDepthInformation?.(view);
    if (!info)
        return { available: false };
    return { available: true, width: info.width, height: info.height, rawValueToMeters: info.rawValueToMeters, dataFormat: info.dataFormat, usage: info.usage };
}
catch {
    return { available: false };
} }
captureButton.addEventListener('click', async () => { captureButton.disabled = true; downloadButton.disabled = true; downloadGlbButton.disabled = true; lastCapture = null; result.textContent = 'XRセッションを開始しています…'; let session; try {
    session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'], optionalFeatures: ['plane-detection', 'mesh-detection', 'anchors', 'hit-test', 'hand-tracking', 'dom-overlay', 'depth-sensing'], domOverlay: { root: document.body }, depthSensing: { usagePreference: ['cpu-optimized', 'gpu-optimized'], dataFormatPreference: ['float32', 'luminance-alpha'] } });
    await glLayer(session);
    const base = await session.requestReferenceSpace('local-floor');
    let hitSource;
    try {
        const viewer = await session.requestReferenceSpace('viewer');
        hitSource = await session.requestHitTestSource?.({ space: viewer, entityTypes: ['plane', 'point'] });
    }
    catch { }
    const started = performance.now();
    let asked = false, lastChange = started, signature = '', latestDepth = { available: false }, placement = null;
    lastCapture = await new Promise((resolve, reject) => { let done = false; const timer = setTimeout(() => fail(new Error('Room Captureがタイムアウトしました')), 45000); const ended = () => fail(new Error('XRセッションが終了しました')); session.addEventListener('end', ended, { once: true }); const cleanup = () => { done = true; clearTimeout(timer); session.removeEventListener('end', ended); }; const fail = e => { if (done)
        return; cleanup(); reject(e); }; const finish = value => { if (done)
        return; cleanup(); resolve(value); }; const tick = (_t, frame) => { if (done)
        return; const planes = Array.from(frame.detectedPlanes ?? []), meshes = Array.from(frame.detectedMeshes ?? []); latestDepth = latestDepth.available ? latestDepth : depthInfo(frame, base); const nextSig = `${planes.length}:${meshes.length}:${planes.map(p => p.lastChangedTime ?? 0)}:${meshes.map(m => m.lastChangedTime ?? 0)}`; if (nextSig !== signature) {
        signature = nextSig;
        lastChange = performance.now();
    } if (!placement && hitSource && frame.getHitTestResults) {
        try {
            const hit = frame.getHitTestResults(hitSource)[0], p = hit?.getPose(base)?.transform;
            if (p)
                placement = { id: `hit-${Date.now().toString(36)}`, source: 'hit-test', pose: { position: vec3(p.position), rotation: quat(p.orientation) } };
        }
        catch { }
    } if (!planes.length && !meshes.length && !asked && performance.now() - started > 2500) {
        asked = true;
        try {
            Promise.resolve(session.initiateRoomCapture?.()).catch(() => { });
        }
        catch { }
    } if ((planes.length || meshes.length) && performance.now() - lastChange > 1800) {
        const inputs = Array.from(session.inputSources ?? []);
        finish({ schemaVersion: '0.2.0', captureId: `webxr-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), source: { transport: 'webxr', device: navigator.userAgent, userAgent: navigator.userAgent }, referenceSpace: 'local-floor', coordinateSystem: 'webxr-right-handed-y-up-meters', features: { mode: 'immersive-ar', enabled: Array.from(session.enabledFeatures ?? []), environmentBlendMode: session.environmentBlendMode, interactionMode: session.interactionMode, inputProfiles: [...new Set(inputs.flatMap(v => v.profiles ?? []))], handTracking: inputs.some(v => !!v.hand), layers: typeof XRWebGLBinding === 'function', webgpu: !!navigator.gpu, depth: latestDepth }, surfaces: [...planes.filter(p => frame.getPose(p.planeSpace, base)).map(p => planeToSurface(p, frame, base)), ...meshes.filter(m => frame.getPose(m.meshSpace, base)).map(m => meshToSurface(m, frame, base))], placements: placement ? [placement] : undefined });
        return;
    } if (performance.now() - started > 45000) {
        fail(new Error('45秒以内に安定したRoom geometryを取得できませんでした'));
        return;
    } session.requestAnimationFrame(tick); }; session.requestAnimationFrame(tick); });
    const counts = {};
    for (const s of lastCapture.surfaces)
        counts[s.semanticLabel] = (counts[s.semanticLabel] ?? 0) + 1;
    result.textContent = JSON.stringify({ captureId: lastCapture.captureId, surfaces: lastCapture.surfaces.length, semanticCounts: counts, meshVertices: lastCapture.surfaces.reduce((n, s) => n + (s.mesh?.vertices?.length ?? 0) / 3, 0), hitTestPlacements: lastCapture.placements?.length ?? 0, depth: lastCapture.features?.depth }, null, 2);
    downloadButton.disabled = false;
    downloadGlbButton.disabled = false;
}
catch (e) {
    result.textContent = `Capture error: ${e?.message ?? e}`;
}
finally {
    await session?.end?.().catch(() => { });
    captureButton.disabled = false;
} });
function captureToGlb(capture) {
    const surfaces = capture.surfaces.filter(s => (s.mesh?.vertices?.length ?? 0) >= 9 || (s.boundary?.points?.length ?? 0) >= 3);
    if (!surfaces.length)
        throw new Error('GLB化できるPlane/Mesh geometryがありません');
    const bufferViews = [], accessors = [], meshes = [], nodes = [], chunks = [];
    let byteOffset = 0;
    const align4 = n => (n + 3) & ~3;
    const minmax = v => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < v.length; i += 3)
        for (let a = 0; a < 3; a++) {
            mn[a] = Math.min(mn[a], v[i + a]);
            mx[a] = Math.max(mx[a], v[i + a]);
        } return [mn, mx]; };
    for (const surface of surfaces) {
        let vertices, indices;
        if (surface.mesh?.vertices?.length) {
            vertices = surface.mesh.vertices;
            indices = surface.mesh.indices?.length ? surface.mesh.indices : Array.from({ length: Math.floor(vertices.length / 9) * 3 }, (_, i) => i);
        }
        else {
            vertices = surface.boundary.points.flat();
            indices = triangulatePlane(surface.boundary.points);
        }
        const pos = new Float32Array(vertices), maxIndex = indices.reduce((max, value) => Math.max(max, value), 0), idx = maxIndex > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
        const pbytes = new Uint8Array(pos.buffer), ibytes = new Uint8Array(idx.buffer);
        const pOff = align4(byteOffset);
        byteOffset = pOff + pbytes.length;
        const iOff = align4(byteOffset);
        byteOffset = iOff + ibytes.length;
        chunks.push([pOff, pbytes], [iOff, ibytes]);
        const pv = bufferViews.push({ buffer: 0, byteOffset: pOff, byteLength: pbytes.length, target: 34962 }) - 1, iv = bufferViews.push({ buffer: 0, byteOffset: iOff, byteLength: ibytes.length, target: 34963 }) - 1;
        const [mn, mx] = minmax(vertices);
        const pa = accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: mn, max: mx }) - 1, ia = accessors.push({ bufferView: iv, componentType: maxIndex > 65535 ? 5125 : 5123, count: idx.length, type: 'SCALAR', min: [0], max: [maxIndex] }) - 1;
        const mi = meshes.push({ name: `Spatial ${surface.semanticLabel ?? 'other'}`, primitives: [{ attributes: { POSITION: pa }, indices: ia, mode: 4, material: 0 }] }) - 1;
        nodes.push({ name: `Spatial ${surface.semanticLabel ?? 'other'}`, mesh: mi, translation: surface.pose?.position ?? [0, 0, 0], rotation: surface.pose?.rotation ?? [0, 0, 0, 1], extras: { semanticLabel: surface.semanticLabel, sourceSemanticLabel: surface.sourceSemanticLabel, sourceSurfaceId: surface.id } });
    }
    const binLen = align4(byteOffset), bin = new Uint8Array(binLen);
    for (const [off, b] of chunks)
        bin.set(b, off);
    const gltf = { asset: { version: '2.0', generator: 'XRift Studio WebXR Spatial Capture', extras: { captureId: capture.captureId, source: capture.source } }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials: [{doubleSided:true,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1}}], buffers: [{ byteLength: binLen }], bufferViews, accessors };
    let json = new TextEncoder().encode(JSON.stringify(gltf)), jlen = align4(json.length), total = 12 + 8 + jlen + 8 + binLen, out = new Uint8Array(total), view = new DataView(out.buffer), o = 0;
    for (const n of [0x46546c67, 2, total, jlen, 0x4e4f534a]) {
        view.setUint32(o, n, true);
        o += 4;
    }
    out.set(json, o);
    out.fill(0x20, o + json.length, o + jlen);
    o += jlen;
    view.setUint32(o, binLen, true);
    o += 4;
    view.setUint32(o, 0x004e4942, true);
    o += 4;
    out.set(bin, o);
    return out;
}
downloadGlbButton.addEventListener('click', () => { if (!lastCapture)
    return; try {
    const bytes = captureToGlb(lastCapture), blob = new Blob([bytes], { type: 'model/gltf-binary' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${lastCapture.captureId}.glb`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
catch (e) {
    result.textContent = `GLB export error: ${e?.message ?? e}`;
} });
async function loadSampleLinks() { try {
    const manifest = await fetch('../visual-editor/spatial-samples/manifest.json').then(r => r.json());
    const target = $('#sample-links');
    target.innerHTML = manifest.models.map(m => `<a class="pill yes" href="../${m.publicPath.replace(/^\//, '')}" download>${m.semanticLabel}</a>`).join('');
}
catch { } }
loadSampleLinks();
downloadButton.addEventListener('click', () => { if (!lastCapture)
    return; const blob = new Blob([JSON.stringify(lastCapture, null, 2)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${lastCapture.captureId}.xrift-spatial.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
initialize();
