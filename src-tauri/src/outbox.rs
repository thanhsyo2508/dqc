use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
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
    #[serde(default)]
    pub endpoint: String,
    #[serde(default = "default_api_version")]
    pub api_version: u32,
    #[serde(default)]
    pub qc_json: String,
}

fn default_api_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct OutboxRetryResult {
    pub request_id: String,
    pub document_id: String,
    pub success: bool,
    pub response: Option<Value>,
    pub error: Option<String>,
    pub meta: OutboxMeta,
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
    let temp_path = path.with_extension(format!("tmp-{}", std::process::id()));
    fs::write(&temp_path, bytes)
        .map_err(|error| format!("Cannot write temporary outbox file: {error}"))?;
    if path.exists() {
        let backup_path = path.with_extension("bak");
        let _ = fs::copy(path, backup_path);
        fs::remove_file(path).map_err(|error| format!("Cannot replace outbox file: {error}"))?;
    }
    fs::rename(&temp_path, path).map_err(|error| format!("Cannot commit outbox file: {error}"))
}

fn read_meta_file(path: &Path) -> Result<OutboxMeta, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(_) => fs::read(path.with_extension("bak"))
            .map_err(|error| format!("Cannot read outbox metadata: {error}"))?,
    };
    serde_json::from_slice(&bytes).map_err(|error| format!("Invalid outbox metadata: {error}"))
}

pub fn enqueue(
    app: &AppHandle,
    request_id: String,
    document_id: String,
    product_key: String,
    page_count: u32,
    pdf_bytes: Vec<u8>,
    endpoint: String,
    api_version: u32,
    qc_json: String,
) -> Result<OutboxMeta, String> {
    if document_id.trim().is_empty() || product_key.trim().is_empty() {
        return Err("document_id and product_key are required".to_string());
    }
    if page_count == 0 || pdf_bytes.len() < 5 || &pdf_bytes[..5] != b"%PDF-" {
        return Err("Only a valid PDF preview can be queued".to_string());
    }
    validate_endpoint(&endpoint)?;
    let qc: Value =
        serde_json::from_str(&qc_json).map_err(|_| "Invalid QC metadata".to_string())?;
    if !qc.get("product").is_some() {
        return Err("QC metadata must include product".to_string());
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
        endpoint,
        api_version,
        qc_json,
    };
    let serialized = serde_json::to_vec_pretty(&meta)
        .map_err(|error| format!("Cannot serialize metadata: {error}"))?;
    write_atomic(&pdf_path, &pdf_bytes)?;
    write_atomic(&meta_path, &serialized)?;
    Ok(meta)
}

fn read_meta(app: &AppHandle, request_id: &str) -> Result<OutboxMeta, String> {
    let path = item_dir(app, request_id)?.join("meta.json");
    read_meta_file(&path)
}

fn write_meta(app: &AppHandle, meta: &OutboxMeta) -> Result<(), String> {
    let path = item_dir(app, &meta.request_id)?.join("meta.json");
    let bytes = serde_json::to_vec_pretty(meta)
        .map_err(|error| format!("Cannot serialize metadata: {error}"))?;
    write_atomic(&path, &bytes)
}

fn set_meta_error(
    app: &AppHandle,
    meta: &mut OutboxMeta,
    status: &str,
    error: String,
) -> Result<(), String> {
    meta.status = status.to_string();
    meta.last_error = Some(error);
    meta.updated_at = chrono_like_now();
    write_meta(app, meta)
}

fn upload_body(meta: &OutboxMeta, pdf_bytes: &[u8]) -> Result<Value, String> {
    let qc: Value = serde_json::from_str(&meta.qc_json)
        .map_err(|_| "Queued QC metadata is invalid".to_string())?;
    let product = qc
        .get("product")
        .ok_or_else(|| "Queued QC metadata has no product".to_string())?;
    let body = json!({
        "action": "upload_qc_pdf",
        "api_version": meta.api_version,
        "data": {
            "request_id": meta.request_id,
            "product_key": meta.product_key,
            "qc_record_id": qc.get("recordId").and_then(Value::as_str).unwrap_or_default(),
            "project": product.get("project").and_then(Value::as_str).unwrap_or_default(),
            "po": product.get("po").and_then(Value::as_str).unwrap_or_default(),
            "part_no": product.get("partNo").and_then(Value::as_str).unwrap_or_default(),
            "lot_no": product.get("lotNo").and_then(Value::as_str).unwrap_or("N/A"),
            "supplier": product.get("supplier").and_then(Value::as_str).unwrap_or_default(),
            "quantity": product.get("quantity").and_then(Value::as_f64).unwrap_or_default(),
            "unit": product.get("unit").and_then(Value::as_str).unwrap_or("PCS"),
            "slip_no": product.get("slipNo").and_then(Value::as_str).unwrap_or_default(),
            "received_date": product.get("receivedDate").and_then(Value::as_str).unwrap_or_default(),
            "page_count": meta.page_count,
            "size_bytes": meta.size_bytes,
            "sha256": meta.sha256,
            "pdf_base64": BASE64.encode(pdf_bytes),
        }
    });
    Ok(body)
}

pub(crate) fn validate_endpoint(endpoint: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "A valid upload endpoint is required")?;
    let path = url.path().trim_matches('/').split('/').collect::<Vec<_>>();
    let is_apps_script = url.scheme() == "https"
        && url.host_str() == Some("script.google.com")
        && path.len() == 4
        && path[0] == "macros"
        && path[1] == "s"
        && !path[2].is_empty()
        && path[3] == "exec";
    if !is_apps_script {
        return Err("Only a Google Apps Script /exec endpoint is allowed".to_string());
    }
    Ok(())
}

