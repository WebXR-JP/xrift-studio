//! Bounded, need-based reads of public store metadata. No account data enters
//! this cache, and no detached task survives a cancelled authoring request.
use super::{select_asset_candidates, ChatgptAssetOptions};
use crate::external_store::ExternalStoreAsset;
use std::{
    collections::HashMap,
    future::Future,
    sync::{Arc, OnceLock},
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

type Catalog = Arc<Vec<ExternalStoreAsset>>;
type Entry = Arc<Mutex<Option<(Instant, Catalog)>>>;
const CACHE_TTL: Duration = Duration::from_secs(600);
const MAX_CATALOG_ROWS: usize = 50_000;

#[derive(Default)]
struct PublicCatalogCache {
    entries: Mutex<HashMap<String, Entry>>,
}

impl PublicCatalogCache {
    async fn get_or_load<F, Fut>(
        &self,
        provider: &str,
        ttl: Duration,
        load: F,
    ) -> Result<Catalog, String>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<Vec<ExternalStoreAsset>, String>>,
    {
        // The finite provider set also bounds cache keys and concurrent HTTP
        // reads. The global map lock never spans a network await.
        if !matches!(
            provider,
            "poly-haven" | "ambient-cg" | "ai-lowpoly-props" | "otogura"
        ) {
            return Err("素材の配布元を確認できませんでした".into());
        }
        let entry = self
            .entries
            .lock()
            .await
            .entry(provider.into())
            .or_insert_with(|| Arc::new(Mutex::new(None)))
            .clone();
        let mut current = entry.lock().await;
        if let Some((fetched_at, catalog)) = current.as_ref() {
            if fetched_at.elapsed() < ttl {
                return Ok(catalog.clone());
            }
        }
        // Only the first waiter fetches this provider. A failure or a dropped
        // request releases this lock without publishing partial/stale data;
        // the next caller can retry. Different providers remain independent.
        let assets = load().await?;
        if assets.len() > MAX_CATALOG_ROWS {
            return Err("素材の検索結果を確認できませんでした".into());
        }
        let catalog = Arc::new(assets);
        *current = Some((Instant::now(), catalog.clone()));
        Ok(catalog)
    }
}

static PUBLIC_CATALOG_CACHE: OnceLock<PublicCatalogCache> = OnceLock::new();

pub(super) async fn cached_public_catalog(provider: &str) -> Result<Catalog, String> {
    let cache = PUBLIC_CATALOG_CACHE.get_or_init(PublicCatalogCache::default);
    // Credentials, account-specific model capabilities, Scene data and model
    // responses are deliberately outside this public-metadata-only cache.
    cache
        .get_or_load(provider, CACHE_TTL, || async {
            tokio::time::timeout(Duration::from_secs(30), async {
                if provider == "ai-lowpoly-props" {
                    super::list_ai_lowpoly_catalog().await
                } else {
                    crate::external_store::list_external_store_assets(provider.into()).await
                }
            })
            .await
            .map_err(|_| "素材の検索が時間切れになりました。再試行してください".to_string())?
        })
        .await
}

fn initial_catalog_providers(options: &ChatgptAssetOptions) -> Vec<&'static str> {
    let mut providers = Vec::with_capacity(2);
    if options.models || options.materials {
        providers.push("poly-haven");
    }
    if options.audio {
        providers.push("otogura");
    }
    providers
}

