# KHR_interactivity Editor / MCP design

## Goal

XRift Studio stores reusable behavior as a canonical glTF `KHR_interactivity`
extension object. The visual editor, JSON import/export, project persistence, and
MCP tools all edit the same object and use the same validator. React Flow state
is never the portable source of truth.

The editor is a docked modal over the center/right of the Visual Editor. The
left side of Scene View remains visible so animation and object state can be
checked while authoring behavior.

## Saved Asset

`InteractivityAsset` is a document Asset with:

- `extensionName: "KHR_interactivity"`
- `specStatus: "release-candidate-2026-07-16"`
- `extension.graphs`, the canonical Khronos graph data
- optional `extras.xriftStudio.position` per node for authoring layout only

Unknown extension-defined operations are preserved. XRift Studio only adds a
dedicated socket template where it understands the operation; it does not
replace unknown behavior with proprietary event names or JavaScript.

## Validation boundary

Before UI or MCP writes are committed, validation checks:

- default graph, declaration, node, flow, value-source, and type indexes
- the RC type signatures, typed value lengths, JSON scalar kinds, and duplicate types
- inline, type-default, and connected value sources
- value connections point to earlier nodes and flow connections point to later nodes
- nodes require declarations
- core operation names versus extension-defined operation declarations
- bounded graph/node counts for editor safety

Warnings do not destroy or block unknown extension operations. Structural
errors reject the write atomically.

## MCP authoring surface

The built-in `xrift-studio` MCP server exposes:

- `list_interactivity_operations`
- `get_interactivity_asset`
- `create_interactivity_asset`
- `add_interactivity_node`
- `connect_interactivity_nodes`
- `set_interactivity_value`
- `set_interactivity_configuration`
- `disconnect_interactivity_socket`
- `delete_interactivity_node`
- `validate_interactivity_asset`
- `list_interaction_trigger_targets`

Write tools require `projectId`, `sceneId`, and `expectedRevision`, exactly like
the other XRift Studio editing tools. This prevents an AI client from applying a
graph mutation to a stale editor snapshot.

`add_interactivity_node` takes the defining extension from the operation
template when the caller does not name one, exactly as the palette does. An
operation KHR_interactivity does not define is only legal when its declaration
names the extension that does, and a caller who had to supply that name by hand
met a validation failure the Editor never produces.

A typical animation workflow is:

1. Read editor context and operation templates.
2. Create an empty Interactivity Asset.
3. Add `event/onStart` and `animation/start`.
4. Connect `out` to `in` as a flow.
5. Set `animation`, `startTime`, `endTime`, and `speed` inline values or connect
   value-producing nodes.
6. Validate, then read the canonical JSON for review or reuse.

`flow/setDelay` uses the current RC name and socket shape (`in`, `cancel`,
`out`, `err`, `done`, and `lastDelay`). Older private names such as
`flow/delay` are rejected unless an extension explicitly defines them.

With this surface an MCP client can generate reusable animation-start graphs,
delayed sequences, branches, variable and glTF Object Model pointer operations,
or vendor-extension nodes. It can also inspect and repair an existing graph
without replacing its canonical JSON. Higher-level tools such as “play clip 2
after five seconds” can be added as MCP recipes that call these atomic tools;
they do not require a second proprietary graph format.

The MCP boundary deliberately does not accept arbitrary JavaScript, write into
an unknown project revision, or silently keep a mutation that fails validation.

## XRIFT_studio_interaction: interaction triggers

Studio adds one extension of its own, `XRIFT_studio_interaction`, for the
question a graph cannot answer in core KHR terms: what happens when a player
interacts with this Entity, and which Scene Component does it change.

| Operation | Sockets | Configuration |
| --- | --- | --- |
| `xrift/onInteract` | flow `out` | none; the Entity carrying the graph is the source |
| `xrift/setProperty` | flow `in`, `out`, value `value` | `entity`, `component`, `targetKind`, `property` |
| `xrift/toggleProperty` | flow `in`, `out` | the same four, restricted to an ON/OFF property |

Each declaration names the extension, so the graph stays a valid
`KHR_interactivity` document and another tool preserves it as an unknown
operation rather than failing to load it.

