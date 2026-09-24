use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct OutboxMeta {
    pub request_id: String,
    pub document_id: String,
    pub product_key: String,
    pub page_count: u32,
    pub size_bytes: u64,
    pub sha256: String,
    pub status: String,
    pub attempt_count: u32,
    pub created_at: String,
    pub updated_at: String,
    pub last_error: Option<String>,
}

fn outbox_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve app data directory: {error}"))?
        .join("outbox");
    fs::create_dir_all(&root).map_err(|error| format!("Cannot create outbox: {error}"))?;
    Ok(root)
}

fn safe_request_id(request_id: &str) -> Result<&str, String> {
    if request_id.is_empty()
        || request_id.len() > 120
        || request_id
            .chars()
            .any(|character| matches!(character, '/' | '\\' | ':'))
        || request_id == "."
        || request_id == ".."
    {
        return Err("Invalid request_id".to_string());
    }
    Ok(request_id)
}

fn item_dir(app: &AppHandle, request_id: &str) -> Result<PathBuf, String> {
    let request_id = safe_request_id(request_id)?;
    Ok(outbox_root(app)?.join(request_id))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, bytes)
        .map_err(|error| format!("Cannot write temporary outbox file: {error}"))?;
    fs::rename(&temp_path, path).map_err(|error| format!("Cannot commit outbox file: {error}"))
}

pub fn enqueue(
    app: &AppHandle,
    request_id: String,
    document_id: String,
    product_key: String,
    page_count: u32,
    pdf_bytes: Vec<u8>,
) -> Result<OutboxMeta, String> {
    if document_id.trim().is_empty() || product_key.trim().is_empty() {
        return Err("document_id and product_key are required".to_string());
    }
    if page_count == 0 || pdf_bytes.len() < 5 || &pdf_bytes[..5] != b"%PDF-" {
        return Err("Only a valid PDF preview can be queued".to_string());
    }

    let directory = item_dir(app, &request_id)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Cannot create outbox item: {error}"))?;
    let meta_path = directory.join("meta.json");
    let pdf_path = directory.join("file.pdf");

    if meta_path.exists() && pdf_path.exists() {
        let existing = fs::read(&meta_path)
            .map_err(|error| format!("Cannot read existing metadata: {error}"))?;
        return serde_json::from_slice(&existing)
            .map_err(|error| format!("Invalid existing metadata: {error}"));
    }

    let now = chrono_like_now();
    let meta = OutboxMeta {
        request_id,
        document_id,
        product_key,
        page_count,
        size_bytes: pdf_bytes.len() as u64,
        sha256: sha256_hex(&pdf_bytes),
        status: "pending".to_string(),
        attempt_count: 0,
        created_at: now.clone(),
        updated_at: now,
        last_error: None,
    };
    let serialized = serde_json::to_vec_pretty(&meta)
        .map_err(|error| format!("Cannot serialize metadata: {error}"))?;
    write_atomic(&pdf_path, &pdf_bytes)?;
    write_atomic(&meta_path, &serialized)?;
    Ok(meta)
}

pub fn list(app: &AppHandle) -> Result<Vec<OutboxMeta>, String> {
    let root = outbox_root(app)?;
    let mut items = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| format!("Cannot read outbox: {error}"))? {
        let entry = entry.map_err(|error| format!("Cannot read outbox entry: {error}"))?;
        if !entry.path().is_dir() {
            continue;
        }
        let meta_path = entry.path().join("meta.json");
        if !meta_path.exists() {
            continue;
        }
        let bytes =
            fs::read(meta_path).map_err(|error| format!("Cannot read outbox metadata: {error}"))?;
        let meta: OutboxMeta = serde_json::from_slice(&bytes)
            .map_err(|error| format!("Invalid outbox metadata: {error}"))?;
        items.push(meta);
    }
    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(items)
}

pub fn discard(app: &AppHandle, request_id: String) -> Result<(), String> {
    let directory = item_dir(app, &request_id)?;
    if directory.exists() {
        fs::remove_dir_all(directory)
            .map_err(|error| format!("Cannot discard outbox item: {error}"))?;
    }
    Ok(())
}

// Kept dependency-free so the outbox can be used before the HTTP client is wired.
fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("unix:{seconds}")
}

#[cfg(test)]
mod tests {
    use super::{safe_request_id, sha256_hex};

    #[test]
    fn rejects_path_traversal_request_ids() {
        assert!(safe_request_id("../escape").is_err());
        assert!(safe_request_id("folder/item").is_err());
        assert!(safe_request_id("request-001").is_ok());
    }

    #[test]
    fn computes_stable_sha256() {
        assert_eq!(
            sha256_hex(b"Digital QC"),
            "3935d53a5b872b1f15557423336cdce8ddefd5da832f910a2d03d0b92fafc4cd"
        );
    }
}
