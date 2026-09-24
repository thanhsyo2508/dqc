mod commands;
mod outbox;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::outbox_enqueue,
            commands::outbox_list,
            commands::outbox_discard,
            commands::outbox_upload,
            commands::outbox_retry_all,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Digital QC application");
}
