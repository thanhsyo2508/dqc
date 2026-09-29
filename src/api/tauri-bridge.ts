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

export interface AuthSession {
  email: string;
  name: string;
  picture: string;
  expiresAt: number;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loginWithGoogle(clientId: string, clientSecret: string): Promise<AuthSession> {
  if (!isTauriRuntime()) throw new Error("Đăng nhập Google chỉ khả dụng trong ứng dụng Digital QC desktop.");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AuthSession>("auth_login", { clientId, clientSecret });
}

export async function restoreGoogleSession(clientId: string, clientSecret: string): Promise<AuthSession | null> {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AuthSession | null>("auth_restore", { clientId, clientSecret });
}

export async function logoutGoogle(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("auth_logout");
}

export async function pingAuthenticatedServer(endpoint: string): Promise<Record<string, unknown>> {
  if (!isTauriRuntime()) throw new Error("Server ping with Google authentication requires Digital QC desktop.");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Record<string, unknown>>("server_ping", { endpoint });
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