pub(super) async fn retrieve_initial_catalog_candidates(
    options: &ChatgptAssetOptions,
) -> Result<Vec<ExternalStoreAsset>, String> {
    // Legacy callers need at most two independent catalogs. Settle both in a
    // fixed order before returning; do not spawn work or return partial success.
    let results = futures_util::future::join_all(
        initial_catalog_providers(options)
            .into_iter()
            .map(cached_public_catalog),
    )
    .await;
    let mut assets = Vec::new();
    for result in results {
        assets.extend(result?.iter().cloned());
    }
    Ok(select_asset_candidates(assets, options))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn asset(id: &str, provider: &str) -> ExternalStoreAsset {
        ExternalStoreAsset {
            provider_id: provider.into(),
            external_id: id.into(),
            name: id.into(),
            description: "public catalog fixture".into(),
            category: "test".into(),
            tags: vec![],
            thumbnail_url: String::new(),
            asset_kind: if provider == "otogura" {
                "audio"
            } else {
                "model"
            }
            .into(),
            max_resolution: None,
            polycount: None,
            dimensions_mm: None,
            download_count: 0,
            authors: vec![],
            asset_url: String::new(),
            license_name: "CC0 1.0".into(),
            license_url: String::new(),
        }
    }

    #[tokio::test]
    async fn simultaneous_catalog_misses_share_one_complete_result() {
        let cache = PublicCatalogCache::default();
        let calls = AtomicUsize::new(0);
        let read = || {
            cache.get_or_load("poly-haven", CACHE_TTL, || async {
                calls.fetch_add(1, Ordering::SeqCst);
                tokio::task::yield_now().await;
                Ok(vec![
                    asset("first", "poly-haven"),
                    asset("second", "poly-haven"),
                ])
            })
        };
        let (first, second, third) = tokio::join!(read(), read(), read());
        let first = first.unwrap();
        assert!(Arc::ptr_eq(&first, &second.unwrap()));
        assert!(Arc::ptr_eq(&first, &third.unwrap()));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            first
                .iter()
                .map(|a| a.external_id.as_str())
                .collect::<Vec<_>>(),
            ["first", "second"]
        );
    }

    #[tokio::test]
    async fn different_providers_load_independently() {
        let cache = PublicCatalogCache::default();
        let both_started = tokio::sync::Barrier::new(2);
        let read = |provider| {
            cache.get_or_load(provider, CACHE_TTL, || async {
                both_started.wait().await;
                Ok(vec![asset("same-id", provider)])
            })
        };
        let (models, audio) = tokio::time::timeout(Duration::from_secs(2), async {
            tokio::join!(read("poly-haven"), read("otogura"))
        })
        .await
        .expect("a global cache lock must not serialize independent providers");
        assert_eq!(models.unwrap()[0].provider_id, "poly-haven");
        assert_eq!(audio.unwrap()[0].provider_id, "otogura");
    }

    #[tokio::test]
    async fn failed_and_expired_reads_retry_without_serving_stale_data() {
        let cache = PublicCatalogCache::default();
        assert!(cache
            .get_or_load("poly-haven", CACHE_TTL, || async { Err("offline".into()) })
            .await
            .is_err());
        let first = cache
            .get_or_load("poly-haven", CACHE_TTL, || async {
                Ok(vec![asset("original", "poly-haven")])
            })
            .await
            .unwrap();
        assert!(cache
            .get_or_load("poly-haven", Duration::ZERO, || async {
                Err("expired refresh failed".into())
            })
            .await
            .is_err());
        let refreshed = cache
            .get_or_load("poly-haven", Duration::ZERO, || async {
                Ok(vec![asset("updated", "poly-haven")])
            })
            .await
            .unwrap();
        assert_eq!(first[0].external_id, "original");
        assert_eq!(refreshed[0].external_id, "updated");
    }

    #[tokio::test]
    async fn cancelled_loader_releases_waiters_without_orphan_fetch_or_partial_cache() {
        struct DropNotice(Arc<AtomicUsize>);
        impl Drop for DropNotice {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }
        let cache = Arc::new(PublicCatalogCache::default());
        let dropped = Arc::new(AtomicUsize::new(0));
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let worker = tokio::spawn({
            let cache = cache.clone();
            let dropped = dropped.clone();
            async move {
                cache
                    .get_or_load("poly-haven", CACHE_TTL, || async {
                        let _notice = DropNotice(dropped);
                        let _ = started_tx.send(());
                        std::future::pending::<Result<Vec<ExternalStoreAsset>, String>>().await
                    })
                    .await
            }
        });
        started_rx.await.unwrap();
        worker.abort();
        assert!(worker.await.unwrap_err().is_cancelled());
        assert_eq!(
            dropped.load(Ordering::SeqCst),
            1,
            "cancellation drops the HTTP future, with no detached fetch"
        );
        let replacement = tokio::time::timeout(
            Duration::from_secs(2),
            cache.get_or_load("poly-haven", CACHE_TTL, || async {
                Ok(vec![asset("replacement", "poly-haven")])
            }),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(replacement[0].external_id, "replacement");
    }

    #[tokio::test]
    async fn unknown_provider_does_not_dispatch_or_allocate_a_cache_entry() {
        let cache = PublicCatalogCache::default();
        assert!(cache
            .get_or_load("unknown-provider", CACHE_TTL, || async {
                panic!("unknown catalog cannot dispatch");
            })
            .await
            .is_err());
        assert!(cache.entries.lock().await.is_empty());
    }

    #[test]
    fn legacy_catalog_reads_only_enabled_providers_and_keeps_candidate_selection() {
        let options = |models, materials, audio| ChatgptAssetOptions {
            models,
            materials,
            audio,
        };
        assert!(initial_catalog_providers(&options(false, false, false)).is_empty());
        assert_eq!(
            initial_catalog_providers(&options(true, false, false)),
            ["poly-haven"]
        );
        assert_eq!(
            initial_catalog_providers(&options(false, true, false)),
            ["poly-haven"]
        );
        assert_eq!(
            initial_catalog_providers(&options(false, false, true)),
            ["otogura"]
        );
        assert_eq!(
            initial_catalog_providers(&options(true, true, true)),
            ["poly-haven", "otogura"]
        );
        let candidates = select_asset_candidates(
            vec![
                asset("second", "poly-haven"),
                asset("first", "poly-haven"),
                asset("sound", "otogura"),
            ],
            &options(true, false, true),
        );
        assert_eq!(
            candidates
                .iter()
                .map(|a| a.external_id.as_str())
                .collect::<Vec<_>>(),
            ["first", "second", "sound"]
        );
    }
}
