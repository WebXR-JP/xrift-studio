# ChatGPT × XRift Studio — one-shot world PoC

**Experimental only. Not integrated with the released desktop UI.**

This proof of concept converts one Japanese natural-language request into a structured world plan and executes it with XRift Studio's **existing MCP sidecar**, creating a **new** project.

## Implemented

- Plan up to 32 box / plane / sphere / cylinder / cone entities.
- Call create_project with the blank template; never edit an existing project.
- Set the project title, description, entity positions, scale, names, and rotation.
- Refresh get_editor_context after each write and use current expectedRevision, projectId and sceneId.
- Attempt capture_scene_view and report saveStatus and screenshot receipt separately.
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

Tests:

    node --test experimental/siwc/*.test.mjs

The tests use mocked MCP calls. They do not establish real sign-in, actual scene rendering, screenshot receipt, or a packaged desktop build. Do not ship this prototype unchanged.

## Follow-up

A fully integrated version should add secure native credential storage, in-app connection and generation UI, PBR/asset/terrain tools, bounded screenshot-guided review and correction, Play validation, and real Windows/macOS/Linux end-to-end tests. Keep existing XRift login separate from ChatGPT login.

Current plan-usage eligibility and documentation:
- https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- https://github.com/WebXR-JP/xrift-studio/blob/main/docs/MCP_EDITOR_TOOLS.md
