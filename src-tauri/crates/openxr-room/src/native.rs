use super::*;
use openxr::{self as xr, sys, sys::Handle};
use serde_json::json;
use std::{
    ptr,
    time::{Duration, Instant},
};
use windows::{
    core::Interface,
    Win32::Graphics::{Direct3D::*, Direct3D11::*, Dxgi::*},
};

fn xr_error(context: &str, result: sys::Result) -> String {
    format!("OPENXR_ERROR: {context}: {result:?}")
}
fn ok(result: sys::Result, context: &str) -> Result<(), String> {
    if result.into_raw() < 0 {
        Err(xr_error(context, result))
    } else {
        Ok(())
    }
}
fn entry() -> Result<xr::Entry, String> {
    #[cfg(feature = "bundled-loader")]
    {
        Ok(xr::Entry::linked())
    }
    #[cfg(not(feature = "bundled-loader"))]
    {
        unsafe { xr::Entry::load().map_err(|e| format!("LOADER_UNAVAILABLE: {e}")) }
    }
}
fn extensions(e: &xr::Entry) -> Result<(xr::ExtensionSet, Vec<String>), String> {
    let x = e
        .enumerate_extensions()
        .map_err(|e| xr_error("拡張の確認", e))?;
    let flags = [
        x.khr_d3d11_enable,
        x.fb_spatial_entity,
        x.fb_spatial_entity_storage,
        x.fb_spatial_entity_query,
        x.fb_scene,
    ];
    let missing = REQUIRED
        .iter()
        .zip(flags)
        .filter(|(_, v)| !v)
        .map(|(name, _)| name.to_string())
        .collect();
    Ok((x, missing))
}
fn instance(e: &xr::Entry, extensions: &xr::ExtensionSet) -> Result<xr::Instance, String> {
    e.create_instance(
        &xr::ApplicationInfo {
            application_name: "XRift Studio Room Import",
            application_version: 1,
            engine_name: "XRift Studio",
            engine_version: 1,
            api_version: xr::Version::new(1, 0, 0),
        },
        extensions,
        &[],
    )
    .map_err(|e| xr_error("Instanceの作成", e))
}
pub fn capabilities() -> Result<Capabilities, String> {
    let e = entry()?;
    let (x, missing) = extensions(&e)?;
    let i = instance(&e, &xr::ExtensionSet::default())?;
    let runtime = i
        .properties()
        .map_err(|e| xr_error("Runtimeの確認", e))?
        .runtime_name;
    let available = missing.is_empty();
    Ok(Capabilities { runtime, available, missing_extensions: missing, mesh: x.meta_spatial_entity_mesh,
        message: if available { "必要な拡張を確認しました。端末の接続・空間データの許可・保存済みの部屋は取得時に確認します" } else { "このRuntimeは部屋取得に必要な拡張を公開していません。Meta Air LinkではMeta Runtimeと空間データ設定を確認してください" }.into() })
}

fn device(i: &xr::Instance, system: xr::SystemId) -> Result<ID3D11Device, String> {
    let requirements = i
        .graphics_requirements::<xr::D3D11>(system)
        .map_err(|e| xr_error("D3D11要件", e))?;
    unsafe {
        let factory: IDXGIFactory1 =
            CreateDXGIFactory1().map_err(|e| format!("GRAPHICS_ERROR: {e}"))?;
        for index in 0..32 {
            let Ok(adapter) = factory.EnumAdapters1(index) else {
                break;
            };
            let desc = adapter
                .GetDesc1()
                .map_err(|e| format!("GRAPHICS_ERROR: {e}"))?;
            if desc.AdapterLuid.LowPart != requirements.adapter_luid.LowPart
                || desc.AdapterLuid.HighPart != requirements.adapter_luid.HighPart
            {
                continue;
            }
            let mut output = None;
            let levels = [
                D3D_FEATURE_LEVEL_12_1,
                D3D_FEATURE_LEVEL_12_0,
                D3D_FEATURE_LEVEL_11_1,
                D3D_FEATURE_LEVEL_11_0,
            ];
            let levels: Vec<_> = levels
                .into_iter()
                .filter(|v| v.0 >= requirements.min_feature_level as i32)
                .collect();
            D3D11CreateDevice(
                &adapter,
                D3D_DRIVER_TYPE_UNKNOWN,
                Default::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                Some(&levels),
                D3D11_SDK_VERSION,
                Some(&mut output),
                None,
                None,
            )
            .map_err(|e| format!("GRAPHICS_ERROR: {e}"))?;
            return output.ok_or_else(|| "GRAPHICS_ERROR: D3D11 Deviceがありません".into());
        }
    }
    Err("GRAPHICS_ERROR: Runtimeが指定したGPUを確認できませんでした".into())
}

