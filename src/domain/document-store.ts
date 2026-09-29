import { createUniqueQcRecordId, type Product, type ProductQc } from "./product-qc.js";

export type DocumentStatus = "draft" | "preview-ready" | "sent" | "error";

export interface InternalDocument {
  documentId: string;
  requestId?: string;
  product: Product;
  qc: ProductQc;
  drawingNames: string[];
  pageCount?: number;
  status: DocumentStatus;
  statusMessage?: string;
  uploaded?: {
    qcNo?: string;
    fileName?: string;
    fileId?: string;
    openUrl?: string;
    downloadUrl?: string;
    sentAt: string;
    qr?: QrRecord;
  };
  updatedAt: string;
}

export interface QrRecord {
  payload: string;
  createdAt: string;
  printedAt?: string;
  printCount: number;
  templateId?: string;
  printerProfileId?: string;
}

export interface QrPayload {
  type: "digital-qc";
  version: 1;
  project: string;
  supplier: string;
  quantity: number;
  unit: string;
  part_no: string;
  product_name: string;
  slip_no: string;
  received_date: string;
  po: string;
  pdf_url: string;
}

function now(): string {
  return new Date().toISOString();
}

export function createInternalDocument(product: Product, sequence: number): InternalDocument {
  return {
    documentId: `DOC-${String(sequence).padStart(3, "0")}`,
    product,
    qc: {
      product,
      recordId: createUniqueQcRecordId(),
      inspectionDate: new Date().toISOString().slice(0, 10),
      inspector: "",
      inspectionLevel: "H:100% check",
      defectQuantity: 0,
      defectContent: "",
      responseDueDate: "",
      measurements: [{ no: 1, values: ["", "", "", "", "", "", ""], visualResult: "" }],
    },
    drawingNames: [],
    status: "draft",
    updatedAt: now(),
  };
}

export function documentStatusLabel(status: DocumentStatus): string {
  return {
    draft: "Nháp",
    "preview-ready": "Sẵn sàng gửi",
    sent: "Đã gửi",
    error: "Cần kiểm tra",
  }[status];
}

export function serializeInternalDocuments(documents: InternalDocument[]): string {
  return JSON.stringify(documents);
}

export interface UploadSuccessRecord {
  documentId?: string;
  requestId?: string;
  productKey?: string;
  qcNo?: string;
  fileName?: string;
  fileId?: string;
  openUrl?: string;
  downloadUrl?: string;
  sentAt?: string;
}

export function createQrPayload(document: InternalDocument, pdfUrl: string): string {
  const product = document.product;
  const payload: QrPayload = {
    type: "digital-qc",
    version: 1,
    project: product.project,
    supplier: product.supplier ?? "",
    quantity: product.quantity,
    unit: product.unit,
    part_no: product.partNo,
    product_name: product.productName ?? "",
    slip_no: product.slipNo,
    received_date: product.receivedDate,
    po: product.po,
    pdf_url: pdfUrl,
  };
  return JSON.stringify(payload);
}

export function markDocumentUploaded(document: InternalDocument, result: UploadSuccessRecord): InternalDocument {
  document.status = "sent";
  document.statusMessage = "Upload thành công";
  document.uploaded = {
    qcNo: result.qcNo,
    fileName: result.fileName,
    fileId: result.fileId,
    openUrl: result.openUrl,
    downloadUrl: result.downloadUrl,
    sentAt: result.sentAt ?? now(),
    qr: result.openUrl ? {
      payload: createQrPayload(document, result.openUrl),
      createdAt: now(),
      printCount: document.uploaded?.qr?.printCount ?? 0,
      printedAt: document.uploaded?.qr?.printedAt,
      templateId: document.uploaded?.qr?.templateId,
      printerProfileId: document.uploaded?.qr?.printerProfileId,
    } : document.uploaded?.qr,
  };
  document.updatedAt = now();
  return document;
}

export function markQrPrinted(document: InternalDocument, templateId: string, printerProfileId: string): InternalDocument {
  if (!document.uploaded?.qr?.payload) return document;
  const qr = document.uploaded.qr;
  qr.printedAt = now();
  qr.printCount += 1;
  qr.templateId = templateId;
  qr.printerProfileId = printerProfileId;
  document.updatedAt = now();
  return document;
}

/**
 * Restore metadata only. PDF bytes and browser File objects stay in memory;
 * after a restart a preview-ready document returns to draft until regenerated.
 */
export function restoreInternalDocuments(raw: string | null): InternalDocument[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as InternalDocument[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((document) => document?.documentId && document?.product && document?.qc)
      .map((document) => ({
        ...document,
        uploaded: document.uploaded ? {
          ...document.uploaded,
          qr: document.uploaded.qr ? { ...document.uploaded.qr, printCount: Number.isFinite(document.uploaded.qr.printCount) ? document.uploaded.qr.printCount : 0 } : (document.uploaded.openUrl ? { payload: createQrPayload({ ...document, uploaded: { ...document.uploaded, openUrl: document.uploaded.openUrl } }, document.uploaded.openUrl), createdAt: document.uploaded.sentAt, printCount: 0 } : undefined),
        } : undefined,
        drawingNames: Array.isArray(document.drawingNames) ? document.drawingNames : [],
        status: document.status === "preview-ready" ? "draft" : document.status,
        updatedAt: document.updatedAt || now(),
      }));
  } catch {
    return [];
  }
}
