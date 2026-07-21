# OpenBrush brush library

The base `brushes/` directory is copied from
[`icosa-foundation/three-icosa-template`](https://github.com/icosa-foundation/three-icosa-template)
at commit `b118ec1d68f09479b37f0cb83f3fa3af69e05b38`.
Additional files that do not exist in that template are layered from
[`icosa-foundation/three-icosa`](https://github.com/icosa-foundation/three-icosa)
at commit `18682538402ecf8470c4eee91f817ca6093acfa2`. Template files take
precedence because their shared fog and surface includes are expanded for the
pinned loader.

Together they contain the official GLSL and texture resources available for
three-icosa to recreate Open Brush materials. The npm package intentionally
does not include this directory, so XRift Studio pins a local copy for
deterministic, offline editor previews. If a preset referenced by the package
has no published shader resource, or a resource cannot be compiled, the editor
keeps the glTF PBR material instead of failing the whole Model import.

The files are distributed under the Apache License 2.0. See [`LICENSE`](./LICENSE).
