import QRCode from "qrcode";
import type { InternalDocument } from "../domain/document-store.js";

export interface LabelTemplate {
  id: string;
  name: string;
  description: string;
  pageSize: string;
  columns: number;
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
  gapMm: number;
  qrSizeMm: number;
  roll: boolean;
}

export interface PrinterProfile {
  id: string;
  name: string;
  family: string;
  templateId: string;
  note: string;
}

export const LABEL_TEMPLATES: LabelTemplate[] = [
  { id: "a4-3x8", name: "A4 · 3 cột × 8 dòng", description: "Tem rời văn phòng, dễ in thử", pageSize: "A4", columns: 3, rows: 8, labelWidthMm: 63.5, labelHeightMm: 33.9, gapMm: 2.5, qrSizeMm: 21, roll: false },
  { id: "a4-2x4", name: "A4 · 2 cột × 4 dòng", description: "Tem lớn, nhiều thông tin mã hàng", pageSize: "A4", columns: 2, rows: 4, labelWidthMm: 91, labelHeightMm: 60, gapMm: 4, qrSizeMm: 34, roll: false },
  { id: "roll-100x50", name: "Tem cuộn · 100 × 50 mm", description: "Zebra / Godex / máy in nhiệt khổ 100×50", pageSize: "100mm 50mm", columns: 1, rows: 1, labelWidthMm: 100, labelHeightMm: 50, gapMm: 0, qrSizeMm: 31, roll: true },
  { id: "roll-62x29", name: "Tem cuộn · 62 × 29 mm", description: "Brother QL và máy in nhiệt khổ nhỏ", pageSize: "62mm 29mm", columns: 1, rows: 1, labelWidthMm: 62, labelHeightMm: 29, gapMm: 0, qrSizeMm: 17, roll: true },
];

export const PRINTER_PROFILES: PrinterProfile[] = [
  { id: "windows-system", name: "Windows · Chọn máy in khi in", family: "Hệ thống", templateId: "a4-3x8", note: "Mở hộp thoại in Windows để chọn máy in thực tế." },
  { id: "zebra-roll", name: "Zebra · tem cuộn", family: "Zebra", templateId: "roll-100x50", note: "Chọn đúng paper size 100×50 mm trong driver Zebra." },
  { id: "brother-roll", name: "Brother QL · tem cuộn", family: "Brother", templateId: "roll-62x29", note: "Chọn khổ cuộn tương ứng trong driver Brother." },
  { id: "godex-roll", name: "Godex · tem cuộn", family: "Godex", templateId: "roll-100x50", note: "Dùng driver Windows, kiểm tra calibration trước khi in hàng loạt." },
  { id: "generic-a4", name: "Máy in văn phòng · A4", family: "Generic", templateId: "a4-2x4", note: "Phù hợp máy in laser/inkjet hỗ trợ giấy A4." },
];

export function getLabelTemplate(id: string): LabelTemplate {
  return LABEL_TEMPLATES.find((template) => template.id === id) ?? LABEL_TEMPLATES[0];
}

export function getPrinterProfile(id: string): PrinterProfile {
  return PRINTER_PROFILES.find((profile) => profile.id === id) ?? PRINTER_PROFILES[0];
}

export async function createQrDataUrl(payload: string, width = 240): Promise<string> {
  return QRCode.toDataURL(payload, { width, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] ?? character);
}

export function printSheetHtml(document: InternalDocument, template: LabelTemplate, copies: number, qrDataUrl: string): string {
  const labels = Array.from({ length: Math.max(1, Math.min(copies, 100)) }, () => `<article class="label"><img class="qr" src="${qrDataUrl}" alt="QR ${escapeHtml(document.product.partNo)}" /><div class="label-copy"><strong>${escapeHtml(document.product.partNo)}</strong><span>${escapeHtml(document.product.productName ?? "")}</span><span>QC: ${escapeHtml(document.uploaded?.qcNo ?? document.qc.recordId)}</span><span>PO: ${escapeHtml(document.product.po)}</span><small>Quét để mở hồ sơ QC</small></div></article>`).join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><title>Tem ${escapeHtml(document.product.partNo)}</title><style>
    @page { size: ${template.pageSize}; margin: ${template.roll ? "0" : "8mm"}; }
    * { box-sizing: border-box; } html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, sans-serif; color: #0f172a; }
    .sheet { display: grid; grid-template-columns: repeat(${template.columns}, ${template.labelWidthMm}mm); gap: ${template.gapMm}mm; align-content: start; }
    .label { display: flex; align-items: center; gap: 3mm; width: ${template.labelWidthMm}mm; height: ${template.labelHeightMm}mm; padding: 3mm; overflow: hidden; border: .25mm solid #cbd5e1; page-break-inside: avoid; }
    .qr { width: ${template.qrSizeMm}mm; height: ${template.qrSizeMm}mm; flex: 0 0 auto; }
    .label-copy { display: grid; min-width: 0; gap: 1mm; line-height: 1.1; }
    .label-copy strong, .label-copy span, .label-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .label-copy strong { font-size: 10pt; } .label-copy span { font-size: 7pt; } .label-copy small { margin-top: 1mm; color: #475569; font-size: 6pt; }
    ${template.roll ? ".label { page-break-after: always; border: 0; }" : ""}
  </style></head><body><main class="sheet">${labels}</main><script>window.onload=()=>window.print();</script></body></html>`;
}
