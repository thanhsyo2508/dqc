export interface OutboxEnqueueInput {
  requestId: string;
  documentId: string;
  productKey: string;
  pageCount: number;
  pdfBytes: Uint8Array;
}

export interface OutboxMeta {
  request_id: string;
  document_id: string;
  product_key: string;
  page_count: number;
  size_bytes: number;
  sha256: string;
  status: string;
  attempt_count: number;
  created_at: string;
  updated_at: string;
  last_error?: string;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function enqueuePdfInOutbox(input: OutboxEnqueueInput): Promise<OutboxMeta | null> {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<OutboxMeta>("outbox_enqueue", {
    requestId: input.requestId,
    documentId: input.documentId,
    productKey: input.productKey,
    pageCount: input.pageCount,
    pdfBytes: Array.from(input.pdfBytes),
  });
}