struct Spaces<'a> {
    instance: &'a xr::Instance,
    values: Vec<sys::SpaceQueryResultFB>,
}
impl Drop for Spaces<'_> {
    fn drop(&mut self) {
        for space in &self.values {
            if space.space == sys::Space::NULL {
                continue;
            }
            unsafe {
                (self.instance.fp().destroy_space)(space.space);
            }
        }
    }
}
// All native output buffers have explicit caps and remain owned until the FFI call returns.
fn bounded_count(count: u32, max: u32) -> Result<usize, String> {
    if count > max {
        Err(format!(
            "DATA_LIMIT: 取得データが上限を超えました ({count}/{max})"
        ))
    } else {
        Ok(count as usize)
    }
}
fn component(
    i: &xr::Instance,
    space: sys::Space,
    ty: sys::SpaceComponentTypeFB,
) -> Result<bool, String> {
    let api = i.exts().fb_spatial_entity.as_ref().unwrap();
    unsafe {
        let mut status = sys::SpaceComponentStatusFB::out(ptr::null_mut());
        let result = (api.get_space_component_status)(space, ty, status.as_mut_ptr());
        if result == sys::Result::ERROR_SPACE_COMPONENT_NOT_SUPPORTED_FB {
            return Ok(false);
        }
        ok(result, "Component状態")?;
        let status = status.assume_init();
        if bool::from(status.enabled) {
            return Ok(true);
        }
        if !bool::from(status.change_pending) {
            let info = sys::SpaceComponentStatusSetInfoFB {
                ty: sys::SpaceComponentStatusSetInfoFB::TYPE,
                next: ptr::null(),
                component_type: ty,
                enabled: true.into(),
                timeout: xr::Duration::from_nanos(5_000_000_000),
            };
            let mut request = sys::AsyncRequestIdFB::from_raw(0);
            ok(
                (api.set_space_component_status)(space, &info, &mut request),
                "Component有効化",
            )?;
        }
    }
    Ok(false)
}
fn retrieve(
    i: &xr::Instance,
    session: sys::Session,
    id: sys::AsyncRequestIdFB,
    spaces: &mut Spaces<'_>,
) -> Result<(), String> {
    let api = i.exts().fb_spatial_entity_query.as_ref().unwrap();
    unsafe {
        let mut out = sys::SpaceQueryResultsFB {
            ty: sys::SpaceQueryResultsFB::TYPE,
            next: ptr::null_mut(),
            result_capacity_input: 0,
            result_count_output: 0,
            results: ptr::null_mut(),
        };
        ok(
            (api.retrieve_space_query_results)(session, id, &mut out),
            "部屋件数の取得",
        )?;
        let count = bounded_count(out.result_count_output, 4096)?;
        if count == 0 {
            return Ok(());
        }
        // Own the output buffer before retrieval so all returned handles are
        // released even when the call or the subsequent count validation fails.
        let mut batch = Spaces {
            instance: i,
            values: vec![
                sys::SpaceQueryResultFB {
                    space: sys::Space::NULL,
                    uuid: Default::default()
                };
                count
            ],
        };
        out.result_capacity_input = count as u32;
        out.results = batch.values.as_mut_ptr();
        ok(
            (api.retrieve_space_query_results)(session, id, &mut out),
            "部屋の取得",
        )?;
        let returned = bounded_count(out.result_count_output, count as u32)?;
        if batch.values[..returned]
            .iter()
            .any(|item| item.space == sys::Space::NULL)
        {
            return Err("INVALID_DATA: 部屋のSpaceがありません".into());
        }
        spaces.values.extend(batch.values.drain(..returned));
        bounded_count(spaces.values.len() as u32, 4096)?;
    }
    Ok(())
}
fn surface(
    i: &xr::Instance,
    session: sys::Session,
    item: &sys::SpaceQueryResultFB,
    base: &xr::Space,
    time: xr::Time,
) -> Result<Option<Value>, String> {
    // Wait for every supported geometry component before caching the surface.
    // Otherwise a quick Bounds response could hide an asynchronously enabled Mesh.
    let mut ready = component(i, item.space, sys::SpaceComponentTypeFB::LOCATABLE)?;
    unsafe {
        let api = i.exts().fb_spatial_entity.as_ref().unwrap();
        let mut count = 0;
        ok(
            (api.enumerate_space_supported_components)(item.space, 0, &mut count, ptr::null_mut()),
            "Component一覧",
        )?;
        let mut types = vec![sys::SpaceComponentTypeFB::LOCATABLE; bounded_count(count, 128)?];
        ok(
            (api.enumerate_space_supported_components)(
                item.space,
                types.len() as u32,
                &mut count,
                types.as_mut_ptr(),
            ),
            "Component一覧",
        )?;
        types.truncate(bounded_count(count, types.len() as u32)?);
        for ty in types {
            if [
                sys::SpaceComponentTypeFB::SEMANTIC_LABELS,
                sys::SpaceComponentTypeFB::BOUNDED_2D,
                sys::SpaceComponentTypeFB::BOUNDED_3D,
            ]
            .contains(&ty)
                || (ty == sys::SpaceComponentTypeFB::TRIANGLE_MESH_M
                    && i.exts().meta_spatial_entity_mesh.is_some())
            {
                ready &= component(i, item.space, ty)?;
            }
        }
    }
    if !ready {
        return Ok(None);
    }
    unsafe {
        let mut location = sys::SpaceLocation::out(ptr::null_mut());
        ok(
            (i.fp().locate_space)(item.space, base.as_raw(), time, location.as_mut_ptr()),
            "位置の取得",
        )?;
        // Invalid pose fields may be uninitialized; inspect flags before reading them.
        let flags = ptr::addr_of!((*location.as_ptr()).location_flags).read();
        if !flags.contains(
            sys::SpaceLocationFlags::POSITION_VALID | sys::SpaceLocationFlags::ORIENTATION_VALID,
        ) {
            return Ok(None);
        }
        let location = location.assume_init();
        let scene = i.exts().fb_scene.as_ref().unwrap();
        if !component(i, item.space, sys::SpaceComponentTypeFB::SEMANTIC_LABELS)? {
            return Ok(None);
        }
        let mut labels = sys::SemanticLabelsFB {
            ty: sys::SemanticLabelsFB::TYPE,
            next: ptr::null(),
            buffer_capacity_input: 0,
            buffer_count_output: 0,
            buffer: ptr::null_mut(),
        };
        ok(
            (scene.get_space_semantic_labels)(session, item.space, &mut labels),
            "分類の取得",
        )?;
        let mut bytes = vec![0u8; bounded_count(labels.buffer_count_output, 4096)?];
        labels.buffer_capacity_input = bytes.len() as u32;
        labels.buffer = bytes.as_mut_ptr().cast();
        ok(
            (scene.get_space_semantic_labels)(session, item.space, &mut labels),
            "分類の読取",
        )?;
        bytes.truncate(bounded_count(labels.buffer_count_output, bytes.len() as u32)?);
        let label = String::from_utf8_lossy(&bytes)
            .trim_end_matches('\0')
            .to_string();
        let p = location.pose.position;
        let q = location.pose.orientation;
        let id = item
            .uuid
            .data
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        let mut value = json!({"id": id, "labels": label, "position": [p.x,p.y,p.z], "rotation": [q.x,q.y,q.z,q.w]});
        if i.exts().meta_spatial_entity_mesh.is_some()
            && component(i, item.space, sys::SpaceComponentTypeFB::TRIANGLE_MESH_M)?
        {
            let api = i.exts().meta_spatial_entity_mesh.as_ref().unwrap();
            let info = sys::SpaceTriangleMeshGetInfoMETA {
                ty: sys::SpaceTriangleMeshGetInfoMETA::TYPE,
                next: ptr::null(),
            };
            let mut mesh = sys::SpaceTriangleMeshMETA {
                ty: sys::SpaceTriangleMeshMETA::TYPE,
                next: ptr::null_mut(),
                vertex_capacity_input: 0,
                vertex_count_output: 0,
                vertices: ptr::null_mut(),
                index_capacity_input: 0,
                index_count_output: 0,
                indices: ptr::null_mut(),
            };
            ok(
                (api.get_space_triangle_mesh)(item.space, &info, &mut mesh),
                "Mesh件数",
            )?;
            let mut vertices =
                vec![sys::Vector3f::default(); bounded_count(mesh.vertex_count_output, 200_000)?];
            let mut indices = vec![0u32; bounded_count(mesh.index_count_output, 600_000)?];
            mesh.vertex_capacity_input = vertices.len() as u32;
            mesh.vertices = vertices.as_mut_ptr();
            mesh.index_capacity_input = indices.len() as u32;
            mesh.indices = indices.as_mut_ptr();
            ok(
                (api.get_space_triangle_mesh)(item.space, &info, &mut mesh),
                "Mesh取得",
            )?;
            vertices.truncate(bounded_count(
                mesh.vertex_count_output,
                vertices.len() as u32,
            )?);
            indices.truncate(bounded_count(
                mesh.index_count_output,
                indices.len() as u32,
            )?);
            value["mesh"] = json!({"vertices": vertices.iter().flat_map(|p| [p.x,p.y,p.z]).collect::<Vec<_>>(), "indices": indices});
        }
        if component(i, item.space, sys::SpaceComponentTypeFB::BOUNDED_2D)? {
            let mut boundary = sys::Boundary2DFB {
                ty: sys::Boundary2DFB::TYPE,
                next: ptr::null(),
                vertex_capacity_input: 0,
                vertex_count_output: 0,
                vertices: ptr::null_mut(),
            };
            ok(
                (scene.get_space_boundary2_d)(session, item.space, &mut boundary),
                "境界件数",
            )?;
            let mut points = vec![
                sys::Vector2f::default();
                bounded_count(boundary.vertex_count_output, 100_000)?
            ];
            boundary.vertex_capacity_input = points.len() as u32;
            boundary.vertices = points.as_mut_ptr();
            ok(
                (scene.get_space_boundary2_d)(session, item.space, &mut boundary),
                "境界取得",
            )?;
            points.truncate(bounded_count(
                boundary.vertex_count_output,
                points.len() as u32,
            )?);
            value["boundaryXY"] = json!(points.iter().map(|p| [p.x, p.y]).collect::<Vec<_>>());
        }
        if component(i, item.space, sys::SpaceComponentTypeFB::BOUNDED_3D)? {
            let mut bounds = sys::Rect3DfFB::default();
            ok(
                (scene.get_space_bounding_box3_d)(session, item.space, &mut bounds),
                "寸法取得",
            )?;
            let b = bounds.offset;
            let e = bounds.extent;
            value["bounds"] =
                json!({"min": [b.x,b.y,b.z], "max": [b.x+e.width,b.y+e.height,b.z+e.depth]});
        }
        if value.get("mesh").is_none()
            && value.get("boundaryXY").is_none()
            && value.get("bounds").is_none()
        {
            return Ok(None);
        }
        Ok(Some(value))
    }
}

