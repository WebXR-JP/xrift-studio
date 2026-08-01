use base64::Engine;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;

const POLY_HAVEN_API: &str = "https://api.polyhaven.com";
const POLY_HAVEN_PROVIDER_ID: &str = "poly-haven";
const AMBIENT_CG_API: &str = "https://ambientcg.com/api/v3";
const AMBIENT_CG_PROVIDER_ID: &str = "ambient-cg";
const POLY_HAVEN_USER_AGENT: &str =
    "XRiftStudio/0.6.0 (+https://github.com/xrift-studio/xrift-studio; asset-browser)";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalStoreAsset {
    pub provider_id: String,
    pub external_id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub tags: Vec<String>,
    pub thumbnail_url: String,
    pub asset_kind: String,
    pub max_resolution: Option<[u64; 2]>,
    pub download_count: u64,
    pub authors: Vec<String>,
    pub asset_url: String,
    pub license_name: String,
    pub license_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalStoreAssetOptions {
    pub provider_id: String,
    pub external_id: String,
    pub asset_kind: String,
    pub resolutions: Vec<ExternalStoreResolution>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalStoreResolution {
    pub id: String,
    pub label: String,
    pub byte_length: u64,
    pub file_count: usize,
    pub formats: Vec<ExternalStoreFormatOption>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalStoreFormatOption {
    pub id: String,
    pub label: String,
    pub byte_length: u64,
    pub file_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalStoreInstallRequest {
    pub provider_id: String,
    pub external_id: String,
    pub resolution: String,
    pub format: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalStoreInstalledFile {
    pub role: String,
    pub relative_path: String,
    pub byte_length: u64,
    pub sha256: String,
    pub format: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalStoreInstallResult {
    pub provider_id: String,
    pub provider_name: String,
    pub external_id: String,
    pub name: String,
    pub asset_kind: String,
    pub resolution: String,
    pub files: Vec<ExternalStoreInstalledFile>,
    pub authors: Vec<String>,
    pub asset_url: String,
    pub license_name: String,
    pub license_url: String,
}

#[derive(Clone)]
struct DownloadSpec {
    role: String,
    url: String,
    size: u64,
    extension: String,
}

fn external_store_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(POLY_HAVEN_USER_AGENT)
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())
}

fn validate_provider(provider_id: &str) -> Result<(), String> {
    if matches!(provider_id, POLY_HAVEN_PROVIDER_ID | AMBIENT_CG_PROVIDER_ID) {
        Ok(())
    } else {
        Err("未対応の外部ストアです".to_string())
    }
}

fn validate_external_id(external_id: &str) -> Result<&str, String> {
    let id = external_id.trim();
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err("外部アセットIDが不正です".to_string());
    }
    Ok(id)
}

async fn fetch_poly_haven_json(path: &str) -> Result<Value, String> {
    let response = external_store_client()?
        .get(format!("{}{}", POLY_HAVEN_API, path))
        .send()
        .await
        .map_err(|error| format!("Poly Havenへ接続できませんでした: {}", error))?;
    if !response.status().is_success() {
        return Err(format!(
            "Poly Haven APIがエラーを返しました ({})",
            response.status()
        ));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| format!("Poly Havenの応答を読み取れませんでした: {}", error))
}

async fn fetch_ambient_cg_json(query: &str) -> Result<Value, String> {
    let response = external_store_client()?
        .get(format!("{}/assets{}", AMBIENT_CG_API, query))
        .send()
        .await
        .map_err(|error| format!("ambientCGへ接続できませんでした: {}", error))?;
    if !response.status().is_success() {
        return Err(format!(
            "ambientCG APIがエラーを返しました ({})",
            response.status()
        ));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| format!("ambientCGの応答を読み取れませんでした: {}", error))
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn author_names(value: Option<&Value>) -> Vec<String> {
    let mut authors = value
        .and_then(Value::as_object)
        .map(|entries| entries.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    authors.sort();
    authors
}

fn asset_kind(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_u64) {
        Some(0) => "hdri",
        Some(1) => "texture",
        Some(2) => "model",
        _ => "unknown",
    }
}

fn max_resolution(value: Option<&Value>) -> Option<[u64; 2]> {
    let entries = value?.as_array()?;
    if entries.len() < 2 {
        return None;
    }
    Some([entries[0].as_u64()?, entries[1].as_u64()?])
}

fn ambient_cg_asset_kind(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_str) {
        Some("hdri") => "hdri",
        Some("material") => "texture",
        Some("3d-model") => "model",
        _ => "unknown",
    }
}

fn ambient_cg_thumbnail(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_object)
        .and_then(|thumbnails| {
            ["512-PNG", "512-JPG-FFFFFF", "256-PNG"]
                .into_iter()
                .find_map(|key| thumbnails.get(key).and_then(Value::as_str))
                .or_else(|| thumbnails.values().find_map(Value::as_str))
        })
        .unwrap_or_default()
        .to_string()
}

fn ambient_cg_asset_to_external(value: &Value) -> Option<ExternalStoreAsset> {
    let external_id = value.get("id").and_then(Value::as_str)?.trim();
    let kind = ambient_cg_asset_kind(value.get("type"));
    if !matches!(kind, "hdri" | "texture" | "model") {
        return None;
    }
    let download_count = value
        .get("downloadStatistics")
        .and_then(|stats| stats.get("total"))
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let asset_url = value
        .get("url")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("https://ambientcg.com/a/{}", external_id));
    Some(ExternalStoreAsset {
        provider_id: AMBIENT_CG_PROVIDER_ID.to_string(),
        external_id: external_id.to_string(),
        name: value
            .get("title")
            .and_then(Value::as_str)
            .filter(|title| !title.trim().is_empty())
            .unwrap_or(external_id)
            .to_string(),
        description: value
            .get("longDescription")
            .and_then(Value::as_str)
            .filter(|description| !description.trim().is_empty())
            .or_else(|| value.get("shortDescription").and_then(Value::as_str))
            .unwrap_or_default()
            .to_string(),
        category: value
            .get("technique")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        tags: string_array(value.get("tags")),
        thumbnail_url: ambient_cg_thumbnail(value.get("thumbnails")),
        asset_kind: kind.to_string(),
        max_resolution: None,
        download_count,
        authors: Vec::new(),
        asset_url,
        license_name: "CC0 1.0".to_string(),
        license_url: "https://creativecommons.org/publicdomain/zero/1.0/".to_string(),
    })
}

#[derive(Clone)]
struct AmbientCgDownload {
    attributes: String,
    url: String,
    size: u64,
}

fn ambient_cg_downloads(value: &Value) -> Vec<AmbientCgDownload> {
    value
        .get("downloads")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|entry| entry.get("extension").and_then(Value::as_str) == Some("zip"))
        .filter_map(|entry| {
            Some(AmbientCgDownload {
                attributes: entry.get("attributes")?.as_str()?.to_string(),
                url: entry.get("url")?.as_str()?.to_string(),
                size: entry
                    .get("size")
                    .and_then(Value::as_u64)
                    .unwrap_or_default(),
            })
        })
        .collect()
}