pub async fn ping(endpoint: String, id_token: String) -> Result<Value, String> {
    validate_endpoint(&endpoint)?;
    if id_token.trim().is_empty() {
        return Err("Google sign-in is required before contacting the server".to_string());
    }
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Cannot create HTTP client: {error}"))?;
    let body = json!({
        "action": "ping",
        "api_version": 1,
        "auth": { "id_token": id_token },
    });
    let response = client
        .post(endpoint)
        .header("content-type", "text/plain;charset=UTF-8")
        .body(body.to_string())
        .send()
        .await
        .map_err(|error| format!("Server ping failed: {error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Cannot read ping response: {error}"))?;
    serde_json::from_str(&text)
        .map_err(|error| format!("Server returned invalid JSON ({status}): {error}"))
}

pub async fn upload(
    app: &AppHandle,
    request_id: String,
    id_token: String,
) -> Result<Value, String> {
    let mut meta = read_meta(app, &request_id)?;
    if meta.endpoint.is_empty() || meta.qc_json.is_empty() {
        let message = "Outbox item was created by an older version and cannot retry automatically"
            .to_string();
        set_meta_error(app, &mut meta, "failed", message.clone())?;
        return Err(message);
    }
    let pdf_path = item_dir(app, &request_id)?.join("file.pdf");
    let pdf_bytes =
        fs::read(pdf_path).map_err(|error| format!("Cannot read queued PDF: {error}"))?;
    if sha256_hex(&pdf_bytes) != meta.sha256 {
        let message = "Queued PDF SHA-256 does not match metadata".to_string();
        set_meta_error(app, &mut meta, "failed", message.clone())?;
        return Err(message);
    }

    meta.status = "sending".to_string();
    meta.attempt_count += 1;
    meta.updated_at = chrono_like_now();
    meta.last_error = None;
    write_meta(app, &meta)?;

    if id_token.trim().is_empty() {
        return Err("Google sign-in is required before uploading".to_string());
    }
    validate_endpoint(&meta.endpoint)?;
    let mut body = upload_body(&meta, &pdf_bytes)?;
    body["auth"] = json!({ "id_token": id_token });
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("Cannot create HTTP client: {error}"))?;
    let response = match client
        .post(&meta.endpoint)
        .header("content-type", "text/plain;charset=UTF-8")
        .json(&body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            let message = format!("Network upload failed: {error}");
            set_meta_error(app, &mut meta, "pending", message.clone())?;
            return Err(message);
        }
    };
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Cannot read upload response: {error}"))?;
    let result: Value = serde_json::from_str(&text).map_err(|error| {
        let message = format!("Server returned invalid JSON ({status}): {error}");
        let _ = set_meta_error(app, &mut meta, "pending", message.clone());
        message
    })?;
    if result
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        discard(app, request_id)?;
        return Ok(result);
    }

    let message = result
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("Upload was rejected")
        .to_string();
    let retryable = result
        .get("retryable")
        .and_then(Value::as_bool)
        .unwrap_or(!status.is_client_error());
    set_meta_error(
        app,
        &mut meta,
        if retryable { "pending" } else { "failed" },
        message,
    )?;
    Ok(result)
}

pub async fn retry_all(
    app: &AppHandle,
    id_token: String,
) -> Result<Vec<OutboxRetryResult>, String> {
    let items = list(app)?;
    let mut results = Vec::new();
    for item in items
        .into_iter()
        .filter(|item| item.status == "pending" || item.status == "sending")
    {
        let request_id = item.request_id.clone();
        match upload(app, request_id.clone(), id_token.clone()).await {
            Ok(response) => results.push(OutboxRetryResult {
                request_id,
                document_id: item.document_id.clone(),
                success: response
                    .get("success")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                response: Some(response),
                error: None,
                meta: item,
            }),
            Err(error) => results.push(OutboxRetryResult {
                request_id,
                document_id: item.document_id.clone(),
                success: false,
                response: None,
                error: Some(error),
                meta: item,
            }),
        }
    }
    Ok(results)
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
        if !meta_path.exists() && !meta_path.with_extension("bak").exists() {
            continue;
        }
        let meta = read_meta_file(&meta_path)?;
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
    use super::{safe_request_id, sha256_hex, upload_body, validate_endpoint, OutboxMeta};

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

    #[test]
    fn includes_qc_record_id_in_upload_body() {
        let meta = OutboxMeta {
            request_id: "request-001".to_string(),
            document_id: "document-001".to_string(),
            product_key: "product-001".to_string(),
            page_count: 1,
            size_bytes: 9,
            sha256: sha256_hex(b"%PDF-test"),
            status: "pending".to_string(),
            attempt_count: 0,
            created_at: "test".to_string(),
            updated_at: "test".to_string(),
            last_error: None,
            endpoint: "https://example.test/exec".to_string(),
            api_version: 1,
            qc_json: r#"{"recordId":"QC-UNIQUE-001","product":{"project":"P","po":"PO","partNo":"PART","quantity":1,"unit":"PCS","slipNo":"NK","receivedDate":"2026-09-29"}}"#.to_string(),
        };

        let body = upload_body(&meta, b"%PDF-test").expect("upload body");
        assert_eq!(body["data"]["qc_record_id"], "QC-UNIQUE-001");
    }

    #[test]
    fn only_allows_apps_script_endpoints() {
        assert!(validate_endpoint("https://script.google.com/macros/s/deployment-id/exec").is_ok());
        assert!(validate_endpoint("http://127.0.0.1:1234/exec").is_err());
        assert!(validate_endpoint("https://example.test/exec").is_err());
    }
}
