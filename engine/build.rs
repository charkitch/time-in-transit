use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use content_types::{GameEvent, SystemEntryDialog, TriggerFile};

struct EventPoolSpec {
    dir: &'static str,
    variant: &'static str,
}

const EVENT_POOLS: &[EventPoolSpec] = &[
    EventPoolSpec {
        dir: "landing",
        variant: "Landing",
    },
    EventPoolSpec {
        dir: "asteroid_base",
        variant: "AsteroidBase",
    },
    EventPoolSpec {
        dir: "oort_cloud",
        variant: "OortCloudBase",
    },
    EventPoolSpec {
        dir: "maximum_space",
        variant: "MaximumSpace",
    },
    EventPoolSpec {
        dir: "triggered",
        variant: "Triggered",
    },
    EventPoolSpec {
        dir: "system_entry",
        variant: "SystemEntry",
    },
    EventPoolSpec {
        dir: "proximity_star",
        variant: "ProximityStar",
    },
    EventPoolSpec {
        dir: "proximity_base",
        variant: "ProximityBase",
    },
    EventPoolSpec {
        dir: "planet_landing",
        variant: "PlanetLanding",
    },
    EventPoolSpec {
        dir: "dyson_landing",
        variant: "DysonLanding",
    },
    EventPoolSpec {
        dir: "topopolis_landing",
        variant: "TopopolisLanding",
    },
];

fn walk_yaml_files(root: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(root)
        .map_err(|e| format!("Failed to read directory {}: {}", root.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        if path.is_dir() {
            walk_yaml_files(&path, files)?;
            continue;
        }
        if path.extension().is_some_and(|ext| ext == "yaml") {
            files.push(path);
        }
    }
    Ok(())
}

fn discover_yaml_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    walk_yaml_files(root, &mut files)?;
    files.sort();
    Ok(files)
}

fn to_const_name(pool: &str) -> String {
    format!("{}_EVENT_FILES", pool.to_ascii_uppercase())
}

fn yaml_to_bincode<T: serde::de::DeserializeOwned + serde::Serialize>(
    path: &Path,
) -> Result<Vec<u8>, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    let value: T = serde_yaml::from_str(&raw)
        .map_err(|e| format!("Failed to parse YAML {}: {}", path.display(), e))?;
    bincode::serde::encode_to_vec(&value, bincode::config::standard())
        .map_err(|e| format!("Failed to encode bincode {}: {}", path.display(), e))
}

fn rel_label(root: &Path, path: &Path, prefix: &str) -> Result<String, String> {
    let rel = path
        .strip_prefix(root)
        .map_err(|e| format!("Failed to strip prefix for {}: {}", path.display(), e))?;
    let rel = rel.to_string_lossy().replace('\\', "/");
    Ok(format!("{}/{}", prefix, rel))
}

type EventPoolMap = BTreeMap<String, Vec<(String, Vec<u8>)>>;

fn discover_event_entries(root: &Path) -> Result<EventPoolMap, String> {
    let mut by_pool = BTreeMap::new();
    for pool in EVENT_POOLS {
        by_pool.insert(pool.dir.to_string(), Vec::new());
    }

    for path in discover_yaml_files(root)? {
        let rel = path
            .strip_prefix(root)
            .map_err(|e| format!("Failed to strip events root prefix: {}", e))?;
        let rel_string = rel.to_string_lossy().replace('\\', "/");
        let pool = rel
            .components()
            .next()
            .ok_or_else(|| format!("Invalid event path {}", rel_string))?
            .as_os_str()
            .to_string_lossy()
            .to_string();
        let entries = by_pool
            .get_mut(&pool)
            .ok_or_else(|| format!("Unknown event pool '{}' for file '{}'", pool, rel_string))?;
        entries.push((rel_string, yaml_to_bincode::<GameEvent>(&path)?));
    }

    Ok(by_pool)
}

fn discover_trigger_entries(root: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    discover_yaml_files(root)?
        .into_iter()
        .map(|path| {
            let label = rel_label(root, &path, "triggers")?;
            let bytes = yaml_to_bincode::<TriggerFile>(&path)?;
            Ok((label, bytes))
        })
        .collect()
}

fn discover_dialog_entries(root: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    discover_yaml_files(root)?
        .into_iter()
        .map(|path| {
            let label = rel_label(root, &path, "dialogs")?;
            let bytes = yaml_to_bincode::<SystemEntryDialog>(&path)?;
            Ok((label, bytes))
        })
        .collect()
}

