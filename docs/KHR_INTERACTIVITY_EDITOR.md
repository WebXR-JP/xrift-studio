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
- value connections form no cycle; a flow cycle is a loop and is allowed
- nodes require declarations
- core operation names versus extension-defined operation declarations
- bounded graph/node counts for editor safety

Warnings do not destroy or block unknown extension operations. Structural
errors reject the write atomically.

## MCP authoring surface

The built-in `xrift-studio` MCP server exposes:

**Read**

- `list_interactivity_operations` — every operation the palette offers, each with
  its Japanese label and description, its sockets, and whether the Play runtime
  executes it
- `list_interaction_trigger_targets` — every Entity, Component and property an
  action can write to, with kinds, ranges and enum options
- `get_interactivity_asset` — the canonical JSON
- `validate_interactivity_asset` — schema diagnostics and runtime diagnostics
- `simulate_interactivity_asset` — what the graph does, and when

**The graph list**

- `create_interactivity_asset`, `create_model_animation_graph`,
  `update_interactivity_asset`
- `add_interactivity_graph`, `update_interactivity_graph`,
  `delete_interactivity_graph`

**Nodes and wires**

- `add_interactivity_node`, `duplicate_interactivity_node`,
  `delete_interactivity_node`
- `connect_interactivity_nodes`, `disconnect_interactivity_socket`
- `set_interactivity_value`, `set_interactivity_configuration`
- `configure_interactivity_material_pointer`,
  `configure_interactivity_trigger_action`
- `move_interactivity_node`, `layout_interactivity_graph`

Every operation the node editor offers is here. The four the editor keeps to
itself are Undo / Redo, selection, the canvas view (zoom, fit, panel widths) and
the timeline's own range and playhead — none of them change the document.

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
without replacing its canonical JSON.

### Every operation says what it does, as an action

An operation template carries a Japanese `label` and a required `description`,
and both are written as something the node *does*:「ランダムな数を出す」rather
than「乱数」,「指定した秒だけ待つ」rather than「待機」. A noun label names a
concept and leaves the author to guess what dropping it on the canvas would
change, which is the reading cost the palette was charging on every node.

The description is one plain sentence saying when the node runs and what it
leaves behind — including the part that is not visible from the sockets, such
as `flow/setDelay` continuing out of「出力」immediately and out of「完了後」only
after the wait. It appears under the label in the palette, in the Node
Inspector's header while the fields below are being edited, and in the card's
hover text; the palette's search matches it as well as the label and the raw
`op`, so「連打」finds `flow/throttle`. `list_interactivity_operations` returns
it too, so an MCP client chooses on behavior rather than on the shape of a name.

It is a required field rather than an optional one: an operation added to the
palette without a sentence explaining it is a node no author can be expected to
try. When a label changes, the socket hints in `InteractivityNodeCard.tsx` that
quote it by name (「指定した秒だけ待つ」の待機ID) change with it, or the two
tell the author to look for a node that is no longer there.

### Refusing what the canvas cannot draw

A node's sockets are part of its operation's signature, and the runtime reads
only the ones it knows. The canvas can only draw a wire between handles the
operation declares; a socket name invented over MCP saves as valid JSON and then
does nothing at Play, which is the hardest kind of failure to see from the
outside. `connect_interactivity_nodes` and `set_interactivity_value` therefore
refuse a socket the operation does not declare. Operations with no template stay
unchecked, because they are the deliberate escape hatch for extensions this
build does not know.

`configure_interactivity_trigger_action` applies the same rule to an action's
target: the Entity, the Component on it and the property on that target kind all
have to exist, and the value is written with the type the property needs — an
enum by its option id rather than by the index the socket happens to store. The
same call carries the seconds the change takes and the easing curve, and refuses
a duration on a property with no midpoint, because a gradual change the runtime
cannot make is a promise the graph would break.

### One frame is not one instant

A frame can be far longer than 1/60s: a tab returning from the background, a
stall, or a dry run stepping in whole seconds. Inside one, the engine walks to
each moment something happens, in order, rather than to the next pending timer.
That distinction matters because an interpolation finishing mid-frame continues
into new waits, and one of those can be due *before* a timer that was already
pending. Jumping straight to the pending timer ran the later event first and
then set the clock back to run the earlier one — a sequence silently reordering
itself on exactly the frames a player is most likely to notice.

