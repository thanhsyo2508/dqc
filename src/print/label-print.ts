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
  layout: "sheet" | "roll-dense" | "roll-ultra";
}

export interface PrinterProfile {
  id: string;
  name: string;
  family: string;
  templateId: string;
  note: string;
}

export const LABEL_TEMPLATES: LabelTemplate[] = [
  { id: "a4-3x8", name: "A4 · 3 cột × 8 dòng", description: "Tem rời văn phòng, dễ in thử", pageSize: "A4", columns: 3, rows: 8, labelWidthMm: 63.5, labelHeightMm: 33.9, gapMm: 2.5, qrSizeMm: 21, roll: false, layout: "sheet" },
  { id: "a4-2x4", name: "A4 · 2 cột × 4 dòng", description: "Tem lớn, nhiều thông tin mã hàng", pageSize: "A4", columns: 2, rows: 4, labelWidthMm: 91, labelHeightMm: 60, gapMm: 4, qrSizeMm: 34, roll: false, layout: "sheet" },
  { id: "roll-100x50", name: "Tem cuộn · 100 × 50 mm", description: "Zebra / Godex · bố cục dày, đủ thông tin", pageSize: "100mm 50mm", columns: 1, rows: 1, labelWidthMm: 100, labelHeightMm: 50, gapMm: 0, qrSizeMm: 27, roll: true, layout: "roll-dense" },
  { id: "roll-80x50", name: "Tem cuộn · 80 × 50 mm", description: "Khổ phổ biến cho Zebra / Godex", pageSize: "80mm 50mm", columns: 1, rows: 1, labelWidthMm: 80, labelHeightMm: 50, gapMm: 0, qrSizeMm: 25, roll: true, layout: "roll-dense" },
  { id: "roll-100x30", name: "Tem cuộn · 100 × 30 mm", description: "Tem ngang dài, ưu tiên mã hàng và QR", pageSize: "100mm 30mm", columns: 1, rows: 1, labelWidthMm: 100, labelHeightMm: 30, gapMm: 0, qrSizeMm: 17, roll: true, layout: "roll-ultra" },
  { id: "roll-70x30", name: "Tem cuộn · 70 × 30 mm", description: "Khổ nhỏ phổ biến cho mã hàng", pageSize: "70mm 30mm", columns: 1, rows: 1, labelWidthMm: 70, labelHeightMm: 30, gapMm: 0, qrSizeMm: 15, roll: true, layout: "roll-ultra" },
  { id: "roll-62x29", name: "Tem cuộn · 62 × 29 mm", description: "Brother QL · bố cục siêu gọn cho tem nhỏ", pageSize: "62mm 29mm", columns: 1, rows: 1, labelWidthMm: 62, labelHeightMm: 29, gapMm: 0, qrSizeMm: 14, roll: true, layout: "roll-ultra" },
  { id: "roll-50x30", name: "Tem cuộn · 50 × 30 mm", description: "Tem nhỏ, ưu tiên QR và mã hàng", pageSize: "50mm 30mm", columns: 1, rows: 1, labelWidthMm: 50, labelHeightMm: 30, gapMm: 0, qrSizeMm: 13, roll: true, layout: "roll-ultra" },
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

function infoCell(label: string, value: string): string {
  return `<span><b>${label}</b>${escapeHtml(value || "-")}</span>`;
}

function labelContent(document: InternalDocument, template: LabelTemplate): string {
  const product = document.product;
  const qcNo = document.uploaded?.qcNo ?? document.qc.recordId;
  const inspector = `${document.qc.inspectionDate} · ${document.qc.inspector || "Chưa ghi người kiểm tra"}`;
  const wide = template.layout === "roll-dense";
  if (wide) {
    return `<div class="label-top"><span>DIGITAL QC</span><b class="label-status">QC ${escapeHtml(qcNo)}</b></div><strong class="label-part">${escapeHtml(product.partNo)}</strong><div class="label-name">${escapeHtml(product.productName ?? "")}</div><div class="label-primary"><span><b>PO</b>${escapeHtml(product.po)}</span><span><b>SL</b>${escapeHtml(`${product.quantity} ${product.unit}`)}</span><span><b>NCC</b>${escapeHtml(product.supplier ?? "-")}</span></div><div class="label-grid">${infoCell("DA", product.project)}${infoCell("LOT", product.lotNo ?? "N/A")}${infoCell("NK", product.slipNo)}${infoCell("IN", product.receivedDate)}</div><div class="label-footer">KT ${escapeHtml(inspector)}</div><small>QUÉT QR ĐỂ MỞ HỒ SƠ QC</small>`;
  }

  const cells = [
    infoCell("PO", product.po),
    infoCell("QC", qcNo),
    infoCell("SL", `${product.quantity} ${product.unit}`),
    infoCell("NCC", product.supplier ?? "-"),
    infoCell("LOT", product.lotNo ?? "N/A"),
    infoCell("NK", product.slipNo),
    infoCell("DA", product.project),
    infoCell("IN", product.receivedDate),
  ].join("");
  return `<div class="label-top"><span>DIGITAL QC</span><b class="label-status">QC ${escapeHtml(qcNo)}</b></div><strong class="label-part">${escapeHtml(product.partNo)}</strong><div class="label-name">${escapeHtml(product.productName ?? "")}</div><div class="label-grid">${cells}</div><div class="label-footer">KT ${escapeHtml(inspector)}</div>`;
}

export function labelMarkup(document: InternalDocument, template: LabelTemplate, qrDataUrl: string): string {
  const product = document.product;
  const qcNo = document.uploaded?.qcNo ?? document.qc.recordId;
  const labelScale = Math.min(1.8, Math.max(0.78, Math.min(template.labelWidthMm / 62, template.labelHeightMm / 29)));
  if (template.layout === "roll-ultra") {
    const bottom = [
      infoCell("DA", product.project),
      infoCell("LOT", product.lotNo ?? "N/A"),
      infoCell("NK", product.slipNo),
      infoCell("IN", product.receivedDate),
    ].join("");
    return `<article class="label" style="--label-scale:${labelScale}" data-layout="${template.layout}" data-template="${template.id}"><div class="label-upper"><img class="qr" src="${qrDataUrl}" alt="QR ${escapeHtml(product.partNo)}" /><div class="label-copy"><div class="label-top"><span> DIGITAL QC</span><b>QC ${escapeHtml(qcNo)}</b></div><strong class="label-part">${escapeHtml(product.partNo)}</strong><div class="label-name">${escapeHtml(product.productName ?? "")}</div><div class="label-primary"><span><b>PO</b>${escapeHtml(product.po)}</span><span><b>SL</b>${escapeHtml(`${product.quantity} ${product.unit}`)}</span><span><b>NCC</b>${escapeHtml(product.supplier ?? "-")}</span></div></div></div><div class="label-bottom"><div class="label-grid">${bottom}</div><div class="label-footer">KT ${escapeHtml(document.qc.inspectionDate)} · ${escapeHtml(document.qc.inspector || "Chưa ghi người kiểm tra")}</div></div></article>`;
  }
  return `<article class="label" style="--label-scale:${labelScale}" data-layout="${template.layout}" data-template="${template.id}"><img class="qr" src="${qrDataUrl}" alt="QR ${escapeHtml(product.partNo)}" /><div class="label-copy">${labelContent(document, template)}</div></article>`;
}

export function printSheetHtml(document: InternalDocument, template: LabelTemplate, copies: number, qrDataUrl: string): string {
  const labels = Array.from({ length: Math.max(1, Math.min(copies, 100)) }, () => labelMarkup(document, template, qrDataUrl)).join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><title>Tem ${escapeHtml(document.product.partNo)}</title><style>
    @page { size: ${template.pageSize}; margin: ${template.roll ? "0" : "8mm"}; }
    * { box-sizing: border-box; } html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, sans-serif; color: #0f172a; }
    .sheet { display: grid; grid-template-columns: repeat(${template.columns}, ${template.labelWidthMm}mm); gap: ${template.gapMm}mm; align-content: start; }
    .label { display: flex; align-items: center; gap: 3mm; width: ${template.labelWidthMm}mm; height: ${template.labelHeightMm}mm; padding: 3mm; overflow: hidden; border: .25mm solid #cbd5e1; page-break-inside: avoid; }
    .qr { width: ${template.qrSizeMm}mm; height: ${template.qrSizeMm}mm; flex: 0 0 auto; }
    .label-copy { display: grid; min-width: 0; flex: 1; gap: 1.1mm; line-height: 1.05; }
    .label-top { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; border-bottom: .25mm solid #0f172a; padding-bottom: .7mm; }
    .label-top span { font-size: calc(5.2pt * var(--label-scale)); font-weight: 800; letter-spacing: .4pt; } .label-top b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #2563eb; font-size: calc(5.5pt * var(--label-scale)); } .label-part { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(12pt * var(--label-scale)); letter-spacing: .15pt; }
    .label-name, .label-footer, .label-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .label-name { font-size: calc(7pt * var(--label-scale)); font-weight: 700; } .label-grid { display: grid; grid-template-columns: 1fr 1fr; gap: calc(.8mm * var(--label-scale)) calc(2mm * var(--label-scale)); min-width: 0; }
    .label-grid span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(6.2pt * var(--label-scale)); } .label-grid b { margin-right: calc(1mm * var(--label-scale)); font-size: calc(5.2pt * var(--label-scale)); color: #475569; }
    .label-primary { display: grid; grid-template-columns: 1.25fr .75fr 1fr; gap: calc(1.5mm * var(--label-scale)); border-top: .3mm solid #0f172a; border-bottom: .2mm solid #cbd5e1; padding: calc(.8mm * var(--label-scale)) 0; } .label-primary span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(6.5pt * var(--label-scale)); font-weight: 700; } .label-primary b { display: block; color: #475569; font-size: calc(5pt * var(--label-scale)); }
    .label-footer { border-top: .2mm solid #cbd5e1; padding-top: calc(.7mm * var(--label-scale)); color: #475569; font-size: calc(5.5pt * var(--label-scale)); }
    .label-copy small { margin-top: calc(.2mm * var(--label-scale)); color: #475569; font-size: calc(5pt * var(--label-scale)); letter-spacing: .2pt; }
    [data-layout="roll-dense"] .qr { order: 2; } [data-layout="roll-dense"] .label-copy { order: 1; } [data-template="roll-80x50"] .qr { width: 25mm; height: 25mm; } [data-template="roll-80x50"] .label-part { font-size: calc(10pt * var(--label-scale)); }
    [data-template="roll-100x30"] { padding: 1.8mm; gap: 1.8mm; } [data-template="roll-100x30"] .label-copy { gap: .45mm; } [data-template="roll-100x30"] .label-part { font-size: 7.5pt; } [data-template="roll-100x30"] .label-name { font-size: 4.8pt; } [data-template="roll-100x30"] .label-primary { padding: .35mm 0; gap: 1.2mm; } [data-template="roll-100x30"] .label-primary span, [data-template="roll-100x30"] .label-grid span { font-size: 4.5pt; } [data-template="roll-100x30"] .label-primary b, [data-template="roll-100x30"] .label-grid b { font-size: 3.8pt; } [data-template="roll-100x30"] .label-grid { gap: .2mm 1.2mm; } [data-template="roll-100x30"] .label-footer { font-size: 3.8pt; padding-top: .3mm; } [data-template="roll-100x30"] .label-copy small { display: none; }
    [data-layout="roll-ultra"] { display: grid; grid-template-rows: 1fr auto; align-items: stretch; padding: calc(1.5mm * var(--label-scale)); gap: calc(.9mm * var(--label-scale)); } [data-layout="roll-ultra"] .label-upper { display: flex; align-items: center; min-height: 0; gap: calc(1.8mm * var(--label-scale)); } [data-layout="roll-ultra"] .label-upper .qr { width: auto; height: ${Math.max(10, template.qrSizeMm - 1)}mm; } [data-layout="roll-ultra"] .label-upper .label-copy { gap: calc(.35mm * var(--label-scale)); } [data-layout="roll-ultra"] .label-top { padding-bottom: calc(.3mm * var(--label-scale)); } [data-layout="roll-ultra"] .label-top span { font-size: calc(4pt * var(--label-scale)); } [data-layout="roll-ultra"] .label-top b { font-size: calc(4.2pt * var(--label-scale)); } [data-layout="roll-ultra"] .label-part { font-size: calc(7pt * var(--label-scale)); } [data-layout="roll-ultra"] .label-name { font-size: calc(4.7pt * var(--label-scale)); } [data-layout="roll-ultra"] .label-primary { padding: calc(.3mm * var(--label-scale)) 0; gap: calc(1.2mm * var(--label-scale)); } [data-layout="roll-ultra"] .label-primary span { font-size: calc(4.2pt * var(--label-scale)); } [data-layout="roll-ultra"] .label-primary b { font-size: calc(3.6pt * var(--label-scale)); } [data-layout="roll-ultra"] .label-bottom .label-grid { grid-template-columns: repeat(4, 1fr); gap: calc(.2mm * var(--label-scale)) calc(1mm * var(--label-scale)); } [data-layout="roll-ultra"] .label-bottom .label-grid span { font-size: calc(3.8pt * var(--label-scale)); } [data-layout="roll-ultra"] .label-bottom .label-grid b { margin-right: calc(.4mm * var(--label-scale)); font-size: calc(3.4pt * var(--label-scale)); } [data-layout="roll-ultra"] .label-bottom .label-footer { padding-top: calc(.25mm * var(--label-scale)); font-size: calc(3.6pt * var(--label-scale)); }
    [data-template="roll-50x30"], [data-template="roll-62x29"] { padding: 1.4mm; gap: .7mm; } [data-template="roll-50x30"] .label-upper, [data-template="roll-62x29"] .label-upper { gap: 1.5mm; } [data-template="roll-50x30"] .label-upper .qr, [data-template="roll-62x29"] .label-upper .qr { height: ${template.id === "roll-50x30" ? 10 : 11}mm; } [data-template="roll-50x30"] .label-upper .label-copy, [data-template="roll-62x29"] .label-upper .label-copy { gap: .6mm; } [data-template="roll-50x30"] .label-part, [data-template="roll-62x29"] .label-part { font-size: 7.5pt; } [data-template="roll-50x30"] .label-name, [data-template="roll-62x29"] .label-name { font-size: 5.3pt; } [data-template="roll-50x30"] .label-primary, [data-template="roll-62x29"] .label-primary { padding: .4mm 0; gap: 1mm; } [data-template="roll-50x30"] .label-primary span, [data-template="roll-62x29"] .label-primary span { font-size: 5pt; } [data-template="roll-50x30"] .label-primary b, [data-template="roll-62x29"] .label-primary b { font-size: 4pt; } [data-template="roll-50x30"] .label-bottom .label-grid, [data-template="roll-62x29"] .label-bottom .label-grid { grid-template-columns: 1fr 1fr; gap: .25mm 1.2mm; } [data-template="roll-50x30"] .label-bottom .label-grid span, [data-template="roll-62x29"] .label-bottom .label-grid span { font-size: 4.3pt; } [data-template="roll-50x30"] .label-bottom .label-grid b, [data-template="roll-62x29"] .label-bottom .label-grid b { font-size: 3.8pt; } [data-template="roll-50x30"] .label-bottom .label-footer, [data-template="roll-62x29"] .label-bottom .label-footer { font-size: 4pt; }
    [data-template="roll-50x30"] { grid-template-rows: auto 1fr; padding: 1.2mm; gap: .6mm; } [data-template="roll-50x30"] .label-upper { display: grid; grid-template-columns: 1fr; grid-template-rows: auto 1fr; align-content: center; gap: .45mm; } [data-template="roll-50x30"] .label-upper .qr { justify-self: center; height: 8.5mm; } [data-template="roll-50x30"] .label-upper .label-copy { width: 100%; gap: .35mm; } [data-template="roll-50x30"] .label-top { padding-bottom: .2mm; } [data-template="roll-50x30"] .label-top span { font-size: 4pt; } [data-template="roll-50x30"] .label-top b { font-size: 4.5pt; } [data-template="roll-50x30"] .label-part { text-align: center; font-size: 7.5pt; } [data-template="roll-50x30"] .label-name { text-align: center; font-size: 4.8pt; } [data-template="roll-50x30"] .label-primary { padding: .3mm 0; gap: 1mm; } [data-template="roll-50x30"] .label-primary span { font-size: 4.6pt; } [data-template="roll-50x30"] .label-primary b { font-size: 3.6pt; } [data-template="roll-50x30"] .label-bottom .label-grid { gap: .15mm 1mm; } [data-template="roll-50x30"] .label-bottom .label-grid span { font-size: 4.1pt; } [data-template="roll-50x30"] .label-bottom .label-footer { font-size: 3.8pt; }
    [data-template="roll-50x30"] { display: grid !important; grid-template-rows: 1fr auto !important; padding: 1.2mm !important; gap: .7mm !important; } [data-template="roll-50x30"] .label-upper { display: grid !important; grid-template-columns: 1fr auto !important; grid-template-rows: 1fr !important; align-items: center !important; gap: 1.5mm !important; } [data-template="roll-50x30"] .label-upper .qr { order: 2 !important; grid-column: 2 !important; grid-row: 1 !important; justify-self: end !important; height: 9mm !important; width: 9mm !important; } [data-template="roll-50x30"] .label-upper .label-copy { order: 1 !important; grid-column: 1 !important; grid-row: 1 !important; width: auto !important; gap: .7mm !important; } [data-template="roll-50x30"] .label-top { padding-bottom: .4mm !important; } [data-template="roll-50x30"] .label-top span { font-size: 5pt !important; } [data-template="roll-50x30"] .label-top b { font-size: 6pt !important; } [data-template="roll-50x30"] .label-part { text-align: left !important; font-size: 9pt !important; } [data-template="roll-50x30"] .label-name { text-align: left !important; font-size: 6pt !important; } [data-template="roll-50x30"] .label-primary { padding: .5mm 0 !important; gap: 1.5mm !important; } [data-template="roll-50x30"] .label-primary span { font-size: 6pt !important; } [data-template="roll-50x30"] .label-primary b { font-size: 4.5pt !important; } [data-template="roll-50x30"] .label-bottom .label-grid { grid-template-columns: 1fr 1fr !important; gap: .4mm 1.5mm !important; } [data-template="roll-50x30"] .label-bottom .label-grid span { font-size: 5.2pt !important; } [data-template="roll-50x30"] .label-bottom .label-grid b { font-size: 4.3pt !important; } [data-template="roll-50x30"] .label-bottom .label-footer { font-size: 4.8pt !important; }
    ${template.roll ? ".label { page-break-after: always; border: 0; }" : ""}
  </style></head><body><main class="sheet">${labels}</main><script>window.onload=()=>window.print();</script></body></html>`;
}
