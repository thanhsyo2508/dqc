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
) -> Result<OutboxMeta, String> {
    outbox::enqueue(
        &app,
        request_id,
        document_id,
        product_key,
        page_count,
        pdf_bytes,
    )
}

#[tauri::command]
pub fn outbox_list(app: AppHandle) -> Result<Vec<OutboxMeta>, String> {
    outbox::list(&app)
}

#[tauri::command]
pub fn outbox_discard(app: AppHandle, request_id: String) -> Result<(), String> {
    outbox::discard(&app, request_id)
}