Three neighbouring rules follow from the same principle, that a node's answer
must not depend on how the frame happened to be sliced:

- Restarting `animation/start` replaces that node's pending completion instead
  of stacking a second one, the way a timed write replaces its interpolation. A
  clip retriggered on a loop otherwise leaves a queue of `done` flows that all
  fire later, long after the play they belonged to ended.
- `flow/doN` with an explicit `n` of 0 lets nothing through. Reading the count
  as `n || 1` turned a closed gate into a gate that passes once.
- `flow/switch` with no readable selection takes `default`. An integer cast of
  "nothing" is 0, so an unwired node quietly took the first case instead of the
  fallback the author wired for exactly this.

Two behaviours are deliberate Studio choices rather than readings of the
specification, and are called out here so nobody has to guess from the code:
`flow/waitAll` re-arms itself once it fires `completed`, so it can be used
inside a loop without a `reset` wire; and `flow/multiGate` cycles through the
outputs that are actually connected, so an unconnected socket does not consume
a turn.

### Reading a sequence back

`simulate_interactivity_asset` runs the graph with no renderer and reports the
animation starts and stops, the property writes with the seconds each is spread
over, the events, the logs, the first time each node ran, and the nodes that
were never reached. It is the Editor's timeline as data. Reading the JSON says
what a graph is wired to do; only running it says whether the delay lands where
its author meant, whether a loop terminates inside the horizon, and which branch
is dead. Nothing is written, so it needs no revision.

The recipe catalogue is back in the add panel, under「よく作るもの」, and it is
derived rather than curated: `RUNNABLE_INTERACTIVITY_RECIPES` is
`INTERACTIVITY_RECIPES` filtered by whether the runtime actually executes the
graph the recipe builds. That is the fix for why it was pulled the first time —
nearly all of it was `pointer/*` shapes Play ignores, so it read as a head start
and then did nothing when the world ran. An operation that becomes runnable
brings its recipe back on its own; one that stops being runnable takes its
recipe out before an author can pick it.

The interaction recipes —「押したらテレポートする」「押したら表示を切り替える」
「押したら動かす」— all target something Entity-scoped, because a recipe is built
without a Scene in front of it and cannot know which of an Entity's two Audio
Sources the author meant. `__xrift_self__` covers the Entity, so the same recipe
works on every door without being re-pointed.

### Animation belongs to the graph

v1 removed the Animation Component. It played one clip, and a Model whose
motion is split across dozens of them — gulls, water, a flag — had no way to
say "all of these"; the one choice it offered was the one nobody wanted to
make. A clip is now started by an `animation/start` node, beside the waits and
conditions it runs with.

Three things follow, and they are the whole of the breaking change:

- **Placing an animated Model creates its graph.** It arrives playing, as it
  always has; what plays it is an Asset the author can open and edit.
- **No Component is needed to animate an Entity.** The mixer exists wherever a
  Model has clips and the Scene runs a graph, in Studio Play and in a published
  world alike. `xrift/setProperty` with `targetKind: "animation"` addresses that
  mixer, with an empty component id.
- **Opening a project converts what is left.** `migrateAnimationComponentsToGraphs`
  turns each autoplaying Component into a graph that plays its clip with its
  loop and speed, plus the Trigger that runs it, and removes the Component. It
  runs in `parseVisualProjectFiles`, over Scenes and Prefabs together against
  one manifest, so a Prefab cannot be left animating until it is placed. A
  Component that was not autoplaying is dropped rather than converted: it was a
  handle for another graph to command, and starting it would animate something
  the world never animated.

The document type stays readable — that is what makes the conversion possible —
but nothing authors, renders, publishes or edits it. `update_component` refuses
one with `COMPONENT_REMOVED`; `remove_component` still works, because that is
the way out.

### Generating a graph from a Model's clips

