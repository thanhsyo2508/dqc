import { PDFDocument } from "pdf-lib";
import type { ProductQc } from "../domain/product-qc.js";
import { enqueuePdfInOutbox, isTauriRuntime, pingAuthenticatedServer, uploadQueuedPdf } from "./tauri-bridge.js";

// Apps Script Web Apps do not answer browser OPTIONS preflight requests.
// text/plain is a CORS-safelisted content type; the body is still JSON and
// doPost parses it from e.postData.contents.
const APPS_SCRIPT_REQUEST_HEADERS = { "content-type": "text/plain;charset=UTF-8" };

export interface UploadResponse {
  success: boolean;
  api_version: number;
  qc_no?: string;
  qc_record_id?: string;
  product_key?: string;
  file_name?: string;
  file_id?: string;
  open_url?: string;
  duplicate?: boolean;
  code?: string;
  message?: string;
  retryable?: boolean;
}

export interface PingResponse {
  success: boolean;
  api_version: number;
  user?: string;
  role?: string;
  allowed?: boolean;
  message?: string;
  code?: string;
}

function assertTrustedUploadEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("URL Web App không hợp lệ.");
  }
  const isAppsScript = url.protocol === "https:"
    && url.hostname === "script.google.com"
    && /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname);
  const isLoopback = !isTauriRuntime()
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    && (url.protocol === "http:" || url.protocol === "https:");
  if (!isAppsScript && !isLoopback) {
    throw new Error("Chỉ cho phép URL Google Apps Script /exec để bảo vệ token đăng nhập.");
  }
}

export interface UploadOptions {
  endpoint: string;
  requestId: string;
  documentId?: string;
  productKey: string;
  idToken?: string;
  apiVersion?: number;
  fetchImpl?: typeof fetch;
}

async function readJsonResponse<T>(response: Response, operation: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${operation} nhận response không phải JSON (HTTP ${response.status}). Hãy kiểm tra URL Web App có kết thúc bằng /exec.`);
  }
}

export async function pingServer(endpoint: string, idToken = "", fetchImpl: typeof fetch = fetch): Promise<PingResponse> {
  assertTrustedUploadEndpoint(endpoint);
  if (isTauriRuntime()) {
    const result = await pingAuthenticatedServer(endpoint) as unknown as PingResponse;
    if (!result.success) throw new Error(result.message ?? result.code ?? "Server ping failed");
    return result;
  }
  if (!idToken) throw new Error("Google ID token is required for server ping.");
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: APPS_SCRIPT_REQUEST_HEADERS,
    body: JSON.stringify({ action: "ping", api_version: 1, auth: { id_token: idToken } }),
  });
  const result = await readJsonResponse<PingResponse>(response, "Ping server");
  if (!result.success) throw new Error(result.message ?? result.code ?? "Server ping failed");
  return result;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function base64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function notifyUploadSuccess(result: UploadResponse, options: UploadOptions): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("digital-qc:upload-success", {
      detail: {
        ...result,
        documentId: options.documentId,
        requestId: options.requestId,
        productKey: options.productKey,
      },
    }),
  );
}

export async function uploadProductPdf(
  pdfBytes: Uint8Array,
  qc: ProductQc,
  options: UploadOptions,
): Promise<UploadResponse> {
  assertTrustedUploadEndpoint(options.endpoint);
  const pageCount = (await PDFDocument.load(pdfBytes)).getPageCount();
  const queued = await enqueuePdfInOutbox({
    requestId: options.requestId,
    documentId: options.documentId ?? options.requestId,
    productKey: options.productKey,
    pageCount,
    pdfBytes,
    endpoint: options.endpoint,
    apiVersion: options.apiVersion ?? 1,
    qc,
  });
  if (queued) {
    const result = await uploadQueuedPdf(options.requestId);
    const normalized = result as unknown as UploadResponse;
    if (!normalized.success) {
      const error = new Error(normalized.message ?? normalized.code ?? "Upload failed");
      Object.assign(error, normalized);
      throw error;
    }
    notifyUploadSuccess(normalized, options);
    return normalized;
  }

  const hash = await sha256(pdfBytes);
  const encoded = base64(pdfBytes);
  if (!options.idToken) throw new Error("Google ID token is required for browser upload.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    headers: APPS_SCRIPT_REQUEST_HEADERS,
    body: JSON.stringify({
      action: "upload_qc_pdf",
      api_version: options.apiVersion ?? 1,
      auth: { id_token: options.idToken },
      data: {
        request_id: options.requestId,
        product_key: options.productKey,
        qc_record_id: qc.recordId,
        project: qc.product.project,
        po: qc.product.po,
        part_no: qc.product.partNo,
        lot_no: qc.product.lotNo ?? "N/A",
        supplier: qc.product.supplier ?? "",
        quantity: qc.product.quantity,
        unit: qc.product.unit,
        slip_no: qc.product.slipNo,
        received_date: qc.product.receivedDate,
        page_count: pageCount,
        size_bytes: pdfBytes.byteLength,
        sha256: hash,
        pdf_base64: encoded,
      },
    }),
  });

  const result = await readJsonResponse<UploadResponse>(response, "Upload hồ sơ");
  if (!result.success) {
    const error = new Error(result.message ?? result.code ?? "Upload failed");
    Object.assign(error, result);
    throw error;
  }
  notifyUploadSuccess(result, options);
  return result;
}
