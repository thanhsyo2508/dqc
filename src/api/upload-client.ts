import { PDFDocument } from "pdf-lib";
import type { ProductQc } from "../domain/product-qc.js";

export interface UploadResponse {
  success: boolean;
  api_version: number;
  qc_no?: string;
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
  allowed?: boolean;
  message?: string;
  code?: string;
}

export interface FindUploadsQuery {
  query?: string;
  fromDate?: string;
  toDate?: string;
}

export interface FindUploadRecord {
  qc_no?: string;
  request_id?: string;
  product_key?: string;
  project?: string;
  po?: string;
  part_no?: string;
  lot_no?: string;
  supplier?: string;
  quantity?: number;
  unit?: string;
  slip_no?: string;
  received_date?: string;
  uploaded_at?: string;
  page_count?: number;
  size_bytes?: number;
  sha256?: string;
  file_name?: string;
  file_id?: string;
  open_url?: string;
  download_url?: string;
  uploaded_by?: string;
  status?: string;
}

export interface FindUploadsResponse {
  success: boolean;
  api_version: number;
  items: FindUploadRecord[];
  message?: string;
  code?: string;
}

export interface UploadOptions {
  endpoint: string;
  requestId: string;
  documentId?: string;
  productKey: string;
  apiVersion?: number;
  idToken?: string;
  fetchImpl?: typeof fetch;
}

export async function pingServer(endpoint: string, fetchImpl: typeof fetch = fetch): Promise<PingResponse> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "ping", api_version: 1 }),
  });
  const result = (await response.json()) as PingResponse;
  if (!result.success) throw new Error(result.message ?? result.code ?? "Server ping failed");
  return result;
}

export async function findUploads(endpoint: string, query: FindUploadsQuery = {}, fetchImpl: typeof fetch = fetch): Promise<FindUploadRecord[]> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "find_uploads",
      api_version: 1,
      data: { query: query.query?.trim() || undefined, from_date: query.fromDate || undefined, to_date: query.toDate || undefined },
    }),
  });
  const result = (await response.json()) as FindUploadsResponse;
  if (!result.success) throw new Error(result.message ?? result.code ?? "Could not load uploaded documents");
  return Array.isArray(result.items) ? result.items : [];
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
  const hash = await sha256(pdfBytes);
  const encoded = base64(pdfBytes);
  const pageCount = (await PDFDocument.load(pdfBytes)).getPageCount();
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "upload_qc_pdf",
      api_version: options.apiVersion ?? 1,
      auth: options.idToken ? { id_token: options.idToken } : undefined,
      data: {
        request_id: options.requestId,
        product_key: options.productKey,
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

  const result = (await response.json()) as UploadResponse;
  if (!result.success) {
    const error = new Error(result.message ?? result.code ?? "Upload failed");
    Object.assign(error, result);
    throw error;
  }
  notifyUploadSuccess(result, options);
  return result;
}