`create_model_animation_graph` builds `event/onStart` → `flow/sequence` →
one `animation/start` per clip, and is the same thing the Model Inspector's
button does. It exists because the Animation Component plays one clip, and a
Model whose motion is spread over sixty-four of them cannot say "play them all"
any other way: by hand that is one node and three inline values per clip.

Three decisions are worth stating, because a caller cannot infer them:

- **No `endTime`.** An unbounded `animation/start` runs until something stops
  it, which the mixer surfaces as a loop. Ambient motion — gulls, water, a flag
  — has no moment it should stop at, and making every generated node carry an
  end time would mean editing sixty-four of them to get there.
- **Grouped fan-out.** A flow output reaches one node, so the fan-out is
  `flow/sequence`; its outputs are numbered and the spec runs whatever is
  connected, so nothing limits it to the three the template declares. They are
  grouped eight at a time anyway: one card with sixty-four sockets is taller
  than the canvas, and every edge in the graph would leave the same point.
- **Not attached.** The tool creates the Asset and stops. Which Entity carries
  it is a placement decision, and folding sixty-four generated nodes and a
  Component addition into one undo step makes both harder to take back.

The clip's name is written to `extras.xriftStudio.clipName` and shown on the
card. Nothing reads it at runtime — `animation/start` addresses a clip by index
— so a graph whose extras were stripped still plays; without it the canvas is a
column of identical cards.

### Layout is part of the handover

`move_interactivity_node` and `layout_interactivity_graph` exist because a graph
an agent builds is opened by a person. Without them every MCP-authored graph
arrives as a stack of cards on the same spot, and the author's first act is to
press the align button. `layout_interactivity_graph` produces exactly the
arrangement that button does.

The MCP boundary deliberately does not accept arbitrary JavaScript, write into
an unknown project revision, or silently keep a mutation that fails validation.

## XRIFT_studio_interaction: interaction triggers

Studio adds one extension of its own, `XRIFT_studio_interaction`, for the
question a graph cannot answer in core KHR terms: what happens when a player
interacts with this Entity, and which Scene Component does it change.

| Operation | Sockets | Configuration |
| --- | --- | --- |
| `xrift/onInteract` | flow `out` | none; the Entity carrying the graph is the source |
| `xrift/setProperty` | flow `in`, `out`, `done`, value `value`, `duration` | `entity`, `component`, `targetKind`, `property`, `easing`, and `asset` or `text` for the two kinds whose value is not a number |
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
| Text | `enabled`, `text`, `color`, `fontSize`, `fontWeight`, `fontId`, `textAlign`, `lineHeight`, `letterSpacing`, `maxWidth`, `outlineWidth`, `outlineColor` |
| Scene | `exposure`, `fade`, `fadeColor`, `postprocessing`, `bloom` (+`bloomStrength`, `bloomRadius`, `bloomThreshold`), `ao`, `grading`, `fog` (+`fogColor`, `fogNear`, `fogFar`), `ambient` (+`ambientColor`, `ambientIntensity`), `skybox`, `skyboxIbl`, `skyboxExposure`, `skyboxRotation`, `skyboxImage`, `cameraFov` |
| Player | `teleport` |

Entity, Transform, Material, Scene and Player belong to the Entity rather than
to a Component that can appear twice, so they carry no Component id. Scene and
Player are addressed through reserved Entity ids, because they belong to no
Entity at all and an action still needs something in that slot.

### A value can come from the graph

An action's `value` socket takes a literal, or a wire. The static walk that
derives dependencies and drives the Editor's diagnostics has no expression
evaluator, so it cannot say what a wired socket will produce - but the
interpreter can, and does: it evaluates the socket and hands the applier a
concrete value.

The walk therefore records a wired socket as `{ kind: "linked" }` rather than
dropping the action. Dropping it was the old behaviour, and it cost two things
that have nothing to do with the value: the Editor called a fully configured
node unfinished, and the Component lost the `entityReferences` and
`assetReferences` the action plainly names - so a compiler could publish a world
whose trigger writes to an Entity it never emitted.

This is what makes a computed value usable at all: `variable/get`, `math/add`
and the rest run in the interpreter, and a wire from one of them into an action
is now a finished graph rather than a broken one.

