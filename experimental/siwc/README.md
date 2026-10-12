# ChatGPT × XRift Studio — one-shot world PoC

**Experimental only. Not integrated with the released desktop UI.**

This proof of concept converts one Japanese natural-language request into a structured world plan and executes it with XRift Studio's **existing MCP sidecar**, creating a **new** project.

## Implemented

- Plan up to 32 box / plane / sphere / cylinder / cone entities.
- Call create_project with the blank template; never edit an existing project.
- Set the project title, description, entity positions, scale, names, and rotation.
- Refresh get_editor_context after each write and use current expectedRevision, projectId and sceneId. Stop if the write's revision no longer matches the Editor.
- Wait up to 30 context checks (350ms between checks) for autosave and report `saveStatus` and `saveConfirmed` separately from editing success.
- Attempt capture_scene_view and confirm PNG data from the same project, scene, revision and Edit mode. Report `screenshotReceived` and `screenshotError` separately. A path alone is not image receipt; receipt does not establish visual quality.
- Validate model output against a bounded data schema; never execute model-provided code or arbitrary MCP names.

No world publishing, asset purchases, external asset imports, runtime scripts, materials, or textures.

## Prerequisites

- Node.js 22+.
- XRift Studio desktop open, with its bundled MCP sidecar executable.
- For natural-language mode only, use the **included experimental** SIWC auth client siwc-local.mjs. It is intentionally **not bundled in the shipping app**: this proof of concept stores tokens in a restricted local file but not in a native OS keychain. Production integration requires a security review.
- An eligible ChatGPT account with explicit permission for plan usage.

## Usage

Sign in through the browser once:

    node experimental/siwc/siwc-local.mjs login

Running `login` again reconnects the active account with its saved client ID.
To add a different account, pass `{"newAccount":true}` on stdin to `login`.
The `select` command takes `{"key":"<key from status>"}` on stdin.
World planning pins the selected account; switching accounts between commands fails rather than charging an unintended account.

Credential-changing commands are serialized with `accounts.lock` in the credential directory. A concurrent command fails with a busy error. If a process crashes, remove the lock only after that process has stopped, then reconnect if refresh-token rotation was interrupted. Failed credential writes clean up their temporary file.

This file-based credential store remains experimental. POSIX file modes do not provide Windows ACL or native keychain protection. Use a private credential directory; do not distribute this as production authentication on any OS.

One-command world creation:

    node experimental/siwc/world-once.mjs --name autumn-park-001 --prompt "秋の公園。木とベンチのある静かな広場" --sidecar "/path/to/xrift-studio-mcp-sidecar"

Use --model SLUG to choose an eligible model rather than automatically selecting the first one shown by siwc-local.mjs models.

Without ChatGPT login, author a JSON plan:

    {
      "title": "夜の休憩所",
      "description": "小さな庭",
      "objects": [
        {"name":"地面","shape":"box","position":[0,-0.1,0],"scale":[12,0.2,12]},
        {"name":"焚き火","shape":"cone","position":[0,0.5,0],"scale":[0.8,1,0.8]}
      ]
    }

Save that as plan.json, then run:

    node experimental/siwc/world-once.mjs --name night-plaza-001 --plan-file plan.json --sidecar "/path/to/xrift-studio-mcp-sidecar"

Dry run (no editor changes):

    node experimental/siwc/world-once.mjs --name night-plaza-001 --plan-file plan.json --dry-run true

Choose exactly one of `--prompt` and `--plan-file`. `--dry-run` must be `true` or `false`; duplicate options are rejected. Invalid options and missing/non-executable sidecar paths fail before natural-language inference. A natural-language dry run still uses the selected ChatGPT plan; plan-file dry runs do not make inference requests.

Scale is local, not a world-space bounding box. A horizontal Plane keeps its default rotation of `[-90,0,0]` degrees; its scale is `[width,depth,thickness]`, such as `[12,12,1]` for a square floor. An explicit rotation replaces the default rotation.

Editing success (`ok`) is independent of persistence and capture. `saveConfirmed:false` means saving was not confirmed, even when all writes succeeded. On errors, the project may contain partial changes; no automatic rollback, project deletion or write retry is performed. Inspect the new project before retrying. `create_project` saves and closes any currently open project as part of Studio's normal switching behavior, but this script's authoring writes target only the newly created project.

Tests:

    node --test experimental/siwc/*.test.mjs

The tests include real local CLI subprocesses and a loopback listener, byte-split Japanese/CRLF streams, mocked OAuth rotation/inference, and MCP responses shaped like the Editor contract. They do not establish real OpenAI sign-in, actual scene rendering, screenshot receipt from Studio, or a packaged desktop build. Do not ship this prototype unchanged.

## Follow-up

A fully integrated version should add secure native credential storage, in-app connection and generation UI, PBR/asset/terrain tools, bounded screenshot-guided review and correction, Play validation, and real Windows/macOS/Linux end-to-end tests. Keep existing XRift login separate from ChatGPT login.

Current plan-usage eligibility and documentation:
- https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- https://github.com/WebXR-JP/xrift-studio/blob/main/docs/MCP_EDITOR_TOOLS.md