The target lives in `configuration` because it is structural — which Entity,
which Component, which property — while the value stays in the `value` socket
where the KHR type system can check it. `targetKind` is stored beside the
Component id so the published runtime, which has no Scene document, can resolve
the write on its own. Enum values (Audio Source playback) are stored as the
option index, because KHR_interactivity has no string type.

### What a trigger can write

`packages/xrift-studio-runtime/src/script/interaction-trigger.ts` holds the
property registry and the parse, and it is the single source of truth for both
surfaces. A property belongs there only when Play and the published world apply
it through the same runtime bridge:

| Target | Properties |
| --- | --- |
| Entity | `enabled` (visibility; physics colliders are unchanged) |
| Transform | `position`, `rotation` (degrees), `scale` |
| Animation | `playing`, `clip`, `speed`, `time` |
| Material | `baseColor`, `emissive`, `emissiveIntensity`, `opacity` |
| Particle | `emitting`, `restart`, `emissionRate`, `sizeMultiplier`, `opacity`, `color` |
| Audio Source | `playback` (play / pause / stop), `volume`, `loop` |
| Light | `enabled`, `intensity`, `color` |
| Scene | `exposure`, `fade`, `fadeColor` |

Entity, Transform, Material and Scene belong to the Entity rather than to a
Component that can appear twice, so they carry no Component id. Scene is
addressed through a reserved Entity id, because it belongs to no Entity at all
and an action still needs something in that slot.

Writes go through the runtime bridges Scripts already own — Audio Source,
Light, Particle, and the Animation bridge added for this — so a trigger and a
Script changing the same Component compose instead of overwriting each other.
Transform and Material have no bridge: they are written onto the object, so the
trigger keeps the first value it saw and restores it on Stop, and a Material is
cloned before it is changed so a shared Asset never leaks the write into another
Entity. Everything a trigger changes is runtime state that Stop discards.

A timed write is the same node: `xrift/setProperty` takes a `duration` value
socket and an `easing` configuration, and a positive duration interpolates
instead of setting. That is what a fade, a dimming light or a moving door is
made of, and it is one node because "move this over two seconds" is one thought.

The curves are a curated set rather than arbitrary beziers — `linear`,
`ease-in`, `ease-out`, `ease-in-out`, `ease-in-strong`, `ease-out-strong`, and
`ease-out-back`, which overshoots and settles. The Inspector offers a duration
only for properties that have a halfway point: a switch or a picked option would
otherwise promise a fade that could only be a jump at the end.

An action whose target is not yet chosen is a warning, not an error: the graph
is saved, the node is preserved, and the Editor, the compiler, and
`validate_interactivity_asset` all report it the same way.

`list_interaction_trigger_targets` returns that registry resolved against the
open Scene: every Entity, the Components on it a trigger can write, and the
property names, kinds, ranges and enum options each one accepts. The node
editor builds its target pickers from the same call, so an MCP client cannot
choose a target the Inspector would refuse to offer — and a property name that
is not on the list produces a graph that validates and then does nothing.

### Attaching a graph

An Interaction Trigger Component holds `interactivityAssetId` and the Entity ids
the graph writes to, mirroring the Script Component split. The interaction
itself comes from the official `Interactable` on the same Entity; without one
the Inspector says so and the compiler warns, because the trigger would never
fire.

`update_component` repoints the Component at another graph through
`patch.interactivityAssetId`; an id that is not an Interactivity Asset is
rejected rather than leaving a trigger pointed at a Material. `entityReferences`
is not in the patch because it is derived, not authored: every graph write —
from the node editor or from an MCP tool — re-reads the action targets and
rewrites the list, so a graph an agent wires up cannot be published with no
dependencies recorded.

In Play, Studio supplies the player's half of the official contract: it
raycasts the Interactables registered through `XRiftProvider` and calls the
`onInteract` the component parked in userData. In a published world the XRift
player does that, and the compiler wires `onInteract` to the same emit. An
Entity a trigger re-shows is emitted even when it is authored disabled, hidden,
so the published world can do what Play does.

