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

Write tools require `projectId`, `sceneId`, and `expectedRevision`, exactly like
the other XRift Studio editing tools. This prevents an AI client from applying a
graph mutation to a stale editor snapshot.

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

## Runtime boundary

The Asset, project serialization, and runtime manifest preserve the full
canonical graph. This work unit establishes the authoring and interchange
boundary; it does not claim a complete KHR_interactivity behavior executor.
Runtime adapters are implemented operation by operation and unsupported
operations must remain serialized and behave as a no-op rather than being
translated to arbitrary JavaScript. WebXR controller/input acquisition remains
an application responsibility and is connected to graph events at the runtime
adapter boundary.