fn ambient_cg_resolution(attributes: &str) -> Option<String> {
    attributes.split('-').find_map(|token| {
        let normalized = token.trim().to_ascii_lowercase();
        let digits = normalized.strip_suffix('k')?;
        if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        Some(format!("{}k", digits))
    })
}

fn ambient_cg_texture_download(
    downloads: &[AmbientCgDownload],
    resolution: &str,
) -> Option<AmbientCgDownload> {
    downloads
        .iter()
        .filter(|download| {
            ambient_cg_resolution(&download.attributes).as_deref() == Some(resolution)
        })
        .filter(|download| {
            let attributes = download.attributes.to_ascii_uppercase();
            attributes.contains("-JPG") || attributes.contains("-PNG")
        })
        .min_by_key(|download| {
            if download.attributes.to_ascii_uppercase().contains("-JPG") {
                0
            } else {
                1
            }
        })
        .cloned()
}

fn ambient_cg_hdri_download(
    downloads: &[AmbientCgDownload],
    resolution: &str,
) -> Option<AmbientCgDownload> {
    downloads
        .iter()
        .find(|download| ambient_cg_resolution(&download.attributes).as_deref() == Some(resolution))
        .cloned()
}

fn ambient_cg_resolutions(value: &Value, kind: &str) -> Vec<ExternalStoreResolution> {
    let downloads = ambient_cg_downloads(value);
    let mut resolutions = BTreeMap::<String, AmbientCgDownload>::new();
    for download in &downloads {
        let Some(resolution) = ambient_cg_resolution(&download.attributes) else {
            continue;
        };
        let selected = if kind == "texture" {
            ambient_cg_texture_download(&downloads, &resolution)
        } else if kind == "hdri" {
            ambient_cg_hdri_download(&downloads, &resolution)
        } else {
            None
        };
        if let Some(selected) = selected {
            resolutions.entry(resolution).or_insert(selected);
        }
    }
    resolutions
        .into_iter()
        .map(|(id, download)| {
            let file_count = if kind == "texture" {
                let maps = value.get("maps").and_then(Value::as_array);
                if maps.is_some_and(|maps| maps.iter().any(|map| map.as_str() == Some("normal"))) {
                    2
                } else {
                    1
                }
            } else {
                1
            };
            let formats = if kind == "hdri" {
                vec![ExternalStoreFormatOption {
                    id: "exr".to_string(),
                    label: "EXR".to_string(),
                    byte_length: download.size,
                    file_count: 1,
                }]
            } else {
                Vec::new()
            };
            ExternalStoreResolution {
                label: id.to_ascii_uppercase(),
                id,
                byte_length: download.size,
                file_count,
                formats,
            }
        })
        .collect()
}