Collider-entered triggers are not implemented. Studio Play has no player body
to enter one, so a `onTriggerEnter` operation could not be tested before
publishing, which is the drift this document exists to prevent.

## Runtime boundary

The Asset, project serialization, and runtime manifest preserve the full
canonical graph. Operations are implemented one at a time; an unsupported
operation must remain serialized and behave as a no-op rather than being
translated to arbitrary JavaScript. WebXR controller/input acquisition remains
an application responsibility and is connected to graph events at the host
boundary.

### One engine, two surfaces

`packages/xrift-studio-runtime/src/interactivity/` holds the interpreter, and
it is the single source of truth. It lives in the runtime package because the
Play preview and the published world run from the same graph and must not
drift apart: Studio imports it for Play and for its authoring diagnostics, and
the three.js and React Three Fiber runtimes import it for playback. Studio adds
only the Japanese notes shown in its UI, keyed off the shared classification,
so a newly implemented operation cannot keep reading as unsupported in the
Editor.

The engine keeps the two evaluation directions apart. Values are pulled on
demand, and a cycle among them is a reported error, because a value that
depends on itself has no answer. Flows are pushed from an entry point, and a
cycle among them is a loop, which is how a graph repeats; it is bounded by an
activation budget per frame rather than forbidden by the schema. Waits and
timed changes are scheduled and continued at the moment they come due, so a
chain of one-second waits lands on whole seconds instead of drifting by a frame
on every hop.

Everything the engine changes in the world goes through `InteractivityHost`.
The engine itself knows nothing about three.js, React, or the Scene document,
which is what lets Studio and a published world supply different plumbing under
one contract — and what lets the whole interpreter be exercised without a
renderer.

`dryRunInteractivityGraph` runs a graph forward without a renderer and reports
what happens and when. The Editor uses it for diagnostics, the Model visual
uses it for the clips a graph starts and stops, and the fixtures use it to
assert ordering and timing without a clock. Randomness is seeded, so two runs
of one graph produce the same report.

### What the engine executes

The Editor node badges, the recipe list, the compiler, and
`list_interactivity_operations` all read one table, so an operation can never
look supported on one surface and unsupported on another.

| Group | Support | Notes |
| --- | --- | --- |
| `event/onStart`, `event/onTick`, `event/receive` | executed | Entry points. |
| `event/send` | conditional | Reaches other graphs in the Asset; the Scene-facing notification needs a host. |
| `flow/branch`, `switch`, `sequence`, `setDelay`, `cancelDelay`, `doN`, `multiGate`, `waitAll`, `throttle`, `for`, `while` | executed | Waiting, ordering, repeating and joining. |
| `variable/get`, `set`, `interpolate` | executed | `interpolate` advances every frame and continues on `done`. |
| `math/*`, `type/*`, `ref/eq` | executed | Arithmetic, comparison, logic, vectors and conversions. |
| `animation/start`, `stop`, `stopAt` | conditional | Needs a host that owns the clips. |
| `xrift/onInteract`, `setProperty`, `toggleProperty` | conditional | Needs the graph to be attached to an Entity. |
| `pointer/get`, `set`, `interpolate` | ignored | Implemented in the interpreter; no host resolves a glTF Object Model pointer yet. |
| everything else | ignored | Serialized, never executed. |

Two rules keep the no-op honest:

- **A no-op node produces no flow output.** Execution stops at an unimplemented
  operation rather than continuing as though it had succeeded. Doing otherwise
  is worse than nothing: a graph gated behind a branch would start both sides.
- **An operation classified as unsupported stays unsupported in the UI even
  when the interpreter would run it.** `pointer/*` is the current case: a badge
  that promised a write no host performs would be a lie the author only
  discovers in Play.

`collectInteractivityRuntimeDiagnostics` reports every node the walk refuses to
run, together with the nodes it stopped at while running the graph. The
Editor merges those warnings into the same Diagnostics list as schema
validation, the compiler emits them as `interactivity-operation-not-executed`,
and `validate_interactivity_asset` returns them as `runtimeDiagnostics`
alongside the schema `diagnostics`. They are warnings everywhere: an
unsupported operation is a documented boundary, not a broken graph, and it must
stay in the canonical JSON either way.
