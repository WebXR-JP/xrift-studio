use semver::Version;
use std::path::Path;

// Versions verified together for Studio's first-run setup. Optional CLI
// updates may install a newer stable release without lowering this baseline.
pub const NODE_VERSION: &str = "24.21.0";
pub const XRIFT_CLI_VERSION: &str = "0.24.4";

pub fn node_distribution(platform: &str) -> String {
    format!("node-v{NODE_VERSION}-{platform}")
}

pub fn cli_version_supported(version: &str) -> bool {
    let Ok(version) = Version::parse(version) else {
        return false;
    };
    version.pre.is_empty()
        && version >= Version::parse(XRIFT_CLI_VERSION).expect("valid bundled CLI version")
}

// A stale npm shim alone is not an installed CLI. Check the published package
// and its actual Node entry point, including when a previous install failed.
pub fn installed_cli_version(entry: &Path) -> Option<String> {
    if !entry.is_file() {
        return None;
    }
    cli_manifest_version(entry)
}

// Keep the recorded version available during repair, even if its entry was
// deleted. A missing entry in a newer release must not select an older one.
pub fn cli_manifest_version(entry: &Path) -> Option<String> {
    let package_root = entry.parent()?.parent()?;
    let manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(package_root.join("package.json")).ok()?).ok()?;
    if manifest.get("name")?.as_str()? != "@xrift/cli" {
        return None;
    }
    let bin = manifest.get("bin")?.get("xrift")?.as_str()?;
    if bin != "dist/index.js" && bin != "./dist/index.js" {
        return None;
    }
    let version = manifest.get("version")?.as_str()?;
    Version::parse(version).ok()?;
    Some(version.to_owned())
}

pub fn cli_version_output_matches(output: &str, version: &str) -> bool {
    // The official CLI can print an update notice before --version, including
    // when the notice came from its local version cache rather than a request.
    output.lines().any(|line| line.trim() == version)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "xrift-cli-installation-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir_all(root.join("dist")).unwrap();
            Self(root)
        }

        fn write(&self, version: &str) -> PathBuf {
            std::fs::write(
                self.0.join("package.json"),
                serde_json::json!({
                    "name": "@xrift/cli", "version": version,
                    "bin": { "xrift": "dist/index.js" }
                })
                .to_string(),
            )
            .unwrap();
            let entry = self.0.join("dist/index.js");
            std::fs::write(&entry, "// isolated installation fixture").unwrap();
            entry
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn supported_cli_releases_keep_newer_versions_and_reject_old_or_prerelease() {
        for version in [
            XRIFT_CLI_VERSION,
            "0.24.5",
            "0.25.0",
            "1.0.0",
            "0.24.4+build.1",
        ] {
            assert!(cli_version_supported(version), "{version}");
        }
        for version in [
            "0.24.3",
            "0.9.0",
            "0.24.4-rc.1",
            "0.25.0-beta.1",
            "latest",
            "",
        ] {
            assert!(!cli_version_supported(version), "{version}");
        }
    }

    #[test]
    fn installation_reads_actual_manifest_version() {
        let fixture = Fixture::new();
        for version in ["0.24.3", XRIFT_CLI_VERSION, "0.25.0"] {
            let entry = fixture.write(version);
            assert_eq!(installed_cli_version(&entry).as_deref(), Some(version));
        }
    }

    #[test]
    fn missing_entry_or_broken_manifest_requires_repair() {
        let fixture = Fixture::new();
        let entry = fixture.write(XRIFT_CLI_VERSION);
        std::fs::remove_file(&entry).unwrap();
        assert!(installed_cli_version(&entry).is_none());
        assert_eq!(cli_manifest_version(&entry).as_deref(), Some(XRIFT_CLI_VERSION));
        fixture.write(XRIFT_CLI_VERSION);
        for manifest in [
            "not json",
            r#"{"name":"other","version":"0.24.4","bin":{"xrift":"dist/index.js"}}"#,
            r#"{"name":"@xrift/cli","version":"latest","bin":{"xrift":"dist/index.js"}}"#,
            r#"{"name":"@xrift/cli","version":"0.24.4","bin":{"xrift":"dist/cli.js"}}"#,
        ] {
            std::fs::write(fixture.0.join("package.json"), manifest).unwrap();
            assert!(installed_cli_version(&entry).is_none(), "{manifest}");
        }
        std::fs::remove_file(fixture.0.join("package.json")).unwrap();
        assert!(installed_cli_version(&entry).is_none());
    }

    #[test]
    fn version_output_accepts_update_notices_but_requires_the_running_version() {
        assert!(cli_version_output_matches("0.24.4\n", XRIFT_CLI_VERSION));
        assert!(cli_version_output_matches(
            "\nUpdate available: 0.24.4 → 0.25.0\nRun npm install -g @xrift/cli\n\n0.24.4\n",
            XRIFT_CLI_VERSION,
        ));
        assert!(!cli_version_output_matches("Update available: 0.24.4 → 0.25.0", XRIFT_CLI_VERSION));
        assert!(!cli_version_output_matches("0.24.3\n", XRIFT_CLI_VERSION));
    }

    #[test]
    fn broken_newer_install_retains_its_version_for_repair() {
        let fixture = Fixture::new();
        let entry = fixture.write("0.25.0");
        std::fs::remove_file(entry).unwrap();
        assert_eq!(cli_manifest_version(&fixture.0.join("dist/index.js")).as_deref(), Some("0.25.0"));
    }
}