#[tauri::command]
pub async fn list_external_store_assets(
    provider_id: String,
) -> Result<Vec<ExternalStoreAsset>, String> {
    validate_provider(&provider_id)?;
    if provider_id == AMBIENT_CG_PROVIDER_ID {
        let payload = fetch_ambient_cg_json(
            "?sort=popular&limit=500&include=type,shortDescription,longDescription,title,url,tags,downloadStatistics,technique,downloads,thumbnails",
        )
        .await?;
        let mut assets = payload
            .get("assets")
            .and_then(Value::as_array)
            .ok_or_else(|| "ambientCGのアセット一覧が不正です".to_string())?
            .iter()
            .filter_map(ambient_cg_asset_to_external)
            .collect::<Vec<_>>();
        assets.sort_by(|left, right| {
            right
                .download_count
                .cmp(&left.download_count)
                .then_with(|| left.name.cmp(&right.name))
        });
        return Ok(assets);
    }
    let payload = fetch_poly_haven_json("/assets").await?;
    let entries = payload
        .as_object()
        .ok_or_else(|| "Poly Havenのアセット一覧が不正です".to_string())?;
    let mut assets = entries
        .iter()
        .filter_map(|(external_id, value)| {
            let kind = asset_kind(value.get("type"));
            if !matches!(kind, "hdri" | "texture" | "model") {
                return None;
            }
            Some(ExternalStoreAsset {
                provider_id: POLY_HAVEN_PROVIDER_ID.to_string(),
                external_id: external_id.clone(),
                name: value
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(external_id)
                    .to_string(),
                description: value
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                category: value
                    .get("category")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                tags: string_array(value.get("tags")),
                thumbnail_url: value
                    .get("thumbnail_url")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                asset_kind: kind.to_string(),
                max_resolution: max_resolution(value.get("max_resolution")),
                download_count: value
                    .get("download_count")
                    .and_then(Value::as_u64)
                    .unwrap_or_default(),
                authors: author_names(value.get("authors")),
                asset_url: format!("https://polyhaven.com/a/{}", external_id),
                license_name: "CC0 1.0".to_string(),
                license_url: "https://creativecommons.org/publicdomain/zero/1.0/".to_string(),
            })
        })
        .collect::<Vec<_>>();
    assets.sort_by(|left, right| {
        right
            .download_count
            .cmp(&left.download_count)
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(assets)
}

fn file_leaf<'a>(root: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().try_fold(root, |current, key| current.get(*key))
}

fn download_leaf(
    root: &Value,
    channel: &str,
    resolution: &str,
    formats: &[&str],
) -> Option<DownloadSpec> {
    formats.iter().find_map(|format| {
        let leaf = file_leaf(root, &[channel, resolution, format])?;
        let url = leaf.get("url")?.as_str()?.to_string();
        let size = leaf.get("size").and_then(Value::as_u64).unwrap_or_default();
        Some(DownloadSpec {
            role: String::new(),
            url,
            size,
            extension: (*format).to_string(),
        })
    })
}

fn hdri_specs(root: &Value, resolution: &str, format: &str) -> Vec<DownloadSpec> {
    if !matches!(format, "hdr" | "exr") {
        return Vec::new();
    }
    download_leaf(root, "hdri", resolution, &[format])
        .map(|mut spec| {
            spec.role = "environment".to_string();
            vec![spec]
        })
        .unwrap_or_default()
}

fn hdri_format_options(root: &Value, resolution: &str) -> Vec<ExternalStoreFormatOption> {
    ["hdr", "exr"]
        .into_iter()
        .filter_map(|format| {
            let specs = hdri_specs(root, resolution, format);
            if specs.is_empty() {
                return None;
            }
            Some(ExternalStoreFormatOption {
                id: format.to_string(),
                label: format.to_ascii_uppercase(),
                byte_length: specs.iter().map(|entry| entry.size).sum(),
                file_count: specs.len(),
            })
        })
        .collect()
}

fn texture_specs(root: &Value, resolution: &str) -> Vec<DownloadSpec> {
    [
        ("Diffuse", "base-color"),
        ("nor_gl", "normal"),
        ("arm", "arm"),
    ]
    .into_iter()
    .filter_map(|(channel, role)| {
        download_leaf(root, channel, resolution, &["jpg", "png"]).map(|mut spec| {
            spec.role = role.to_string();
            spec
        })
    })
    .collect()
}

fn model_bundle_path(value: &str) -> Result<String, String> {
    if value.is_empty() || value.len() > 512 || value.contains('\\') {
        return Err("Model bundleのファイル名が不正です".to_string());
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err("Model bundleが安全でないパスを参照しています".to_string());
    }
    Ok(value.to_string())
}

fn model_specs(root: &Value, resolution: &str) -> Vec<DownloadSpec> {
    let Some(leaf) = file_leaf(root, &["gltf", resolution, "gltf"]) else {
        return Vec::new();
    };
    let Some(url) = leaf.get("url").and_then(Value::as_str) else {
        return Vec::new();
    };
    let mut specs = vec![DownloadSpec {
        role: "model".to_string(),
        url: url.to_string(),
        size: leaf.get("size").and_then(Value::as_u64).unwrap_or_default(),
        extension: "gltf".to_string(),
    }];
    if let Some(includes) = leaf.get("include").and_then(Value::as_object) {
        for (bundle_path, entry) in includes {
            let Ok(bundle_path) = model_bundle_path(bundle_path) else {
                return Vec::new();
            };
            let Some(url) = entry.get("url").and_then(Value::as_str) else {
                return Vec::new();
            };
            let extension = Path::new(&bundle_path)
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("bin")
                .to_ascii_lowercase();
            specs.push(DownloadSpec {
                role: format!("dependency:{}", bundle_path),
                url: url.to_string(),
                size: entry
                    .get("size")
                    .and_then(Value::as_u64)
                    .unwrap_or_default(),
                extension,
            });
        }
    }
    specs
}

fn available_resolutions(root: &Value, kind: &str) -> Vec<ExternalStoreResolution> {
    let candidates = ["1k", "2k", "4k", "8k", "16k", "24k"];
    candidates
        .into_iter()
        .filter_map(|resolution| {
            let (specs, formats) = if kind == "hdri" {
                let formats = hdri_format_options(root, resolution);
                let specs = formats
                    .first()
                    .map(|format| hdri_specs(root, resolution, &format.id))
                    .unwrap_or_default();
                (specs, formats)
            } else if kind == "model" {
                (model_specs(root, resolution), Vec::new())
            } else {
                (texture_specs(root, resolution), Vec::new())
            };
            if specs.is_empty()
                || (kind == "texture" && !specs.iter().any(|entry| entry.role == "base-color"))
                || (kind == "model" && !specs.iter().any(|entry| entry.role == "model"))
            {
                return None;
            }
            Some(ExternalStoreResolution {
                id: resolution.to_string(),
                label: resolution.to_uppercase(),
                byte_length: specs.iter().map(|entry| entry.size).sum(),
                file_count: specs.len(),
                formats,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn get_external_store_asset_options(
    provider_id: String,
    external_id: String,
) -> Result<ExternalStoreAssetOptions, String> {
    validate_provider(&provider_id)?;
    let id = validate_external_id(&external_id)?;
    if provider_id == AMBIENT_CG_PROVIDER_ID {
        let payload = fetch_ambient_cg_json(&format!(
            "?id={}&include=type,title,url,maps,downloads,thumbnails",
            id
        ))
        .await?;
        let asset = payload
            .get("assets")
            .and_then(Value::as_array)
            .and_then(|assets| assets.first())
            .ok_or_else(|| "ambientCGにアセットが見つかりません".to_string())?;
        let kind = ambient_cg_asset_kind(asset.get("type"));
        if !matches!(kind, "hdri" | "texture") {
            return Err(
                "この種類はまだXRift Studioへインストールできません（glTF形式のModelのみ対応）"
                    .to_string(),
            );
        }
        return Ok(ExternalStoreAssetOptions {
            provider_id,
            external_id: id.to_string(),
            asset_kind: kind.to_string(),
            resolutions: ambient_cg_resolutions(asset, kind),
        });
    }
    let catalog = fetch_poly_haven_json("/assets").await?;
    let kind = asset_kind(catalog.get(id).and_then(|entry| entry.get("type")));
    if !matches!(kind, "hdri" | "texture" | "model") {
        return Err("この種類はまだXRift Studioへインストールできません".to_string());
    }
    let files = fetch_poly_haven_json(&format!("/files/{}", id)).await?;
    Ok(ExternalStoreAssetOptions {
        provider_id,
        external_id: id.to_string(),
        asset_kind: kind.to_string(),
        resolutions: available_resolutions(&files, kind),
    })
}

fn validate_download_url(provider_id: &str, value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "ダウンロードURLが不正です".to_string())?;
    let allowed = match provider_id {
        POLY_HAVEN_PROVIDER_ID => {
            url.scheme() == "https" && url.host_str() == Some("dl.polyhaven.org")
        }
        AMBIENT_CG_PROVIDER_ID => {
            url.scheme() == "https"
                && url.host_str() == Some("ambientcg.com")
                && url.path() == "/get"
                && url
                    .query_pairs()
                    .any(|(key, value)| key == "file" && !value.is_empty())
        }
        _ => false,
    };
    if !allowed {
        return Err("許可されていないダウンロード先です".to_string());
    }
    Ok(url)
}

async fn download_to(
    provider_id: &str,
    path: &Path,
    spec: &DownloadSpec,
) -> Result<(u64, String), String> {
    let url = validate_download_url(provider_id, &spec.url)?;
    let response = external_store_client()?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("アセットをダウンロードできませんでした: {}", error))?;
    if !response.status().is_success() {
        return Err(format!(
            "ダウンロードに失敗しました ({})",
            response.status()
        ));
    }
    let final_url = response.url().clone();
    validate_download_url(provider_id, final_url.as_str())?;
    let mut file = tokio::fs::File::create(path)
        .await
        .map_err(|error| error.to_string())?;
    let mut stream = response.bytes_stream();
    let mut digest = Sha256::new();
    let mut size = 0u64;
    let mut prefix = Vec::with_capacity(16);
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|error| error.to_string())?;
        size = size.saturating_add(bytes.len() as u64);
        if size > 768 * 1024 * 1024 {
            return Err("外部アセットが許可サイズを超えています".to_string());
        }
        let remaining_prefix = 16usize.saturating_sub(prefix.len());
        prefix.extend_from_slice(&bytes[..bytes.len().min(remaining_prefix)]);
        digest.update(&bytes);
        file.write_all(&bytes)
            .await
            .map_err(|error| error.to_string())?;
    }
    file.flush().await.map_err(|error| error.to_string())?;
    if size == 0 {
        return Err("ダウンロードしたファイルが空です".to_string());
    }
    if matches!(spec.extension.as_str(), "hdr" | "exr")
        && !has_environment_file_signature(&prefix, &spec.extension)
    {
        return Err(format!(
            "ダウンロードした{}ファイルの形式を確認できませんでした",
            spec.extension.to_ascii_uppercase()
        ));
    }
    Ok((size, format!("{:x}", digest.finalize())))
}

fn has_environment_file_signature(bytes: &[u8], format: &str) -> bool {
    match format {
        "hdr" => bytes.starts_with(b"#?RADIANCE") || bytes.starts_with(b"#?RGBE"),
        "exr" => bytes.starts_with(&[0x76, 0x2f, 0x31, 0x01]),
        _ => false,
    }
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let mut digest = Sha256::new();
    digest.update(bytes);
    Ok(format!("{:x}", digest.finalize()))
}

type StagedDownload = (PathBuf, PathBuf, u64, String, String);

fn commit_staged_downloads(
    project_root: &Path,
    staged: BTreeMap<String, StagedDownload>,
) -> Result<Vec<ExternalStoreInstalledFile>, String> {
    // Reject collisions before moving any staged file into the project.
    for (relative, _, _, sha256, _) in staged.values() {
        let target = project_root.join(relative);
        if !target.exists() {
            continue;
        }
        let metadata = std::fs::symlink_metadata(&target).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("外部アセットの保存先が通常ファイルではありません".to_string());
        }
        if file_sha256(&target)? != *sha256 {
            return Err("同じ保存先に異なる内容のファイルがあります".to_string());
        }
    }

    let mut installed = Vec::new();
    for (role, (relative, temporary, byte_length, sha256, format)) in staged {
        let target = project_root.join(&relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        if target.exists() {
            std::fs::remove_file(&temporary).map_err(|error| error.to_string())?;
        } else {
            std::fs::rename(&temporary, &target).map_err(|error| error.to_string())?;
        }
        installed.push(ExternalStoreInstalledFile {
            role,
            relative_path: relative.to_string_lossy().replace('\\', "/"),
            byte_length,
            sha256,
            format,
        });
    }
    Ok(installed)
}

fn zip_member_is_safe(name: &str) -> bool {
    let path = Path::new(name);
    !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
}

fn ambient_cg_member_match(name: &str, kind: &str, format: &str) -> Option<(String, String, u8)> {
    if !zip_member_is_safe(name) {
        return None;
    }
    let file_name = Path::new(name).file_name()?.to_str()?.to_ascii_lowercase();
    let extension = Path::new(&file_name).extension()?.to_str()?.to_string();
    if kind == "hdri" {
        return (extension == format).then(|| ("environment".to_string(), extension, 0));
    }
    if kind != "texture" || !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
        return None;
    }
    if file_name.contains("_color.") {
        return Some(("base-color".to_string(), extension, 0));
    }
    if file_name.contains("_normalgl.") {
        return Some(("normal".to_string(), extension, 0));
    }
    if file_name.contains("_normaldx.") {
        return Some(("normal".to_string(), extension, 1));
    }
    None
}

fn extract_ambient_cg_files(
    archive_path: &Path,
    staging_root: &Path,
    kind: &str,
    format: &str,
) -> Result<Vec<(String, PathBuf, u64, String, String)>, String> {
    let file = std::fs::File::open(archive_path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("ambientCGのZIPを読み取れませんでした: {}", error))?;
    let mut matches = BTreeMap::<String, (usize, u8, String)>::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("ambientCGのZIPを検証できませんでした: {}", error))?;
        if entry.is_dir() {
            continue;
        }
        if !zip_member_is_safe(entry.name()) {
            return Err("ambientCGのZIPに安全でないファイルパスがあります".to_string());
        }
        if let Some((role, extension, priority)) =
            ambient_cg_member_match(entry.name(), kind, format)
        {
            let replace = matches
                .get(&role)
                .is_none_or(|(_, current_priority, _)| priority < *current_priority);
            if replace {
                matches.insert(role, (index, priority, extension));
            }
        }
    }
    if matches.is_empty() {
        return Err("選択した解像度のZIPに対応ファイルがありません".to_string());
    }
    let mut extracted = Vec::new();
    for (role, (index, _, extension)) in matches {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("ambientCGのZIPファイルを開けませんでした: {}", error))?;
        let temporary = staging_root.join(format!("extracted_{}.{}", role, extension));
        let mut output = std::fs::File::create(&temporary).map_err(|error| error.to_string())?;
        let byte_length =
            std::io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
        if byte_length == 0 || byte_length > 768 * 1024 * 1024 {
            return Err("ambientCGから展開したファイルが許可サイズ外です".to_string());
        }
        output.flush().map_err(|error| error.to_string())?;
        let sha256 = file_sha256(&temporary)?;
        extracted.push((role, temporary, byte_length, sha256, extension));
    }
    Ok(extracted)
}

