import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCatalogPreviewVisibility } from "./useCatalogPreviewVisibility";

/**
 * Catalog cards, drawn by the real renderer without holding its context.
 *
 * A card cannot keep a WebGL context. This WebView evicts aggressively —
 * measured here, creating contexts destroys older ones long before any
 * documented limit — and the oldest context in the app is the editor's own
 * Scene View, which goes black while a shelf is open. One context per card is
 * therefore not a budgeting problem to tune but a design that cannot hold.
 *
 * So a card renders the real scene once, keeps the frame as an image, and
 * gives the context straight back. What the author sees is genuinely what the
 * renderer produced from the same data the placement uses — a photograph of
 * the thing rather than a drawing of it. Motion lives in the detail pane,
 * which is a single long-lived preview.
 *
 * Captures are queued one at a time, so no matter how many cards scroll into
 * view at once, at most one extra context exists.
 */


type PreviewAssetLoads = {
  pending: Set<symbol>;
  failed: boolean;
  begin: () => (success?: boolean) => void;
};

const PreviewAssetLoadContext = createContext<PreviewAssetLoads | null>(null);
const untrackedLoad = () => (_success = true) => {};

/** A model registers before loading; still captures wait for its real geometry. */
export function useCatalogPreviewAssetLoad() {
  return useContext(PreviewAssetLoadContext)?.begin ?? untrackedLoad;
}

function createAssetLoads(): PreviewAssetLoads {
  const loads: PreviewAssetLoads = {
    pending: new Set(),
    failed: false,
    begin: () => {
      const token = Symbol("catalog-model");
      loads.pending.add(token);
      return (success = true) => {
        if (!loads.pending.delete(token)) return;
        if (!success) loads.failed = true;
      };
    },
  };
  return loads;
}

const frameCache = new Map<string, string>();

let captureChain: Promise<void> = Promise.resolve();

function enqueueCapture(job: () => Promise<void>): Promise<void> {
  const next = captureChain.then(job, job);
  captureChain = next.catch(() => undefined);
  return next;
}

export function CatalogPreviewFrame({
  cacheKey,
  cameraPosition,
  lookAtY = 0,
  fov = 42,
  className = "h-full w-full",
  live = false,
  children,
}: {
  /** Identifies the frame in the cache. Include anything that changes it. */
  cacheKey: string;
  cameraPosition: readonly [number, number, number];
  lookAtY?: number;
  fov?: number;
  className?: string;
  /** The detail pane keeps one long-lived context and stays in motion. */
  live?: boolean;
  children: ReactNode;
}) {
  const { ref, visible } = useCatalogPreviewVisibility<HTMLDivElement>();
  const assetLoads = useMemo(createAssetLoads, [cacheKey]);
  const [frame, setFrame] = useState<string | null>(
    () => frameCache.get(cacheKey) ?? null,
  );
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const giveUpRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    giveUpRef.current = false;
    setError(null);
    const cached = frameCache.get(cacheKey);
    if (cached) {
      setFrame(cached);
      return;
    }
    setFrame(null);
  }, [cacheKey]);

  useEffect(() => {
    if (live || frame || capturing || !visible || giveUpRef.current) return;
    let released = false;
    void enqueueCapture(
      () =>
        new Promise<void>((resolve) => {
          if (cancelledRef.current || released) {
            resolve();
            return;
          }
          setCapturing(true);
          // Resolved by onCaptured below; the timeout stops a context that
          // never produces a frame from blocking the queue. The card stays
          // in an explicit failure state without automatic retries, because failures
          // such as a lost WebGL context under context churn repeat on
          // every attempt and would otherwise loop forever.
          const timeout = window.setTimeout(() => {
            released = true;
            giveUpRef.current = true;
            setCapturing(false);
            setError("プレビューを読み込めませんでした");
            captureResolvers.delete(cacheKey);
            resolve();
          }, 4000);
          captureResolvers.set(cacheKey, () => {
            window.clearTimeout(timeout);
            released = true;
            resolve();
          });
        }),
    );
    return () => {
      released = true;
    };
  }, [cacheKey, capturing, frame, live, visible]);

  const onFailed = () => {
    giveUpRef.current = true;
    setError("モデルを読み込めませんでした");
    setCapturing(false);
    captureResolvers.get(cacheKey)?.();
    captureResolvers.delete(cacheKey);
  };

  const onCaptured = (dataUrl: string) => {
    frameCache.set(cacheKey, dataUrl);
    if (!cancelledRef.current) {
      setFrame(dataUrl);
      setCapturing(false);
    }
    captureResolvers.get(cacheKey)?.();
    captureResolvers.delete(cacheKey);
  };

  if (live) {
    return (
      <div ref={ref} className={`${className} bg-[#0b1120]`}>
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [...cameraPosition], fov }}
          gl={{ antialias: true }}
          onCreated={({ camera }) => camera.lookAt(0, lookAtY, 0)}
        >
          <PreviewAssetLoadContext.Provider value={assetLoads}>
            {children}
          </PreviewAssetLoadContext.Provider>
        </Canvas>
      </div>
    );
  }

  return (
    <div ref={ref} className={`${className} relative bg-[#0b1120]`}>
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-[10px] text-slate-400" role="status">
          <span>{error}</span>
          <span>選択して詳細を確認するか、一覧を開き直してください</span>
        </div>
      ) : frame ? (
        <img
          src={frame}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : capturing ? (
        <Canvas
          key={cacheKey}
          dpr={1}
          camera={{ position: [...cameraPosition], fov }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ camera }) => camera.lookAt(0, lookAtY, 0)}
        >
          <PreviewAssetLoadContext.Provider value={assetLoads}>
            {children}
            <FrameCapture onCaptured={onCaptured} onFailed={onFailed} assetLoads={assetLoads} />
          </PreviewAssetLoadContext.Provider>
        </Canvas>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
          表示待ち
        </div>
      )}
    </div>
  );
}

/** Resolves the queue slot as soon as a card has its frame. */
const captureResolvers = new Map<string, () => void>();

/**
 * Lets the scene run briefly, then hands back one frame.
 *
 * Particle systems start empty; capturing the first frame would show an empty
 * card for every emitter. The wait is what makes the still representative.
 */
function FrameCapture({
  onCaptured,
  onFailed,
  assetLoads,
}: {
  onCaptured: (dataUrl: string) => void;
  onFailed: () => void;
  assetLoads: PreviewAssetLoads;
}) {
  const gl = useThree((state) => state.gl);
  const elapsed = useRef(0);
  const done = useRef(false);

  useFrame((_state, delta) => {
    if (done.current) return;
    if (assetLoads.pending.size > 0 || assetLoads.failed) {
      elapsed.current = 0;
      if (assetLoads.failed) {
        done.current = true;
        onFailed();
      }
      return;
    }
    elapsed.current += delta;
    if (elapsed.current < 0.9) return;
    done.current = true;
    try {
      onCaptured(gl.domElement.toDataURL("image/webp", 0.85));
    } catch {
      onFailed();
    }
  });

  return null;
}
