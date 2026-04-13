use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::{Map as JsonMap, Number as JsonNumber, Value as JsonValue};
use serde_yaml::{Mapping as YamlMapping, Value as YamlValue};

struct EventPoolSpec {
    dir: &'static str,
    variant: &'static str,
}

const EVENT_POOLS: &[EventPoolSpec] = &[
    EventPoolSpec { dir: "landing", variant: "Landing" },
    EventPoolSpec { dir: "asteroid_base", variant: "AsteroidBase" },
    EventPoolSpec { dir: "oort_cloud", variant: "OortCloudBase" },
    EventPoolSpec { dir: "maximum_space", variant: "MaximumSpace" },
    EventPoolSpec { dir: "triggered", variant: "Triggered" },
    EventPoolSpec { dir: "system_entry", variant: "SystemEntry" },
    EventPoolSpec { dir: "proximity_star", variant: "ProximityStar" },
    EventPoolSpec { dir: "proximity_base", variant: "ProximityBase" },
    EventPoolSpec { dir: "planet_landing", variant: "PlanetLanding" },
    EventPoolSpec { dir: "dyson_landing", variant: "DysonLanding" },
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

// Content authors keep writing YAML, but the runtime consumes generated JSON.
// The converter below is expected to preserve the typed serde semantics used by
// current content; content.rs tests lock that contract against representative
// fixtures so future YAML features do not silently drift.
fn parse_yaml_as_json(path: &Path) -> Result<String, String> {
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read content file {}: {}", path.display(), e))?;
    let yaml: YamlValue = serde_yaml::from_str(&raw)
        .map_err(|e| format!("Failed to parse YAML {}: {}", path.display(), e))?;
    let json = yaml_to_json(yaml)
        .map_err(|e| format!("Failed to convert YAML {} to JSON: {}", path.display(), e))?;
    serde_json::to_string(&json)
        .map_err(|e| format!("Failed to serialize JSON {}: {}", path.display(), e))
}

fn yaml_tag_name(raw: &str) -> String {
    raw.strip_prefix('!').unwrap_or(raw).to_string()
}

fn yaml_key_to_string(key: YamlValue) -> Result<String, String> {
    match key {
        YamlValue::Null => Ok("null".to_string()),
        YamlValue::Bool(v) => Ok(v.to_string()),
        YamlValue::Number(v) => Ok(v.to_string()),
        YamlValue::String(v) => Ok(v),
        YamlValue::Tagged(tagged) => Ok(yaml_tag_name(&tagged.tag.to_string())),
        other => Err(format!("Unsupported YAML mapping key type: {:?}", other)),
    }
}

fn yaml_mapping_to_json(mapping: YamlMapping) -> Result<JsonValue, String> {
    mapping
        .into_iter()
        .map(|(key, value)| Ok((yaml_key_to_string(key)?, yaml_to_json(value)?)))
        .collect::<Result<JsonMap<_, _>, String>>()
        .map(JsonValue::Object)
}

fn yaml_to_json(value: YamlValue) -> Result<JsonValue, String> {
    match value {
        YamlValue::Null => Ok(JsonValue::Null),
        YamlValue::Bool(v) => Ok(JsonValue::Bool(v)),
        YamlValue::Number(v) => {
            if let Some(i) = v.as_i64() {
                return Ok(JsonValue::Number(i.into()));
            }
            if let Some(u) = v.as_u64() {
                return Ok(JsonValue::Number(u.into()));
            }
            if let Some(f) = v.as_f64() {
                let n = JsonNumber::from_f64(f)
                    .ok_or_else(|| format!("Invalid floating-point value {}", f))?;
                return Ok(JsonValue::Number(n));
            }
            Err(format!("Unsupported YAML number {}", v))
        }
        YamlValue::String(v) => Ok(JsonValue::String(v)),
        YamlValue::Sequence(seq) => seq
            .into_iter()
            .map(yaml_to_json)
            .collect::<Result<Vec<_>, _>>()
            .map(JsonValue::Array),
        YamlValue::Mapping(mapping) => yaml_mapping_to_json(mapping),
        YamlValue::Tagged(tagged) => {
            let mut out = JsonMap::new();
            out.insert(
                yaml_tag_name(&tagged.tag.to_string()),
                yaml_to_json(tagged.value)?,
            );
            Ok(JsonValue::Object(out))
        }
    }
}

fn rel_label(root: &Path, path: &Path, prefix: &str) -> Result<String, String> {
    let rel = path
        .strip_prefix(root)
        .map_err(|e| format!("Failed to strip prefix for {}: {}", path.display(), e))?;
    let rel = rel.to_string_lossy().replace('\\', "/");
    Ok(format!("{}/{}", prefix, rel))
}

fn discover_event_entries(root: &Path) -> Result<BTreeMap<String, Vec<(String, String)>>, String> {
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
        entries.push((rel_string, parse_yaml_as_json(&path)?));
    }

    Ok(by_pool)
}

fn discover_prefixed_entries(root: &Path, prefix: &str) -> Result<Vec<(String, String)>, String> {
    let mut entries = Vec::new();
    for path in discover_yaml_files(root)? {
        entries.push((rel_label(root, &path, prefix)?, parse_yaml_as_json(&path)?));
    }
    Ok(entries)
}

fn write_entries_const(
    file: &mut fs::File,
    const_name: &str,
    entries: &[(String, String)],
) -> Result<(), String> {
    writeln!(file, "pub const {}: &[(&str, &str)] = &[", const_name)
        .map_err(|e| format!("Failed writing const {}: {}", const_name, e))?;
    for (label, json) in entries {
        writeln!(file, "    ({:?}, {:?}),", label, json)
            .map_err(|e| format!("Failed writing registry entry {}: {}", label, e))?;
    }
    writeln!(file, "];").map_err(|e| format!("Failed closing const {}: {}", const_name, e))?;
    Ok(())
}

fn write_event_pool_lookup(file: &mut fs::File) -> Result<(), String> {
    writeln!(
        file,
        "pub fn event_entries_for_pool(pool: crate::events::EventPool) -> &'static [(&'static str, &'static str)] {{"
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
        "pub fn dialog_entry_by_label(label: &str) -> Option<(&'static str, &'static str)> {{"
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
    event_entries: &BTreeMap<String, Vec<(String, String)>>,
    trigger_entries: &[(String, String)],
    dialog_entries: &[(String, String)],
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
        write_entries_const(&mut file, &const_name, entries)?;
    }

    write_entries_const(&mut file, "TRIGGER_FILES", trigger_entries)?;
    write_entries_const(&mut file, "DIALOG_FILES", dialog_entries)?;
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
    let trigger_entries = discover_prefixed_entries(&content_root.join("triggers"), "triggers")?;
    let dialog_entries = discover_prefixed_entries(&content_root.join("dialogs"), "dialogs")?;

    let out_dir = PathBuf::from(
        env::var("OUT_DIR").map_err(|e| format!("OUT_DIR is unavailable: {}", e))?,
    );
    write_generated_registry(
        &out_dir.join("generated_content_registry.rs"),
        &event_entries,
        &trigger_entries,
        &dialog_entries,
    )
}