fn model_dependency_mime(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "ktx2" => "image/ktx2",
        _ => "application/octet-stream",
    }
}

async fn install_ambient_cg_asset(
    project_path: String,
    request: ExternalStoreInstallRequest,
) -> Result<ExternalStoreInstallResult, String> {
    let id = validate_external_id(&request.external_id)?.to_string();
    let resolution = request.resolution.trim().to_ascii_lowercase();
    let payload = fetch_ambient_cg_json(&format!(
        "?id={}&include=type,title,url,maps,downloads,thumbnails",
        id
    ))
    .await?;
    let metadata = payload
        .get("assets")
        .and_then(Value::as_array)
        .and_then(|assets| assets.first())
        .ok_or_else(|| "ambientCGにアセットが見つかりません".to_string())?;
    let kind = ambient_cg_asset_kind(metadata.get("type"));
    if kind == "model" {
        return Err(
            "ambientCGのModelはOBJなどの形式のため、現在はHDRIとMaterialのみインストールできます"
                .to_string(),
        );
    }
    if !matches!(kind, "hdri" | "texture") {
        return Err("この種類はまだXRift Studioへインストールできません".to_string());
    }
    let downloads = ambient_cg_downloads(metadata);
    let download = if kind == "hdri" {
        ambient_cg_hdri_download(&downloads, &resolution)
    } else {
        ambient_cg_texture_download(&downloads, &resolution)
    }
    .ok_or_else(|| "選択した解像度のダウンロードがありません".to_string())?;
    let format = if kind == "hdri" {
        let format = request
            .format
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("exr")
            .to_ascii_lowercase();
        if !matches!(format.as_str(), "hdr" | "exr") {
            return Err("Skyboxのファイル形式が不正です".to_string());
        }
        format
    } else {
        if request
            .format
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
        {
            return Err("MaterialではSkyboxのファイル形式を指定できません".to_string());
        }
        String::new()
    };

    let project_root = super::canonical_project_root(&project_path)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let staging_relative = PathBuf::from(".cache")
        .join("xrift-studio-external-store")
        .join(format!("{}-{}", id, timestamp));
    super::ensure_no_symlink_ancestors(&project_root, &staging_relative)?;
    let staging_root = project_root.join(&staging_relative);
    std::fs::create_dir_all(&staging_root).map_err(|error| error.to_string())?;

    let result = async {
        let archive_path = staging_root.join("ambient-cg-download.zip");
        let archive_spec = DownloadSpec {
            role: "archive".to_string(),
            url: download.url.clone(),
            size: download.size,
            extension: "zip".to_string(),
        };
        download_to(AMBIENT_CG_PROVIDER_ID, &archive_path, &archive_spec).await?;
        let extracted = extract_ambient_cg_files(&archive_path, &staging_root, kind, &format)?;
        let mut staged = BTreeMap::<String, StagedDownload>::new();
        for (role, temporary, byte_length, sha256, extension) in extracted {
            let file_name = format!("{}_{}_{}.{}", id, role, resolution, extension);
            let relative = PathBuf::from("assets")
                .join("imported")
                .join("external")
                .join(AMBIENT_CG_PROVIDER_ID)
                .join(&id)
                .join(&file_name);
            super::ensure_no_symlink_ancestors(&project_root, &relative)?;
            staged.insert(role, (relative, temporary, byte_length, sha256, extension));
        }
        commit_staged_downloads(&project_root, staged)
    }
    .await;
    let _ = std::fs::remove_dir_all(&staging_root);
    let installed = result?;
    let asset_url = metadata
        .get("url")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("https://ambientcg.com/a/{}", id));

    Ok(ExternalStoreInstallResult {
        provider_id: AMBIENT_CG_PROVIDER_ID.to_string(),
        provider_name: "ambientCG".to_string(),
        external_id: id.clone(),
        name: metadata
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or(&id)
            .to_string(),
        asset_kind: kind.to_string(),
        resolution,
        files: installed,
        authors: vec!["ambientCG contributors".to_string()],
        asset_url,
        license_name: "CC0 1.0".to_string(),
        license_url: "https://creativecommons.org/publicdomain/zero/1.0/".to_string(),
    })
}