### The Player target moves whoever pressed the button

`teleport` takes the position the player's feet land on, exactly as a
SpawnPoint does, and is applied instantly — there is no duration on a trigger
action, so「ゆっくり移動する」is not what this is.

**It moves the player and leaves the SpawnPoint alone.** Falling out of the
world still returns to the Scene's SpawnPoint rather than to wherever the last
teleport put someone: a teleport into a pit has to be recoverable, not a loop.
Routing teleport through `setSpawnPoint` — which the player already watches —
would have been less code and would have made that impossible.

Like Scene, it is **client-local**: a graph runs inside each viewer's own
runtime, so a teleport button moves whoever pressed it and nobody else.

Both output modes run the graph. Runtime JSON used to refuse a Scene with a
trigger - the manifest could carry the graph, and nothing on the runtime side
read it, so a published world's buttons would have gone quiet. The manifest now
inlines the graph on an `interaction-trigger` component and
`XriftRuntimeInteractionTriggers` runs it through the same component Studio's
Play uses, mounting the Scene and player bridges alongside. Scripts are still
blocked in Runtime JSON, and for a different reason: a graph is data the
interpreter walks, and a Script is source that has to be evaluated.

Play and the published world reach the player through the same bridge
(`player-runtime.ts` for the contract, `player-runtime-host.tsx` for the
component that fills it in), and both fill it from `useTeleport()`. In a
published world that is xrift-frontend's implementation; in Play it is the
Studio player's, which moves the official `PhysicsPlayer`'s capsule directly.
The one place it does **not** work is a generated project's own `npm run dev`:
`DevEnvironment` leaves `useTeleport()` at the package's `console.log`
placeholder, so a teleport there logs and does nothing.

### Who sees an action

A trigger graph runs inside the runtime of whoever pressed the button. The
interaction bus is a module in that person's page and nothing it does crosses
the network, so **every action today reaches one viewer**. Two very different
things were hiding under that one fact, and the registry now separates them:

| Scope | Targets | What it means |
| --- | --- | --- |
| `viewer`「この端末だけ」 | Scene, Player | One viewer is the right answer and always will be |
| `world`「押した人だけ」 | Entity, Transform, Animation, Material, Particle, Audio Source, Light, Text | World content everyone should be seeing, **not synchronised yet** |

The first is a design: synchronising the picture would decide for the person on
the slowest headset, and synchronising a teleport would move somebody who
pressed nothing. The second is a gap. A door that opens for one person is a
different feature from a door that opens, and an author cannot discover which
one they built alone in the editor - it takes a second person in the room.

So the scope is part of the sentence the Editor shows for every action, and the
property picker carries the note under it. `getXriftInteractionScope` derives it
from the target, and a fixture asserts every property lands in the half its
target belongs to, so a new target cannot arrive without an answer.

A `world`-scoped action can be marked「みんなに見せる」, which is what makes that
half real rather than only honest. See below.

### Sharing an action with the room

XRift already synchronises state: `useInstanceState(stateId, initial)` is a
`useState` the platform keeps in step across the instance over its own socket,
and its `states` map holds what the room currently agrees on. Nothing here
invents a protocol on top of that.

A `world`-scoped action carries `configuration.shared`. When it is set:

* the action is applied locally **and** broadcast, so the person who pressed
  does not wait for a round trip to see their own button work;
* every runtime in the room applies what arrives, through the applier rather
  than by re-running the graph - replaying the flow would fire everything else
  it does, a sound and a delay and a second write, once per person;
* a runtime that joins later applies everything already in `states`, which is
  why the value travels as state and not as an event. A door opened before
  somebody arrived is still open when they walk in.

Three answers fall out of using the platform's own mechanism rather than
designing one:

| Question | Answer |
| --- | --- |
| Who wins | The last press. `sendState` overwrites the id |
| What about the delay | The presser applies immediately; the broadcast is what everyone converges on |
| What does a late joiner see | The current value, applied on mount from `states` |

The id is derived from what the action is - the resolved Entity, the Component,
the target and the property - so every viewer computes the same one without
agreeing on anything first. Two actions writing the same property of the same
Component deliberately collide: they are the same shared fact, and the last
press wins for everyone.

