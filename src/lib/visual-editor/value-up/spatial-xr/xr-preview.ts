import type { PrototypeVisualProject } from "../../prototype-project";
import { compileVisualProject } from "../../compiler";
import { materializeVisualCompilation } from "../../publish";
import { tauri } from "../../../tauri";
import { startDevServer, type DevHandle, type LogLine } from "../../../xrift-cli";
import { openXrPreviewUrl } from "./openxr-client";

const XR_BRIDGE_SOURCE = String.raw`
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { LAYERS, useXRift } from '@xrift/world-components'
import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three'

const XR_REACH = 3.5

function makeRay() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -XR_REACH], 3))
  const material = new LineBasicMaterial()
  return new Line(geometry, material)
}

export function XriftStudioXrBridge() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const { interactableObjects } = useXRift()

  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: any }).xr
    gl.xr.enabled = true
    gl.xr.setReferenceSpaceType('local-floor')

    const button = document.createElement('button')
    button.dataset.xriftXrEntry = 'true'
    Object.assign(button.style, {
      position: 'fixed', right: '18px', bottom: '18px', zIndex: '2147483647',
      padding: '12px 18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,.28)',
      background: '#111827', color: 'white', font: '600 14px system-ui', cursor: 'pointer'
    })
    button.textContent = 'Checking VR…'
    document.body.appendChild(button)

    let currentSession: any = null
    const raycaster = new Raycaster()
    raycaster.far = XR_REACH
    raycaster.layers.set(LAYERS.INTERACTABLE)
    const origin = new Vector3()
    const direction = new Vector3()
    const rotation = new Quaternion()

    const controllers = [0, 1].map((index) => gl.xr.getController(index))
    const hands = [0, 1].map((index) => gl.xr.getHand(index))

    const findInteractable = (object: any) => {
      let cursor = object
      while (cursor) {
        if (interactableObjects.has(cursor)) return cursor.userData?.enabled === false ? null : cursor
        cursor = cursor.parent
      }
      return null
    }

    const selectHandlers = controllers.map((controller: any) => {
      const ray = makeRay()
      controller.add(ray)
      scene.add(controller)
      const onSelect = () => {
        controller.getWorldPosition(origin)
        controller.getWorldQuaternion(rotation)
        direction.set(0, 0, -1).applyQuaternion(rotation).normalize()
        raycaster.set(origin, direction)
        const hits = raycaster.intersectObjects(scene.children, true)
        for (const hit of hits) {
          const target: any = findInteractable(hit.object)
          if (!target) continue
          const handler = target.userData?.onInteract
          if (typeof handler === 'function') handler(typeof target.userData?.id === 'string' ? target.userData.id : '')
          break
        }
      }
      controller.addEventListener('select', onSelect)
      return { controller, ray, onSelect }
    })

    hands.forEach((hand) => scene.add(hand))

    const updateButton = (supported: boolean) => {
      button.disabled = !supported
      button.style.opacity = supported ? '1' : '.55'
      button.textContent = supported ? 'Enter VR' : 'WebXR VR unavailable'
    }

    if (!xr?.isSessionSupported) {
      updateButton(false)
    } else {
      xr.isSessionSupported('immersive-vr').then(updateButton).catch(() => updateButton(false))
    }

    const endSession = async () => {
      if (currentSession) await currentSession.end()
    }

    button.onclick = async () => {
      if (currentSession) {
        await endSession()
        return
      }
      if (!xr?.requestSession) return
      try {
        const session = await xr.requestSession('immersive-vr', {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers']
        })
        currentSession = session
        button.textContent = 'Exit VR'
        session.addEventListener('end', () => {
          currentSession = null
          button.textContent = 'Enter VR'
        }, { once: true })
        await gl.xr.setSession(session)
      } catch (error) {
        console.error('[XRift Studio XR Preview]', error)
        button.textContent = 'VR start failed'
      }
    }

    return () => {
      void endSession().catch(() => undefined)
      selectHandlers.forEach(({ controller, ray, onSelect }: any) => {
        controller.removeEventListener('select', onSelect)
        controller.remove(ray)
        scene.remove(controller)
      })
      hands.forEach((hand) => scene.remove(hand))
      button.remove()
      gl.xr.enabled = false
    }
  }, [gl, scene, interactableObjects])

  return null
}
`;

const XR_DEV_ENTRY_SOURCE = String.raw`
import { DevEnvironment, XRiftProvider } from '@xrift/world-components'
import type { CameraConfig, PhysicsConfig } from '@xrift/world-components'
import { createRoot } from 'react-dom/client'
import { World } from './World'
import { XriftStudioXrBridge } from './xrift-studio/XriftStudioXrBridge'
import xriftConfig from '../xrift.json'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

const worldConfig = xriftConfig.world as {
  physics?: PhysicsConfig
  camera?: CameraConfig
  outputBufferType?: string
}

createRoot(rootElement).render(
  <XRiftProvider baseUrl="/">
    <DevEnvironment
      physicsConfig={worldConfig.physics}
      camera={worldConfig.camera}
      outputBufferType={worldConfig.outputBufferType}
    >
      <XriftStudioXrBridge />
      <World />
    </DevEnvironment>
  </XRiftProvider>,
)
`;

export type VisualXrPreviewOptions = {
  documents: PrototypeVisualProject;
  authoringProjectPath: string;
  onLog?: (line: LogLine) => void;
  onUrl?: (url: string) => void;
  signal?: AbortSignal;
};

export async function startVisualXrPreview(
  options: VisualXrPreviewOptions,
): Promise<DevHandle> {
  if (options.documents.project.projectKind !== "world") {
    throw new Error("XR Playは現在ワールドのVisual Projectに対応しています。");
  }
  const log = options.onLog ?? (() => undefined);
  const compilation = compileVisualProject({
    project: options.documents.project,
    scenes: { [options.documents.scene.sceneId]: options.documents.scene },
    assets: options.documents.assets,
    prefabs: options.documents.prefabs,
  });
  if (!compilation.canStage) {
    const message = compilation.diagnostics
      .filter((entry) => entry.severity === "blocking")
      .map((entry) => entry.message)
      .slice(0, 3)
      .join(" / ");
    throw new Error(message || "XR Preview用にワールドを変換できませんでした。");
  }

  // Use a separate compiler-owned folder so Publish cannot reuse XR overlays.
  compilation.stagingPlan.stagingDirectoryName += "-xr-preview";
  const controller = new AbortController();
  const stagingPath = await materializeVisualCompilation(
    options.authoringProjectPath,
    compilation,
    log,
    options.signal ?? controller.signal,
    () => undefined,
  );

  await tauri.applyCompilerStaging(
    options.authoringProjectPath,
    compilation.stagingPlan.stagingDirectoryName,
    [
      { relativePath: "src/dev.tsx", content: XR_DEV_ENTRY_SOURCE },
      {
        relativePath: "src/xrift-studio/XriftStudioXrBridge.tsx",
        content: XR_BRIDGE_SOURCE,
      },
    ],
    [],
    [],
    [],
  );

  if (options.signal?.aborted) throw new Error("XR Previewを中止しました。");
  const handle = await startDevServer(stagingPath, log, (url) => {
    if (options.signal?.aborted) return;
    options.onUrl?.(url);
    void openXrPreviewUrl(url).catch(error => log({ kind: "stderr", text: String(error), ts: Date.now() }));
  });
  if (options.signal?.aborted) { await handle.stop(); throw new Error("XR Previewを中止しました。"); }
  return handle;
}