pub fn capture(cancel: &AtomicBool) -> Result<Room, String> {
    check_cancel(cancel)?;
    let entry = entry()?;
    let (supported, missing) = extensions(&entry)?;
    if !missing.is_empty() {
        return Err(format!("UNSUPPORTED_RUNTIME: 必要な拡張がありません: {}。Meta Air LinkではMeta Runtimeと空間データ設定を確認してください", missing.join(", ")));
    }
    let mut enabled = xr::ExtensionSet::default();
    enabled.khr_d3d11_enable = true;
    enabled.fb_spatial_entity = true;
    enabled.fb_spatial_entity_storage = true;
    enabled.fb_spatial_entity_query = true;
    enabled.fb_scene = true;
    enabled.meta_spatial_entity_mesh = supported.meta_spatial_entity_mesh;
    let i = instance(&entry, &enabled)?;
    let runtime = i
        .properties()
        .map_err(|e| xr_error("Runtime名", e))?
        .runtime_name;
    let system = i
        .system(xr::FormFactor::HEAD_MOUNTED_DISPLAY)
        .map_err(|e| xr_error("端末の確認。接続・装着状態を確認してください", e))?;
    check_cancel(cancel)?;
    // Device must outlive the session. Match the runtime's adapter, not the default GPU.
    let device = device(&i, system)?;
    check_cancel(cancel)?;
    let (session, mut waiter, mut stream) = unsafe {
        i.create_session::<xr::D3D11>(
            system,
            &xr::d3d::SessionCreateInfoD3D11 {
                device: device.as_raw().cast(),
            },
        )
    }
    .map_err(|e| xr_error("Session開始", e))?;
    let spaces_available = session
        .enumerate_reference_spaces()
        .map_err(|e| xr_error("座標系", e))?;
    if !spaces_available.contains(&xr::ReferenceSpaceType::STAGE) {
        return Err("REFERENCE_SPACE_UNAVAILABLE: 床基準のSTAGE座標系がありません。端末の境界設定を確認してください".into());
    }
    let blend_mode = i
        .enumerate_environment_blend_modes(system, xr::ViewConfigurationType::PRIMARY_STEREO)
        .map_err(|e| xr_error("合成方式", e))?
        .into_iter()
        .next()
        .ok_or_else(|| "GRAPHICS_ERROR: 合成方式がありません".to_string())?;
    let base = session
        .create_reference_space(xr::ReferenceSpaceType::STAGE, xr::Posef::IDENTITY)
        .map_err(|e| xr_error("床基準座標", e))?;
    let mut spaces = Spaces {
        instance: &i,
        values: Vec::new(),
    };
    let mut buffer = xr::EventDataBuffer::new();
    let deadline = Instant::now() + Duration::from_secs(45);
    let mut running = false;
    let mut request = None;
    let mut query_done = false;
    let mut captured = std::collections::BTreeMap::new();
    let mut settle_deadline = None;
    let mut total_bytes = 0usize;
    loop {
        check_cancel(cancel)?;
        if Instant::now() >= deadline {
            return Err("TIMEOUT: 部屋を取得できませんでした。端末の装着・空間データの許可・Room Setupを確認してください".into());
        }
        while let Some(event) = i
            .poll_event(&mut buffer)
            .map_err(|e| xr_error("イベント取得", e))?
        {
            match event {
                xr::Event::SessionStateChanged(e) => match e.state() {
                    xr::SessionState::READY => {
                        session
                            .begin(xr::ViewConfigurationType::PRIMARY_STEREO)
                            .map_err(|e| xr_error("Session実行", e))?;
                        running = true;
                    }
                    xr::SessionState::STOPPING => {
                        session.end().map_err(|e| xr_error("Session終了", e))?;
                        return Err(
                            "SESSION_STOPPED: 接続が終了しました。再接続して取得してください"
                                .into(),
                        );
                    }
                    xr::SessionState::EXITING | xr::SessionState::LOSS_PENDING => {
                        return Err("SESSION_LOST: 端末との接続が失われました".into())
                    }
                    _ => {}
                },
                xr::Event::InstanceLossPending(_) => {
                    return Err("RUNTIME_LOST: OpenXR Runtimeが終了しました".into())
                }
                xr::Event::SpaceQueryResultsAvailableFB(e) if Some(e.request_id()) == request => {
                    retrieve(&i, session.as_raw(), e.request_id(), &mut spaces)?
                }
                xr::Event::SpaceQueryCompleteFB(e) if Some(e.request_id()) == request => {
                    ok(e.result(), "部屋クエリ。空間データの許可を確認してください")?;
                    query_done = true;
                    settle_deadline = Some(Instant::now() + Duration::from_secs(5));
                }
                xr::Event::ReferenceSpaceChangePending(e)
                    if e.reference_space_type() == xr::ReferenceSpaceType::STAGE =>
                {
                    return Err(
                        "REFERENCE_SPACE_CHANGED: 取得中に座標基準が変わりました。再取得してください"
                            .into(),
                    )
                }
                _ => {}
            }
        }
        if !running {
            std::thread::sleep(Duration::from_millis(10));
            continue;
        }
        let frame = waiter.wait().map_err(|e| xr_error("Frame待機", e))?;
        stream.begin().map_err(|e| xr_error("Frame開始", e))?;
        // Acquisition needs a running session, but submits no rendered layers.
        stream
            .end(frame.predicted_display_time, blend_mode, &[])
            .map_err(|e| xr_error("Frame終了", e))?;
        check_cancel(cancel)?;
        if request.is_none() {
            let storage = sys::SpaceStorageLocationFilterInfoFB {
                ty: sys::SpaceStorageLocationFilterInfoFB::TYPE,
                next: ptr::null(),
                location: sys::SpaceStorageLocationFB::LOCAL,
            };
            let filter = sys::SpaceComponentFilterInfoFB {
                ty: sys::SpaceComponentFilterInfoFB::TYPE,
                next: &storage as *const _ as _,
                component_type: sys::SpaceComponentTypeFB::SEMANTIC_LABELS,
            };
            let info = sys::SpaceQueryInfoFB {
                ty: sys::SpaceQueryInfoFB::TYPE,
                next: ptr::null(),
                query_action: sys::SpaceQueryActionFB::LOAD,
                max_result_count: 4096,
                timeout: xr::Duration::from_nanos(15_000_000_000),
                filter: &filter as *const _ as _,
                exclude_filter: ptr::null(),
            };
            let mut id = sys::AsyncRequestIdFB::from_raw(0);
            unsafe {
                ok(
                    (i.exts()
                        .fb_spatial_entity_query
                        .as_ref()
                        .unwrap()
                        .query_spaces)(
                        session.as_raw(), &info as *const _ as _, &mut id
                    ),
                    "保存済み部屋の照会",
                )?;
            }
            request = Some(id);
        }
        for item in &spaces.values {
            check_cancel(cancel)?;
            if captured.contains_key(&item.space.into_raw()) {
                continue;
            }
            if let Some(value) = surface(
                &i,
                session.as_raw(),
                item,
                &base,
                frame.predicted_display_time,
            )? {
                total_bytes += value.to_string().len();
                if total_bytes > 32 * 1024 * 1024 {
                    return Err("DATA_LIMIT: 部屋データが32MBを超えました".into());
                }
                captured.insert(item.space.into_raw(), value);
            }
        }
        if query_done
            && (captured.len() == spaces.values.len()
                || settle_deadline.is_some_and(|d| Instant::now() >= d))
        {
            if captured.is_empty() {
                return Err("NO_ROOM: 保存済みの部屋を取得できませんでした。Linkを切断してQuestでRoom Setupを済ませ、空間データを許可して再接続してください".into());
            }
            let warnings = if captured.len() < spaces.values.len() {
                vec![format!(
                    "{}件は位置・形状を確定できず除外しました",
                    spaces.values.len() - captured.len()
                )]
            } else {
                vec![]
            };
            return Ok(Room {
                runtime,
                reference_space: "bounded-floor".into(),
                surfaces: captured.into_values().collect(),
                warnings,
            });
        }
    }
}