The flag is refused on a `viewer`-scoped property. Synchronising the picture
would decide for the person on the slowest headset, and synchronising a teleport
would move somebody who pressed nothing.

In Studio there is one viewer and the package's default implementation is a
local Map, so a shared action behaves like a local one. The same send and the
same receive run - the room is simply a room of one.

### The Scene target is this viewer's, and only this viewer's

Everything under `Scene` is **client-local**. A graph runs inside each viewer's
own runtime, so the write lands on that viewer's renderer and reaches nobody
else. That is the point rather than a limitation: post effects are a Scene
setting, so switching them on used to mean switching them on for the person on
the slowest headset too, and an author's only options were「品質を上げる」or
「いちばん重い端末に合わせて諦める」. A world can now put a「画質を上げる」button
in the room and let each person answer for their own device.

Nothing here is synchronised and nothing is saved. Stop, and re-entry, put the
Scene settings back — the same contract every other runtime override keeps.

The set deliberately mirrors the Scene Settings panel rather than a hand-picked
subset, because「設定にあるのにグラフから触れない」is the shape of the original
complaint. The Editor-only rows are the exception: the gizmo, the grid and the
editor background are not part of what a viewer sees.

`skyboxImage`, `skyboxExposure` and `skyboxRotation` act on the background and
on image-based lighting. A swapped image replaces a gradient, Box, Dome or Sky
Shader sky as well, because those are meshes rather than `scene.background`;
they carry `userData.xriftSceneSkybox` so the runtime can find them, and the
three surfaces that build a sky all set it.

`ambient` turns on an ambient light the runtime owns when the Scene has none,
so「明るくする」does not quietly fail on exactly the Scenes whose 環境光 is off.

The post effect **layer order** (`postprocessing.order`) is the one visible
Scene row with no viewer override, and deliberately. Every other row here
answers「この端末でどこまで描くか」, which is each viewer's own question; the
order answers「どんな絵にするか」, which is the author's, and a viewer who
reorders the passes does not get a lighter frame, only a different look than
the world was tuned for. It is also not a quantity: `KHR_interactivity` has no
string type, so an order would have to travel as `configuration` the way an
Asset id does, with no duration to interpolate over. Turning a layer off stays
available — that is `bloom`, `ao` and `grading` — so「画質を上げる」still costs
what it should on the device that asked for it.

### A value that is not a number

`asset` and `string` properties store their value in `configuration`, beside
the Entity and Component ids, rather than in the `value` socket. Two reasons,
and both are the same reason the target lives there: `KHR_interactivity` has no
string type, and neither an Asset id nor a sentence is a quantity to
interpolate toward. A duration on one of them is not honoured — half of an
Asset is nothing, and half of「開いています」is not a word.

They reach the host as `writeAsset` and `writeString`, which are separate
because the obligations differ: an Asset id names something the published world
has to carry, a string names nothing at all. The Interaction Trigger Component
records the Asset ids its graph can reach in `assetReferences`, derived from
the graph exactly as `entityReferences` is, and that is what makes the compiler
publish a sky image nothing in the Scene document mentions.

Both derived lists are read from **every** action node rather than by walking
forward from `xrift/onInteract`: a graph that starts itself on `event/onStart`,
or one behind `event/receive`, still needs its Assets published.

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

The node has two flow outputs because the two questions are different. `out`
continues as soon as the change starts, which is how several things move at
once; `done` continues when it has finished, which is how one thing follows
another. A write with no duration finishes immediately and takes both, so a
sequence built through `done` does not stall the day its author sets the
duration back to zero.

An overshooting curve returns a ratio above 1 on purpose, and the blend is not
clamped, so「少し行き過ぎて戻る」really passes its target. What keeps that from
leaving a property outside its range is the write itself: a value is clamped to
the range the property declares as it is applied, which is the same protection
a hand-typed value needs.

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
| `xrift/onInteract`, `setProperty`, `toggleProperty` | conditional | Needs the graph to be attached to an Entity. Scene writes also need the Scene bridge, which a published world carries whenever it carries behavior. |
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
