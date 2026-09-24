use crate::outbox::{self, OutboxMeta};
use tauri::AppHandle;

#[tauri::command]
pub fn outbox_enqueue(
    app: AppHandle,
    request_id: String,
    document_id: String,
    product_key: String,
    page_count: u32,
    pdf_bytes: Vec<u8>,
    endpoint: String,
    api_version: u32,
    qc_json: String,
) -> Result<OutboxMeta, String> {
    outbox::enqueue(
        &app,
        request_id,
        document_id,
        product_key,
        page_count,
        pdf_bytes,
        endpoint,
        api_version,
        qc_json,
    )
}

#[tauri::command]
pub async fn outbox_upload(
    app: AppHandle,
    request_id: String,
) -> Result<serde_json::Value, String> {
    outbox::upload(&app, request_id, None).await
}

#[tauri::command]
pub async fn outbox_retry_all(app: AppHandle) -> Result<Vec<outbox::OutboxRetryResult>, String> {
    outbox::retry_all(&app).await
}

#[tauri::command]
pub fn outbox_list(app: AppHandle) -> Result<Vec<OutboxMeta>, String> {
    outbox::list(&app)
}

#[tauri::command]
pub fn outbox_discard(app: AppHandle, request_id: String) -> Result<(), String> {
    outbox::discard(&app, request_id)
}
