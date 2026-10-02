/** Stateless document transformations. No project storage or user identity headers. */
import { createPrototypeProject } from '../../src/lib/visual-editor/prototype-project';
import { executeXriftMcpEditorTool } from '../../src/lib/visual-editor/mcp-editor-tools';
import type { XriftMcpEditorToolName } from '../../src/lib/visual-editor/mcp-tool-registry';
import { validateBundle, bundleHash } from '../../src/lib/visual-editor/chatgpt-project';
import documentTools from './document-tools.json';
import { studioProjectRoute, validateStudioProjectId } from '../../src/lib/browser-project-routing';
export interface Environment { ASSETS: { fetch(request: Request): Promise<Response> } }
const MAX_BYTES = 1024 * 1024;
// Streamable HTTP clients must receive their supported revision when we implement it.
const MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'] as const;
const negotiateProtocolVersion = (requested: unknown): string =>
  typeof requested === 'string' && MCP_PROTOCOL_VERSIONS.some(version => version === requested)
    ? requested : MCP_PROTOCOL_VERSIONS[MCP_PROTOCOL_VERSIONS.length - 1];
const UI_URI = 'ui://xrift-studio/worlds-v17';
const LEGACY_UI_URIS = ['ui://xrift-studio/worlds-v16', 'ui://xrift-studio/worlds-v15', 'ui://xrift-studio/worlds-v14', 'ui://xrift-studio/worlds-v13', 'ui://xrift-studio/worlds-v12', 'ui://xrift-studio/worlds-v11', 'ui://xrift-studio/worlds-v10', 'ui://xrift-studio/worlds-v9', 'ui://xrift-studio/worlds-v8', 'ui://xrift-studio/worlds-v7', 'ui://xrift-studio/worlds-v6', 'ui://xrift-studio/worlds-v5', 'ui://xrift-studio/worlds-v3', 'ui://xrift-studio/worlds-v4'];
const names = documentTools.map((tool) => tool.name);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSONオブジェクトで指定してください');
  return value as Record<string, unknown>;
};
const string = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('空でない文字列で指定してください');
  return value;
};
const operationId = (value: unknown): string => {
  const id = string(value);
  if (!/^[A-Za-z0-9-]{1,120}$/.test(id)) throw new Error('操作IDが不正です');
  return id;
};
const icons = [{ src: 'data:image/svg+xml;base64,' + btoa("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"brand\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#a78bfa\"/><stop offset=\".4\" stop-color=\"#8b5cf6\"/><stop offset=\".8\" stop-color=\"#6366f1\"/><stop offset=\"1\" stop-color=\"#3b82f6\"/></linearGradient></defs><rect width=\"512\" height=\"512\" rx=\"112\" fill=\"url(#brand)\"/><path d=\"m189.5 189.5 133 133m0-133-133 133\" fill=\"none\" stroke=\"#fff\" stroke-width=\"33.3\" stroke-linecap=\"round\"/></svg>"), mimeType: 'image/svg+xml', sizes: ['any'] }];
const deliveryDescription = "Editor startup is not required for document edits. Internally carry the latest complete bundle, revision, projectId, operationId and baseHash from the previous tool result in this conversation. Pass bundle and revision to edit_world without asking the user to copy JSON. Continue create_world -> edit_world without waiting for UI receipts or PNGs. After editing, call open_studio or capture_scene_view with the latest result to display it once. Sites stores no projects or assets. Conversation data is not proof of browser saving or display. Report document editing, browser saving, Studio display and image capture separately. Claim displayed only after a matching studioDelivery receipt; claim image confirmation only after inspecting a real PNG. Retry the original complete result without rerunning edits or overwriting later work.";
async function delivery(bundle: ReturnType<typeof validateBundle>, revision: number, baseHash: string | null, operationId: string = crypto.randomUUID()) {
  return { bundle, revision, baseHash, operationId, projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId,
    editorUrl: `https://chatgpt.com/plugins/plugin_asdk_app_sites_a7e0e2c988c08191aa694d396a182112/app/open_studio?path=${encodeURIComponent(studioProjectRoute(bundle.project.projectId))}`,
    delivery: { status: 'awaiting_studio_verification', projectId: bundle.project.projectId, revision, hash: await bundleHash(bundle), documentEdited: true, serverSaved: false, browserSaved: false, rendered: false, captureStatus: 'not_requested' } };
}
class DocumentBatchError extends Error {
  constructor(message: string, readonly recovery: Record<string, unknown>) { super(message); }
}
// Tool callers must carry the complete document envelope, including empty prefabs.
const bundleInputSchema = {
  type: 'object',
  description: 'Copy the complete bundle from the latest create_world, edit_world, retry_world or actual Editor context result. Keep project, scene, assets and prefabs unchanged; prefabs is an object keyed by prefab ID, including {} when empty. Never replace or omit document sections.',
  properties: {
    project: { type: 'object' },
    scene: { type: 'object' },
    assets: { type: 'object' },
    prefabs: { type: 'object', additionalProperties: { type: 'object' } },
  },
  required: ['project', 'scene', 'assets', 'prefabs'],
  additionalProperties: false,
};
const tools = [
  {
    "name": "open_studio",
    "description": "Show the shared Studio Editor. To display the conversation project, automatically carry bundle, revision, operationId and baseHash from the latest result. No arguments starts a new saved project; mode resume shows the local library. projectId alone opens a project already saved in the same browser. IDs are not server retrieval keys. Show the final result once rather than opening each intermediate edit. Editor startup is not required for document edits. Internally carry the latest complete bundle, revision, projectId, operationId and baseHash from the previous tool result in this conversation. Pass bundle and revision to edit_world without asking the user to copy JSON. Continue create_world -> edit_world without waiting for UI receipts or PNGs. After editing, call open_studio or capture_scene_view with the latest result to display it once. Sites stores no projects or assets. Conversation data is not proof of browser saving or display. Report document editing, browser saving, Studio display and image capture separately. Claim displayed only after a matching studioDelivery receipt; claim image confirmation only after inspecting a real PNG. Retry the original complete result without rerunning edits or overwriting later work.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bundle": bundleInputSchema,
        "revision": {
          "type": "integer",
          "minimum": 0
        },
        "baseHash": {
          "type": [
            "string",
            "null"
          ]
        },
        "operationId": {
          "type": "string"
        },
        "projectId": {
          "type": "string",
          "pattern": "^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$"
        },
        "mode": {
          "type": "string",
          "enum": [
            "new",
            "resume"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "_meta": {
      "ui": {
        "resourceUri": "ui://xrift-studio/worlds-v17"
      },
      "openai/ui": {
        "entrypoints": [
          {
            "type": "global"
          }
        ]
      }
    },
    "title": "XRift Studio"
  },
  {
    "name": "capture_scene_view",
    "description": "Show and capture the latest conversation result by passing its bundle, revision, baseHash and operationId internally. The app imports it into the common browser store before capture. With no bundle, capture the existing open view. A real renderer in an MCP Apps-capable host is required; no server rendering. Await a matching sceneCapture.operationId and PNG before claiming image confirmation. Failure does not prevent further document editing.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bundle": bundleInputSchema,
        "revision": {
          "type": "integer",
          "minimum": 0
        },
        "baseHash": {
          "type": [
            "string",
            "null"
          ]
        },
        "operationId": {
          "type": "string"
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "_meta": {
      "ui": {
        "resourceUri": "ui://xrift-studio/worlds-v17"
      }
    }
  },
  {
    "name": "get_editor_context",
    "description": "Read actual browser Editor context or local operation status. A null activeProjectId does not block creation or editing with the conversation bundle. Existing manual edits need the latest bundle returned from the app. An unavailable app cannot confirm local state; do not make this call a prerequisite for new conversation creation.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "_meta": {
      "ui": {
        "resourceUri": "ui://xrift-studio/worlds-v17"
      }
    }
  },
  {
    "name": "get_operation_status",
    "description": "Read actual browser Editor context or local operation status. A null activeProjectId does not block creation or editing with the conversation bundle. Existing manual edits need the latest bundle returned from the app. An unavailable app cannot confirm local state; do not make this call a prerequisite for new conversation creation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "operationId": {
          "type": "string"
        }
      },
      "required": [
        "operationId"
      ],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "_meta": {
      "ui": {
        "resourceUri": "ui://xrift-studio/worlds-v17"
      }
    }
  },
  {
    "name": "describe_document_tool",
    "description": "Read the original Studio inputSchema before adding an edit operation. The transformer supplies projectId, sceneId and expectedRevision per operation.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "tool": {
          "type": "string",
          "enum": [
            "get_editor_context",
            "get_project_health",
            "analyze_performance",
            "get_scripting_capabilities",
            "analyze_component_code",
            "apply_component_code_import_plan",
            "list_assets",
            "update_project_metadata",
            "create_asset_folder",
            "rename_asset",
            "rename_asset_folder",
            "move_asset",
            "move_asset_folder",
            "detach_asset_references",
            "delete_asset",
            "delete_asset_folder",
            "set_mesh_collision",
            "inspect_colliders",
            "optimize_colliders",
            "get_audio_asset",
            "get_model_asset",
            "get_texture_asset",
            "update_model_asset",
            "create_document_asset",
            "get_particle_asset",
            "update_particle_asset",
            "update_scene_settings",
            "place_asset",
            "list_entities",
            "list_component_definitions",
            "get_entity_components",
            "get_entity_bounds",
            "create_primitive",
            "get_terrain",
            "sample_terrain_point",
            "list_terrain_presets",
            "create_terrain_from_preset",
            "apply_terrain_surface",
            "create_terrain",
            "sculpt_terrain",
            "update_terrain",
            "list_terrain_grass_types",
            "apply_terrain_grass_preset",
            "delete_terrain_grass_layer",
            "paint_terrain_grass",
            "list_scene_recipes",
            "place_builtin_prefab",
            "create_prefab",
            "add_component",
            "update_component",
            "remove_component",
            "set_entity_enabled",
            "update_script_component",
            "update_transform",
            "set_material",
            "get_material_asset",
            "list_material_presets",
            "create_material_from_preset",
            "create_custom_shader",
            "get_custom_shader",
            "update_custom_shader",
            "set_material_texture_transform",
            "rename_entity",
            "duplicate_entity",
            "reparent_entity",
            "delete_entity",
            "create_empty_entity",
            "list_interactivity_operations",
            "list_interactivity_recipes",
            "apply_interactivity_recipe",
            "get_interactivity_asset",
            "create_interactivity_asset",
            "create_model_animation_graph",
            "add_interactivity_node",
            "connect_interactivity_nodes",
            "set_interactivity_value",
            "set_interactivity_configuration",
            "configure_interactivity_material_pointer",
            "disconnect_interactivity_socket",
            "delete_interactivity_node",
            "validate_interactivity_asset",
            "update_interactivity_asset",
            "simulate_interactivity_asset",
            "add_interactivity_graph",
            "update_interactivity_graph",
            "delete_interactivity_graph",
            "move_interactivity_node",
            "duplicate_interactivity_node",
            "layout_interactivity_graph",
            "configure_interactivity_trigger_action",
            "list_interaction_trigger_targets"
          ]
        }
      },
      "required": [
        "tool"
      ],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": true,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "create_world",
    "description": "Create a new conversation project even when no Editor is open or activeProjectId is null. Omitted name creates a new world. Returns the full bundle and revision for immediate editing. Does not open a view or save to Sites. After editing, display the latest result with open_studio or capture_scene_view. Editor startup is not required for document edits. Internally carry the latest complete bundle, revision, projectId, operationId and baseHash from the previous tool result in this conversation. Pass bundle and revision to edit_world without asking the user to copy JSON. Continue create_world -> edit_world without waiting for UI receipts or PNGs. After editing, call open_studio or capture_scene_view with the latest result to display it once. Sites stores no projects or assets. Conversation data is not proof of browser saving or display. Report document editing, browser saving, Studio display and image capture separately. Claim displayed only after a matching studioDelivery receipt; claim image confirmation only after inspecting a real PNG. Retry the original complete result without rerunning edits or overwriting later work.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        }
      },
      "required": [],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "edit_world",
    "description": "Edit the latest conversation project without opening the Editor. Automatically carry bundle and revision from the previous create_world/edit_world or actual manual-editor context. Keep projectId stable and use expectedRevision to guard conflicts. Up to 200 original Studio operations in order; ref on creation and $ref in later arguments. Each operation advances internal revision but the batch advances the result revision once. Errors discard partial results. No source-file bytes, script execution or publication. Return the complete next bundle without opening a view. Editor startup is not required for document edits. Internally carry the latest complete bundle, revision, projectId, operationId and baseHash from the previous tool result in this conversation. Pass bundle and revision to edit_world without asking the user to copy JSON. Continue create_world -> edit_world without waiting for UI receipts or PNGs. After editing, call open_studio or capture_scene_view with the latest result to display it once. Sites stores no projects or assets. Conversation data is not proof of browser saving or display. Report document editing, browser saving, Studio display and image capture separately. Claim displayed only after a matching studioDelivery receipt; claim image confirmation only after inspecting a real PNG. Retry the original complete result without rerunning edits or overwriting later work.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bundle": bundleInputSchema,
        "revision": {
          "type": "integer",
          "minimum": 0
        },
        "projectId": {
          "type": "string"
        },
        "expectedRevision": {
          "type": "integer",
          "minimum": 0
        },
        "operations": {
          "type": "array",
          "minItems": 1,
          "maxItems": 200,
          "items": {
            "type": "object",
            "properties": {
              "tool": {
                "type": "string",
                "enum": [
                  "get_editor_context",
                  "get_project_health",
                  "analyze_performance",
                  "get_scripting_capabilities",
                  "analyze_component_code",
                  "apply_component_code_import_plan",
                  "list_assets",
                  "update_project_metadata",
                  "create_asset_folder",
                  "rename_asset",
                  "rename_asset_folder",
                  "move_asset",
                  "move_asset_folder",
                  "detach_asset_references",
                  "delete_asset",
                  "delete_asset_folder",
                  "set_mesh_collision",
                  "inspect_colliders",
                  "optimize_colliders",
                  "get_audio_asset",
                  "get_model_asset",
                  "get_texture_asset",
                  "update_model_asset",
                  "create_document_asset",
                  "get_particle_asset",
                  "update_particle_asset",
                  "update_scene_settings",
                  "place_asset",
                  "list_entities",
                  "list_component_definitions",
                  "get_entity_components",
                  "get_entity_bounds",
                  "create_primitive",
                  "get_terrain",
                  "sample_terrain_point",
                  "list_terrain_presets",
                  "create_terrain_from_preset",
                  "apply_terrain_surface",
                  "create_terrain",
                  "sculpt_terrain",
                  "update_terrain",
                  "list_terrain_grass_types",
                  "apply_terrain_grass_preset",
                  "delete_terrain_grass_layer",
                  "paint_terrain_grass",
                  "list_scene_recipes",
                  "place_builtin_prefab",
                  "create_prefab",
                  "add_component",
                  "update_component",
                  "remove_component",
                  "set_entity_enabled",
                  "update_script_component",
                  "update_transform",
                  "set_material",
                  "get_material_asset",
                  "list_material_presets",
                  "create_material_from_preset",
                  "create_custom_shader",
                  "get_custom_shader",
                  "update_custom_shader",
                  "set_material_texture_transform",
                  "rename_entity",
                  "duplicate_entity",
                  "reparent_entity",
                  "delete_entity",
                  "create_empty_entity",
                  "list_interactivity_operations",
                  "list_interactivity_recipes",
                  "apply_interactivity_recipe",
                  "get_interactivity_asset",
                  "create_interactivity_asset",
                  "create_model_animation_graph",
                  "add_interactivity_node",
                  "connect_interactivity_nodes",
                  "set_interactivity_value",
                  "set_interactivity_configuration",
                  "configure_interactivity_material_pointer",
                  "disconnect_interactivity_socket",
                  "delete_interactivity_node",
                  "validate_interactivity_asset",
                  "update_interactivity_asset",
                  "simulate_interactivity_asset",
                  "add_interactivity_graph",
                  "update_interactivity_graph",
                  "delete_interactivity_graph",
                  "move_interactivity_node",
                  "duplicate_interactivity_node",
                  "layout_interactivity_graph",
                  "configure_interactivity_trigger_action",
                  "list_interaction_trigger_targets"
                ]
              },
              "arguments": {
                "type": "object",
                "description": "Use the exact inputSchema from describe_document_tool. Do not guess property names. create_primitive requires shape. Refer to newly created IDs with $ref in subsequent operations."
              },
              "ref": {
                "type": "string",
                "pattern": "^[A-Za-z][A-Za-z0-9_]{0,63}$"
              }
            },
            "required": [
              "tool",
              "arguments"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "bundle",
        "revision",
        "operations"
      ],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "openWorldHint": false
    }
  },
  {
    "name": "retry_world",
    "description": "Restore the same conversation result without re-executing changes. Automatically pass original operationId, bundle, revision and baseHash. No server storage. Preserve later work when retrying an older operation. The browser may additionally recover a known operation locally. Editor startup is not required for document edits. Internally carry the latest complete bundle, revision, projectId, operationId and baseHash from the previous tool result in this conversation. Pass bundle and revision to edit_world without asking the user to copy JSON. Continue create_world -> edit_world without waiting for UI receipts or PNGs. After editing, call open_studio or capture_scene_view with the latest result to display it once. Sites stores no projects or assets. Conversation data is not proof of browser saving or display. Report document editing, browser saving, Studio display and image capture separately. Claim displayed only after a matching studioDelivery receipt; claim image confirmation only after inspecting a real PNG. Retry the original complete result without rerunning edits or overwriting later work.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "bundle": bundleInputSchema,
        "revision": {
          "type": "integer",
          "minimum": 0
        },
        "baseHash": {
          "type": [
            "string",
            "null"
          ]
        },
        "operationId": {
          "type": "string"
        }
      },
      "required": [
        "operationId",
        "bundle",
        "revision",
        "baseHash"
      ],
      "additionalProperties": false
    },
    "annotations": {
      "readOnlyHint": false,
      "destructiveHint": false,
      "openWorldHint": false
    },
    "_meta": {
      "ui": {
        "resourceUri": "ui://xrift-studio/worlds-v17"
      }
    }
  }
].map(tool => {
  // Sites authenticates MCP requests before dispatching them to this Worker.
  const securitySchemes = [{ type: 'oauth2', scopes: ['openid', 'resource.invoke', 'email'] }];
  return { ...tool, icons, securitySchemes, _meta: { ...tool._meta, securitySchemes } };
});
export async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  if (name === 'open_studio') {
    if (args.bundle) {
      if (!Number.isSafeInteger(args.revision) || Number(args.revision) < 0) throw new Error('revisionが不正です');
      const bundle = validateBundle(args.bundle);
      if (args.projectId !== undefined && args.projectId !== bundle.project.projectId) throw new Error('project_conflict: 表示対象が一致しません');
      return delivery(bundle, args.revision as number, typeof args.baseHash === 'string' ? args.baseHash : null, typeof args.operationId === 'string' ? args.operationId : undefined);
    }
    if (args.mode !== undefined && args.mode !== 'new' && args.mode !== 'resume') throw new Error('起動方法が不正です');
    if (args.mode === 'new' && args.projectId !== undefined) throw new Error('新規作成と既存作品の指定を同時に使えません');
    if (args.projectId !== undefined) return { studioCommand: { name: 'open_project', projectId: validateStudioProjectId(string(args.projectId)), requestId: crypto.randomUUID() }, delivery: { status: 'awaiting_studio_verification' } };
    if (args.mode === 'new') return callTool('create_world', { name: args.name });
    return { localProjects: true, launch: args.mode === 'resume' ? 'resume' : 'new', delivery: { status: 'studio_connection_unverified' } };
  }
  if (name === 'capture_scene_view') {
    if (args.bundle) return { ...await callTool('open_studio', args), captureSceneView: true };
    return { captureSceneView: true, operationId: crypto.randomUUID(), delivery: { status: 'awaiting_studio_verification' } };
  }
  if (name === 'get_editor_context' || name === 'get_operation_status') {
    const allowed = name === 'get_operation_status' ? ['operationId'] : [];
    if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error('未対応の引数が含まれています');
    return { studioCommand: { name, ...(name === 'get_operation_status' ? { operationId: operationId(args.operationId) } : {}), requestId: crypto.randomUUID() }, delivery: { status: 'awaiting_studio_verification' } };
  }
  if ((name === 'edit_world' || name === 'retry_world') && !args.bundle) {
    if (name === 'edit_world' && (!Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 200)) throw new Error('編集操作は1〜200個で指定してください');
    if (name === 'edit_world') throw new Error('conversation_state_required: 会話内の直前のcreate_worldまたはedit_worldのbundleとrevisionを内部で引き継いでください。Editorを開く必要はありません。利用者にJSONの再提示を求めないでください。');
    return { studioCommand: { name: 'retry_world', operationId: operationId(args.operationId) }, delivery: { status: 'awaiting_studio_verification' } };
  }
  if (name === 'describe_document_tool') {
    const definition = documentTools.find(tool => tool.name === args.tool);
    if (!definition) throw new Error('Unknown document tool');
    return { definition };
  }
  if (name === 'create_world') {
    const name = args.name === undefined ? '新しいワールド' : string(args.name).trim();
    if (name.length > 80) throw new Error('名前は80文字までです');
    return delivery(createPrototypeProject('world', name), 0, null);
  }
  if (name === 'retry_world') {
    const id = operationId(args.operationId);
    if (!Number.isSafeInteger(args.revision) || (args.revision as number) < 0 || !(args.baseHash === null || typeof args.baseHash === 'string')) throw new Error('再送する結果が不正です');
    return delivery(validateBundle(args.bundle), args.revision as number, args.baseHash as string | null, id);
  }
  if (name !== 'edit_world') throw new Error('Unknown tool');
  let bundle = validateBundle(args.bundle);
  if (args.projectId !== undefined && args.projectId !== bundle.project.projectId) throw new Error('project_conflict: 会話の編集データとprojectIdが一致しません');
  if (args.expectedRevision !== undefined && args.expectedRevision !== args.revision) throw new Error('revision_conflict: 会話内の最新の編集結果を使ってください');
  const baseHash = await bundleHash(bundle);
  if (!Number.isSafeInteger(args.revision) || (args.revision as number) < 0) throw new Error('revisionが不正です');
  let revision = args.revision as number;
  if (!Array.isArray(args.operations) || args.operations.length < 1 || args.operations.length > 200) throw new Error('編集操作は1〜200個で指定してください');
  const initialRevision = revision;
  const refs: Record<string, string> = {};
  const resolveRefs = (value: unknown): unknown => {
    if (typeof value === 'string' && value.startsWith('$')) { const id = refs[value.slice(1)]; if (!id) throw new Error('未定義の操作参照です: ' + value); return id; }
    if (Array.isArray(value)) return value.map(resolveRefs);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveRefs(item)]));
    return value;
  };
  const results: unknown[] = [];
  for (const [operationIndex, raw] of args.operations.entries()) {
    let tool: string | undefined;
    try {
      const operation = object(raw); tool = string(operation.tool);
      if (!names.includes(tool)) throw new Error('この接続では使えない操作です');
      const outcome = executeXriftMcpEditorTool({ bundle, sceneSelection: null, assetSelection: null, editorMode: 'edit', importBusy: false, revision, saveStatus: 'saved' }, { id: crypto.randomUUID(), tool: tool as XriftMcpEditorToolName, arguments: { ...object(resolveRefs(operation.arguments)), projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, expectedRevision: revision } });
      if (outcome.changed) { bundle = validateBundle(outcome.bundle); revision++; }
      if (operation.ref !== undefined) {
        const ref = string(operation.ref);
        if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(ref) || refs[ref]) throw new Error('操作参照が不正または重複しています');
        const result = object(outcome.result); const id = result.entityId ?? result.assetId ?? result.id;
        if (typeof id !== 'string') throw new Error('この操作は参照可能なIDを返しません'); refs[ref] = id;
      }
      results.push(outcome.result);
    } catch (error) {
      throw new DocumentBatchError(error instanceof Error ? error.message : 'Document operation failed', {
        status: 'edit_failed', batchApplied: false, failedOperationIndex: operationIndex, tool,
        definition: documentTools.find(definition => definition.name === tool),
        bundle: validateBundle(args.bundle), revision: initialRevision,
        projectId: validateBundle(args.bundle).project.projectId,
        nextAction: 'Correct the failed operation using definition.inputSchema and retry edit_world with this unchanged bundle and revision. Do not create a replacement project. No changes from this batch were saved or displayed.',
      });
    }
  }
  return { ...await delivery(bundle, initialRevision + (revision > initialRevision ? 1 : 0), baseHash, typeof args.operationId === 'string' ? args.operationId : undefined), results, refs };
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleMcp(request: Request, env: Environment): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  let size = 0;
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return response({ error: 'Request too large' }, 413); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(bytes);
  let message: Record<string, unknown>;
  try { message = object(JSON.parse(raw)); } catch { return response({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const id = message.id ?? null;
  const ok = (result: unknown) => response({ jsonrpc: '2.0', id, result });
  try {
    const params = message.params === undefined ? {} : object(message.params);
    if (message.id === undefined) return new Response(null, { status: 202 });
    switch (message.method) {
      case 'initialize': return ok({ protocolVersion: negotiateProtocolVersion(params.protocolVersion), capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'XRift Studio', title: 'XRift Studio', version: '0.1.3', icons }, instructions: deliveryDescription + ' Read describe_document_tool before editing. No source files or background jobs. Rendering and Play need the actual app.' });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools });
      case 'resources/list': return ok({ resources: [{ uri: UI_URI, name: 'XRift Studio', mimeType: 'text/html;profile=mcp-app' }] });
      case 'resources/read': {
        if (params.uri !== UI_URI && !LEGACY_UI_URIS.includes(String(params.uri))) throw new Error('Unknown resource');
        const asset = await env.ASSETS.fetch(new Request(new URL('/chatgpt.html', request.url)));
        if (!asset.ok) throw new Error('ChatGPT App assets are not deployed');
        const html = (await asset.text()).replace('<html', params.uri === UI_URI ? '<html data-studio-new-entry="true"' : '<html');
        return ok({ contents: [{ uri: String(params.uri), mimeType: 'text/html;profile=mcp-app', text: html.replace('<head>', `<head><base href="${new URL(request.url).origin}/">`).replace(/(src|href)="\.\//g, `$1="${new URL(request.url).origin}/`), _meta: { 'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'inline' }, ui: { csp: { resourceDomains: [new URL(request.url).origin, 'https://public.xrift.net'], connectDomains: [new URL(request.url).origin, 'https://public.xrift.net'] } } } }] });
      }
      case 'tools/call': {
        const name = string(params.name); if (!tools.some((tool) => tool.name === name)) throw new Error('Unknown tool');
        try {
          const args = params.arguments === undefined ? {} : object(params.arguments);
          const properties = tools.find(tool => tool.name === name)!.inputSchema.properties;
          if (Object.keys(args).some(key => !Object.prototype.hasOwnProperty.call(properties, key))) throw new Error('未対応の引数が含まれています');
          const result = await callTool(name, args);
          const text = name === 'describe_document_tool'
            ? '次のdefinition.inputSchemaに従って操作のargumentsを指定してください。'
            : name === 'capture_scene_view'
            ? 'XRift Studioに現在のScene Viewのキャプチャを依頼しました。アプリから届く画像を確認してから必要な編集を続けてください。'
            : '編集データを会話へ返しました。次の編集にはこのbundleとrevisionを内部で引き継いでください。Editor未起動でも追編集できます。Sitesには保存していません。ブラウザ保存・Studioへの反映・画像の受信はそれぞれ実際の報告を受けるまで未確認です。';
          return ok({ content: [{ type: 'text', text, annotations: { audience: ['assistant'] } }, { type: 'text', text: JSON.stringify(result), annotations: { audience: ['assistant'] } }], structuredContent: result });
        } catch (error) {
          const content = [{ type: 'text', text: error instanceof Error ? error.message : 'Studio operation failed' }];
          if (error instanceof DocumentBatchError) {
            content.push({ type: 'text', text: JSON.stringify(error.recovery) });
            return ok({ isError: true, content, structuredContent: error.recovery });
          }
          return ok({ isError: true, content });
        }
      }
      default: return response({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
  } catch (error) { return response({ jsonrpc: '2.0', id, error: { code: -32602, message: error instanceof Error ? error.message : 'Invalid request' } }); }
}

export default { fetch(request: Request, env: Environment) {
  const url = new URL(request.url);
  if (url.pathname === '/new' || url.pathname === '/new/') {
    url.pathname = '/editor.html'; url.searchParams.set('new', '1');
    return Response.redirect(url.href, 307);
  }
  const match = url.pathname.match(/^\/editor\/([^/]+)\/?$/);
  if (match) {
    try { url.searchParams.set('project', validateStudioProjectId(decodeURIComponent(match[1]))); }
    catch { return new Response('プロジェクトIDが不正です', { status: 400 }); }
    url.pathname = '/editor.html';
    return env.ASSETS.fetch(new Request(url, request));
  }
  return url.pathname === '/mcp' ? handleMcp(request, env) : env.ASSETS.fetch(request);
} };