fn embed_model_uri(
    uri: &mut Value,
    dependencies: &BTreeMap<String, PathBuf>,
) -> Result<(), String> {
    let Some(value) = uri.as_str() else {
        return Err("glTFの外部参照URIが不正です".to_string());
    };
    if value.starts_with("data:") {
        return Ok(());
    }
    let normalized = value.strip_prefix("./").unwrap_or(value);
    let safe = model_bundle_path(normalized)?;
    let path = dependencies
        .get(&safe)
        .ok_or_else(|| format!("glTFの依存ファイルが見つかりません: {}", safe))?;
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    *uri = Value::String(format!(
        "data:{};base64,{}",
        model_dependency_mime(&safe),
        encoded
    ));
    Ok(())
}

fn make_model_self_contained(staged: &mut BTreeMap<String, StagedDownload>) -> Result<(), String> {
    let main_path = staged
        .get("model")
        .map(|entry| entry.1.clone())
        .ok_or_else(|| "glTF本体が見つかりません".to_string())?;
    let mut document: Value =
        serde_json::from_slice(&std::fs::read(&main_path).map_err(|error| error.to_string())?)
            .map_err(|_| "ダウンロードしたglTF JSONが不正です".to_string())?;
    let version = document
        .get("asset")
        .and_then(|asset| asset.get("version"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !version.starts_with("2.") {
        return Err("Poly Haven modelがglTF 2.xではありません".to_string());
    }
    let dependencies = staged
        .iter()
        .filter_map(|(role, entry)| {
            role.strip_prefix("dependency:")
                .map(|path| (path.to_string(), entry.1.clone()))
        })
        .collect::<BTreeMap<_, _>>();
    for collection in ["buffers", "images"] {
        if let Some(entries) = document.get_mut(collection).and_then(Value::as_array_mut) {
            for entry in entries {
                if let Some(uri) = entry.get_mut("uri") {
                    embed_model_uri(uri, &dependencies)?;
                }
            }
        }
    }
    let bytes = serde_json::to_vec(&document).map_err(|error| error.to_string())?;
    if bytes.len() > 768 * 1024 * 1024 {
        return Err("自己完結glTFが許可サイズを超えています".to_string());
    }
    std::fs::write(&main_path, &bytes).map_err(|error| error.to_string())?;
    let main = staged
        .get_mut("model")
        .ok_or_else(|| "glTF本体が見つかりません".to_string())?;
    main.2 = bytes.len() as u64;
    main.3 = file_sha256(&main_path)?;
    staged.retain(|role, _| role == "model");
    Ok(())
}

#[tauri::command]
pub async fn install_external_store_asset(
    project_path: String,
    request: ExternalStoreInstallRequest,
) -> Result<ExternalStoreInstallResult, String> {
    validate_provider(&request.provider_id)?;
    if request.provider_id == AMBIENT_CG_PROVIDER_ID {
        return install_ambient_cg_asset(project_path, request).await;
    }
    let id = validate_external_id(&request.external_id)?.to_string();
    let resolution = request.resolution.trim().to_ascii_lowercase();
    if !matches!(
        resolution.as_str(),
        "1k" | "2k" | "4k" | "8k" | "16k" | "24k"
    ) {
        return Err("解像度が不正です".to_string());
    }

    let catalog = fetch_poly_haven_json("/assets").await?;
    let metadata = catalog
        .get(&id)
        .ok_or_else(|| "Poly Havenにアセットが見つかりません".to_string())?;
    let kind = asset_kind(metadata.get("type"));
    if !matches!(kind, "hdri" | "texture" | "model") {
        return Err("この種類はまだXRift Studioへインストールできません".to_string());
    }
    let files = fetch_poly_haven_json(&format!("/files/{}", id)).await?;
    let specs = if kind == "hdri" {
        let format = request
            .format
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("hdr")
            .to_ascii_lowercase();
        if !matches!(format.as_str(), "hdr" | "exr") {
            return Err("Skyboxのファイル形式が不正です".to_string());
        }
        hdri_specs(&files, &resolution, &format)
    } else if kind == "texture" {
        if request
            .format
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
        {
            return Err("MaterialではSkyboxのファイル形式を指定できません".to_string());
        }
        texture_specs(&files, &resolution)
    } else {
        if request
            .format
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
        {
            return Err("Modelではファイル形式を指定できません".to_string());
        }
        model_specs(&files, &resolution)
    };
    if specs.is_empty()
        || (kind == "texture" && !specs.iter().any(|entry| entry.role == "base-color"))
        || (kind == "model" && !specs.iter().any(|entry| entry.role == "model"))
    {
        return Err("選択した解像度のファイルがありません".to_string());
    }

    let project_root = super::canonical_project_root(&project_path)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let staging_relative = PathBuf::from(".cache")
        .join("xrift-studio-external-store")
        .join(format!("{}-{}", id, timestamp));
    super::ensure_no_symlink_ancestors(&project_root, &staging_relative)?;
    let staging_root = project_root.join(&staging_relative);
    std::fs::create_dir_all(&staging_root).map_err(|error| error.to_string())?;

    let result = async {
        let mut installed = Vec::new();
        let mut staged = BTreeMap::<String, StagedDownload>::new();
        for (index, spec) in specs.iter().enumerate() {
            let file_name = if kind == "model" && spec.role == "model" {
                format!("{}_model_{}.gltf", id, resolution)
            } else if kind == "model" {
                format!("{}_dependency_{}.{}", id, index, spec.extension)
            } else {
                format!("{}_{}_{}.{}", id, spec.role, resolution, spec.extension)
            };
            let relative = PathBuf::from("assets")
                .join("imported")
                .join("external")
                .join(POLY_HAVEN_PROVIDER_ID)
                .join(&id)
                .join(&file_name);
            super::ensure_no_symlink_ancestors(&project_root, &relative)?;
            let temporary = staging_root.join(format!("download_{}.{}", index, spec.extension));
            let (byte_length, sha256) =
                download_to(POLY_HAVEN_PROVIDER_ID, &temporary, spec).await?;
            staged.insert(
                spec.role.to_string(),
                (
                    relative,
                    temporary,
                    byte_length,
                    sha256,
                    spec.extension.clone(),
                ),
            );
        }
        if kind == "model" {
            make_model_self_contained(&mut staged)?;
        }

        // Reject collisions before moving any staged file into the project.
        for (relative, _, _, sha256, _) in staged.values() {
            let target = project_root.join(relative);
            if !target.exists() {
                continue;
            }
            let metadata = std::fs::symlink_metadata(&target).map_err(|error| error.to_string())?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err("外部アセットの保存先が通常ファイルではありません".to_string());
            }
            if file_sha256(&target)? != *sha256 {
                return Err("同じ保存先に異なる内容のファイルがあります".to_string());
            }
        }

        for (role, (relative, temporary, byte_length, sha256, format)) in staged {
            let target = project_root.join(&relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            if target.exists() {
                std::fs::remove_file(&temporary).map_err(|error| error.to_string())?;
            } else {
                std::fs::rename(&temporary, &target).map_err(|error| error.to_string())?;
            }
            installed.push(ExternalStoreInstalledFile {
                role,
                relative_path: relative.to_string_lossy().replace('\\', "/"),
                byte_length,
                sha256,
                format,
            });
        }
        Ok::<_, String>(installed)
    }
    .await;
    let _ = std::fs::remove_dir_all(&staging_root);
    let installed = result?;

    Ok(ExternalStoreInstallResult {
        provider_id: POLY_HAVEN_PROVIDER_ID.to_string(),
        provider_name: "Poly Haven".to_string(),
        external_id: id.clone(),
        name: metadata
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(&id)
            .to_string(),
        asset_kind: kind.to_string(),
        resolution,
        files: installed,
        authors: author_names(metadata.get("authors")),
        asset_url: format!("https://polyhaven.com/a/{}", id),
        license_name: "CC0 1.0".to_string(),
        license_url: "https://creativecommons.org/publicdomain/zero/1.0/".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn texture_bundle_selects_gltf_pbr_maps() {
        let files: Value = serde_json::json!({
            "Diffuse": { "1k": { "jpg": { "url": "https://dl.polyhaven.org/diff.jpg", "size": 10 } } },
            "nor_gl": { "1k": { "jpg": { "url": "https://dl.polyhaven.org/normal.jpg", "size": 20 } } },
            "arm": { "1k": { "jpg": { "url": "https://dl.polyhaven.org/arm.jpg", "size": 30 } } }
        });
        let specs = texture_specs(&files, "1k");
        assert_eq!(
            specs
                .iter()
                .map(|entry| entry.role.as_str())
                .collect::<Vec<_>>(),
            vec!["base-color", "normal", "arm"]
        );
        let resolutions = available_resolutions(&files, "texture");
        assert_eq!(resolutions.len(), 1);
        assert_eq!(resolutions[0].byte_length, 60);
        assert_eq!(resolutions[0].file_count, 3);
        assert!(resolutions[0].formats.is_empty());
    }

    #[test]
    fn hdri_resolution_exposes_hdr_and_exr_as_separate_skybox_formats() {
        let files: Value = serde_json::json!({
            "hdri": {
                "1k": {
                    "hdr": { "url": "https://dl.polyhaven.org/environment.hdr", "size": 10 },
                    "exr": { "url": "https://dl.polyhaven.org/environment.exr", "size": 8 }
                }
            }
        });
        let resolutions = available_resolutions(&files, "hdri");
        assert_eq!(resolutions.len(), 1);
        assert_eq!(resolutions[0].formats.len(), 2);
        assert_eq!(resolutions[0].formats[0].id, "hdr");
        assert_eq!(resolutions[0].formats[0].byte_length, 10);
        assert_eq!(resolutions[0].formats[1].id, "exr");
        assert_eq!(resolutions[0].formats[1].byte_length, 8);
        assert_eq!(hdri_specs(&files, "1k", "exr")[0].extension, "exr");
    }

    #[test]
    fn environment_file_signatures_reject_html_fallbacks() {
        assert!(has_environment_file_signature(b"#?RADIANCE\n", "hdr"));
        assert!(has_environment_file_signature(
            &[0x76, 0x2f, 0x31, 0x01],
            "exr"
        ));
        assert!(!has_environment_file_signature(b"<!doctype html>", "hdr"));
        assert!(!has_environment_file_signature(b"<!doctype html>", "exr"));
    }

    #[test]
    fn download_domain_is_restricted_to_provider_domains() {
        assert!(
            validate_download_url(POLY_HAVEN_PROVIDER_ID, "https://dl.polyhaven.org/file.hdr")
                .is_ok()
        );
        assert!(
            validate_download_url(POLY_HAVEN_PROVIDER_ID, "http://dl.polyhaven.org/file.hdr")
                .is_err()
        );
        assert!(
            validate_download_url(POLY_HAVEN_PROVIDER_ID, "https://example.com/file.hdr").is_err()
        );
        assert!(validate_download_url(
            AMBIENT_CG_PROVIDER_ID,
            "https://ambientcg.com/get?file=Ground106_1K-JPG.zip"
        )
        .is_ok());
        assert!(validate_download_url(
            AMBIENT_CG_PROVIDER_ID,
            "https://ambientcg.com/api/v3/assets"
        )
        .is_err());
    }

    #[test]
    fn ambient_cg_downloads_group_by_resolution_and_prefer_jpg() {
        let asset: Value = serde_json::json!({
            "type": "material",
            "maps": ["color", "normal"],
            "downloads": [
                { "attributes": "1K-PNG", "extension": "zip", "url": "https://ambientcg.com/get?file=one.png.zip", "size": 20 },
                { "attributes": "1K-JPG", "extension": "zip", "url": "https://ambientcg.com/get?file=one.jpg.zip", "size": 10 },
                { "attributes": "2K-JPG", "extension": "zip", "url": "https://ambientcg.com/get?file=two.jpg.zip", "size": 30 }
            ]
        });
        let resolutions = ambient_cg_resolutions(&asset, "texture");
        assert_eq!(resolutions.len(), 2);
        assert_eq!(resolutions[0].id, "1k");
        assert_eq!(resolutions[0].byte_length, 10);
        assert_eq!(resolutions[0].file_count, 2);
        assert_eq!(resolutions[1].id, "2k");
    }

    #[test]
    fn ambient_cg_member_match_prefers_normal_gl_and_rejects_unsafe_paths() {
        assert_eq!(
            ambient_cg_member_match("Ground106_1K-JPG_Color.jpg", "texture", ""),
            Some(("base-color".to_string(), "jpg".to_string(), 0))
        );
        assert_eq!(
            ambient_cg_member_match("Ground106_1K-JPG_NormalGL.jpg", "texture", ""),
            Some(("normal".to_string(), "jpg".to_string(), 0))
        );
        assert_eq!(
            ambient_cg_member_match("Ground106_1K-JPG_NormalDX.jpg", "texture", ""),
            Some(("normal".to_string(), "jpg".to_string(), 1))
        );
        assert!(ambient_cg_member_match("../outside.jpg", "texture", "").is_none());
        assert!(ambient_cg_member_match("DaySkyHDRI067B_1K_HDR.exr", "hdri", "exr").is_some());
    }

    #[test]
    fn model_bundle_selects_gltf_and_dependencies() {
        let files: Value = serde_json::json!({
            "gltf": {
                "2k": {
                    "gltf": {
                        "url": "https://dl.polyhaven.org/model.gltf",
                        "size": 10,
                        "include": {
                            "model.bin": { "url": "https://dl.polyhaven.org/model.bin", "size": 20 },
                            "textures/base.jpg": { "url": "https://dl.polyhaven.org/base.jpg", "size": 30 }
                        }
                    }
                }
            }
        });
        let specs = model_specs(&files, "2k");
        assert_eq!(specs.len(), 3);
        assert_eq!(specs[0].role, "model");
        assert!(specs
            .iter()
            .any(|entry| entry.role == "dependency:model.bin"));
        assert!(specs
            .iter()
            .any(|entry| entry.role == "dependency:textures/base.jpg"));
        let resolutions = available_resolutions(&files, "model");
        assert_eq!(resolutions.len(), 1);
        assert_eq!(resolutions[0].byte_length, 60);
        assert_eq!(resolutions[0].file_count, 3);
    }

    #[test]
    fn model_bundle_rejects_parent_and_absolute_paths() {
        assert!(model_bundle_path("textures/base.jpg").is_ok());
        assert!(model_bundle_path("../secret.bin").is_err());
        assert!(model_bundle_path("/absolute.bin").is_err());
        assert!(model_bundle_path("textures\\base.jpg").is_err());
    }

    #[test]
    fn model_bundle_is_rewritten_as_self_contained_gltf() {
        let root = std::env::temp_dir().join(format!(
            "xrift-external-model-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).expect("create fixture directory");
        let main = root.join("model.gltf");
        let buffer = root.join("model.bin");
        let image = root.join("base.jpg");
        std::fs::write(
            &main,
            br#"{"asset":{"version":"2.0"},"buffers":[{"uri":"model.bin","byteLength":3}],"images":[{"uri":"textures/base.jpg"}]}"#,
        )
        .expect("write glTF");
        std::fs::write(&buffer, [1, 2, 3]).expect("write buffer");
        std::fs::write(&image, [0xff, 0xd8, 0xff]).expect("write image");
        let mut staged = BTreeMap::from([
            (
                "model".to_string(),
                (
                    PathBuf::new(),
                    main.clone(),
                    0,
                    String::new(),
                    "gltf".to_string(),
                ),
            ),
            (
                "dependency:model.bin".to_string(),
                (PathBuf::new(), buffer, 3, String::new(), "bin".to_string()),
            ),
            (
                "dependency:textures/base.jpg".to_string(),
                (PathBuf::new(), image, 3, String::new(), "jpg".to_string()),
            ),
        ]);
        make_model_self_contained(&mut staged).expect("embed dependencies");
        let rewritten = std::fs::read_to_string(&main).expect("read rewritten glTF");
        assert!(rewritten.contains("data:application/octet-stream;base64,"));
        assert!(rewritten.contains("data:image/jpeg;base64,"));
        assert_eq!(staged.len(), 1);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn model_bundle_rejects_missing_referenced_dependency() {
        let root = std::env::temp_dir().join(format!(
            "xrift-external-model-missing-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).expect("create fixture directory");
        let main = root.join("model.gltf");
        std::fs::write(
            &main,
            br#"{"asset":{"version":"2.0"},"buffers":[{"uri":"missing.bin","byteLength":3}]}"#,
        )
        .expect("write glTF");
        let mut staged = BTreeMap::from([(
            "model".to_string(),
            (PathBuf::new(), main, 0, String::new(), "gltf".to_string()),
        )]);
        assert!(make_model_self_contained(&mut staged).is_err());
        let _ = std::fs::remove_dir_all(&root);
    }
}
