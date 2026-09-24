export interface OutboxEnqueueInput {
  requestId: string;
  documentId: string;
  productKey: string;
  pageCount: number;
  pdfBytes: Uint8Array;
  endpoint: string;
  apiVersion: number;
  qc: unknown;
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
  endpoint: string;
  api_version: number;
  qc_json: string;
}

export interface OutboxRetryResult {
  request_id: string;
  document_id: string;
  success: boolean;
  response?: Record<string, unknown>;
  error?: string;
  meta: OutboxMeta;
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
    endpoint: input.endpoint,
    apiVersion: input.apiVersion,
    qcJson: JSON.stringify(input.qc),
  });
}

export async function uploadQueuedPdf(requestId: string): Promise<Record<string, unknown>> {
  if (!isTauriRuntime()) throw new Error("Outbox upload is only available in Tauri");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Record<string, unknown>>("outbox_upload", { requestId });
}

export async function listQueuedPdfs(): Promise<OutboxMeta[]> {
  if (!isTauriRuntime()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<OutboxMeta[]>("outbox_list");
}

export async function retryQueuedPdfs(): Promise<OutboxRetryResult[]> {
  if (!isTauriRuntime()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<OutboxRetryResult[]>("outbox_retry_all");
}