fn write_bytes_const(
    file: &mut fs::File,
    const_name: &str,
    entries: &[(String, Vec<u8>)],
) -> Result<(), String> {
    writeln!(file, "pub const {}: &[(&str, &[u8])] = &[", const_name)
        .map_err(|e| format!("Failed writing const {}: {}", const_name, e))?;
    for (label, bytes) in entries {
        write!(file, "    ({:?}, &[", label)
            .map_err(|e| format!("Failed writing entry {}: {}", label, e))?;
        for (i, byte) in bytes.iter().enumerate() {
            if i > 0 {
                write!(file, ",").map_err(|e| e.to_string())?;
            }
            write!(file, "{}", byte).map_err(|e| e.to_string())?;
        }
        writeln!(file, "]),").map_err(|e| format!("Failed writing entry {}: {}", label, e))?;
    }
    writeln!(file, "];").map_err(|e| format!("Failed closing const {}: {}", const_name, e))?;
    Ok(())
}

fn write_event_pool_lookup(file: &mut fs::File) -> Result<(), String> {
    writeln!(
        file,
        "pub fn event_entries_for_pool(pool: crate::events::EventPool) -> &'static [(&'static str, &'static [u8])] {{"
    )
    .map_err(|e| format!("Failed writing event pool helper signature: {}", e))?;
    writeln!(file, "    match pool {{")
        .map_err(|e| format!("Failed writing event pool helper match: {}", e))?;
    for pool in EVENT_POOLS {
        writeln!(
            file,
            "        crate::events::EventPool::{} => {},",
            pool.variant,
            to_const_name(pool.dir)
        )
        .map_err(|e| format!("Failed writing event pool helper arm {}: {}", pool.dir, e))?;
    }
    writeln!(file, "    }}")
        .map_err(|e| format!("Failed closing event pool helper match: {}", e))?;
    writeln!(file, "}}").map_err(|e| format!("Failed closing event pool helper: {}", e))?;
    Ok(())
}

fn write_dialog_lookup(file: &mut fs::File) -> Result<(), String> {
    writeln!(
        file,
        "pub fn dialog_entry_by_label(label: &str) -> Option<(&'static str, &'static [u8])> {{"
    )
    .map_err(|e| format!("Failed writing dialog helper signature: {}", e))?;
    writeln!(
        file,
        "    DIALOG_FILES.iter().copied().find(|(entry_label, _)| *entry_label == label)"
    )
    .map_err(|e| format!("Failed writing dialog helper body: {}", e))?;
    writeln!(file, "}}").map_err(|e| format!("Failed closing dialog helper: {}", e))?;
    Ok(())
}

fn write_generated_registry(
    out_path: &Path,
    event_entries: &EventPoolMap,
    trigger_entries: &[(String, Vec<u8>)],
    dialog_entries: &[(String, Vec<u8>)],
) -> Result<(), String> {
    let mut file = fs::File::create(out_path)
        .map_err(|e| format!("Failed to create {}: {}", out_path.display(), e))?;

    writeln!(file, "// @generated by build.rs; do not edit.")
        .map_err(|e| format!("Failed writing generated file header: {}", e))?;
    writeln!(
        file,
        "#[cfg(test)]\npub const TOTAL_EVENT_FILE_COUNT: usize = {};",
        event_entries.values().map(|v| v.len()).sum::<usize>()
    )
    .map_err(|e| format!("Failed writing TOTAL_EVENT_FILE_COUNT: {}", e))?;

    for pool in EVENT_POOLS {
        let const_name = to_const_name(pool.dir);
        let entries = event_entries
            .get(pool.dir)
            .ok_or_else(|| format!("Internal error: missing pool {}", pool.dir))?;
        write_bytes_const(&mut file, &const_name, entries)?;
    }

    write_bytes_const(&mut file, "TRIGGER_FILES", trigger_entries)?;
    write_bytes_const(&mut file, "DIALOG_FILES", dialog_entries)?;
    write_event_pool_lookup(&mut file)?;
    write_dialog_lookup(&mut file)?;

    Ok(())
}

fn main() -> Result<(), String> {
    println!("cargo:rerun-if-changed=content/events");
    println!("cargo:rerun-if-changed=content/triggers");
    println!("cargo:rerun-if-changed=content/dialogs");

    let manifest_dir = PathBuf::from(
        env::var("CARGO_MANIFEST_DIR")
            .map_err(|e| format!("CARGO_MANIFEST_DIR is unavailable: {}", e))?,
    );
    let content_root = manifest_dir.join("content");
    let event_entries = discover_event_entries(&content_root.join("events"))?;
    let trigger_entries = discover_trigger_entries(&content_root.join("triggers"))?;
    let dialog_entries = discover_dialog_entries(&content_root.join("dialogs"))?;

    let out_dir =
        PathBuf::from(env::var("OUT_DIR").map_err(|e| format!("OUT_DIR is unavailable: {}", e))?);
    write_generated_registry(
        &out_dir.join("generated_content_registry.rs"),
        &event_entries,
        &trigger_entries,
        &dialog_entries,
    )
}
