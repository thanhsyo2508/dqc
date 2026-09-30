import QRCode from "qrcode";
import type { InternalDocument } from "../domain/document-store.js";

export type LabelLayout = "part-header" | "qr-left" | "qr-supplier";
export type LabelDensity = "compact" | "standard" | "large";

export interface LabelMetrics {
  paddingMm: number;
  gapMm: number;
  qrGapMm: number;
  partPt: number;
  primaryPt: number;
  secondaryPt: number;
  footerPt: number;
}

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
  layout: LabelLayout;
  density: LabelDensity;
  metrics: LabelMetrics;
}

export interface PrinterProfile {
  id: string;
  name: string;
  family: string;
  templateId: string;
  note: string;
}

export const LABEL_TEMPLATES: LabelTemplate[] = [
  { id: "a4-3x8", name: "A4 · 3 cột × 8 dòng", description: "Mã hàng trên đầu · QR lớn · 63,5×33,9 mm", pageSize: "A4", columns: 3, rows: 8, labelWidthMm: 63.5, labelHeightMm: 33.9, gapMm: 2.5, qrSizeMm: 22, roll: false, layout: "part-header", density: "compact", metrics: { paddingMm: 1, gapMm: 1.4, qrGapMm: .45, partPt: 9.5, primaryPt: 7.2, secondaryPt: 6.2, footerPt: 4.6 } },
  { id: "a4-2x4", name: "A4 · 2 cột × 4 dòng", description: "QR và NCC thành cột · mã hàng nổi bật · 91×60 mm", pageSize: "A4", columns: 2, rows: 4, labelWidthMm: 91, labelHeightMm: 60, gapMm: 4, qrSizeMm: 38, roll: false, layout: "qr-supplier", density: "large", metrics: { paddingMm: 2.2, gapMm: 3, qrGapMm: .8, partPt: 18, primaryPt: 11, secondaryPt: 9.2, footerPt: 6.5 } },
  { id: "roll-100x50", name: "Tem cuộn · 100 × 50 mm", description: "QR và NCC thành cột · tận dụng toàn bộ mặt tem", pageSize: "100mm 50mm", columns: 1, rows: 1, labelWidthMm: 100, labelHeightMm: 50, gapMm: 0, qrSizeMm: 36, roll: true, layout: "qr-supplier", density: "large", metrics: { paddingMm: 1.8, gapMm: 3, qrGapMm: .65, partPt: 17, primaryPt: 10.5, secondaryPt: 9, footerPt: 6 } },
  { id: "roll-80x50", name: "Tem cuộn · 80 × 50 mm", description: "Mã hàng trên đầu · QR lớn · dễ đọc từ xa", pageSize: "80mm 50mm", columns: 1, rows: 1, labelWidthMm: 80, labelHeightMm: 50, gapMm: 0, qrSizeMm: 32, roll: true, layout: "part-header", density: "large", metrics: { paddingMm: 1.6, gapMm: 2.5, qrGapMm: .55, partPt: 16.5, primaryPt: 10.5, secondaryPt: 9, footerPt: 6 } },
  { id: "roll-100x30", name: "Tem cuộn · 100 × 30 mm", description: "QR trái · thông tin chính bên phải · 100×30 mm", pageSize: "100mm 30mm", columns: 1, rows: 1, labelWidthMm: 100, labelHeightMm: 30, gapMm: 0, qrSizeMm: 24, roll: true, layout: "qr-left", density: "standard", metrics: { paddingMm: 1.2, gapMm: 2.2, qrGapMm: .4, partPt: 11.5, primaryPt: 8.3, secondaryPt: 6.8, footerPt: 4.8 } },
  { id: "roll-70x30", name: "Tem cuộn · 70 × 30 mm", description: "Mã hàng trên đầu · QR lớn · 70×30 mm", pageSize: "70mm 30mm", columns: 1, rows: 1, labelWidthMm: 70, labelHeightMm: 30, gapMm: 0, qrSizeMm: 20, roll: true, layout: "part-header", density: "compact", metrics: { paddingMm: 1, gapMm: 1.5, qrGapMm: .4, partPt: 9.5, primaryPt: 7.3, secondaryPt: 6.2, footerPt: 4.7 } },
  { id: "roll-62x29", name: "Tem cuộn · 62 × 29 mm", description: "QR trái · chữ đậm, ít chi tiết phụ · 62×29 mm", pageSize: "62mm 29mm", columns: 1, rows: 1, labelWidthMm: 62, labelHeightMm: 29, gapMm: 0, qrSizeMm: 22, roll: true, layout: "qr-left", density: "compact", metrics: { paddingMm: 1, gapMm: 1.4, qrGapMm: .4, partPt: 9.2, primaryPt: 7.2, secondaryPt: 6.2, footerPt: 4.6 } },
  { id: "roll-50x30", name: "Tem cuộn · 50 × 30 mm", description: "Mã hàng trên đầu · bố cục tối ưu tem nhỏ 50×30 mm", pageSize: "50mm 30mm", columns: 1, rows: 1, labelWidthMm: 50, labelHeightMm: 30, gapMm: 0, qrSizeMm: 18, roll: true, layout: "part-header", density: "compact", metrics: { paddingMm: 1, gapMm: 1.1, qrGapMm: .4, partPt: 8.4, primaryPt: 6.8, secondaryPt: 5.8, footerPt: 4.4 } },
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

export async function createQrDataUrl(payload: string, width = 360): Promise<string> {
  return QRCode.toDataURL(payload, {
    width,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] ?? character);
}

function formatLabelDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value || "N/A";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${match[3]}/${months[Number(match[2]) - 1] ?? match[2]}/${match[1]}`;
}

function labelValues(document: InternalDocument) {
  const product = document.product;
  return {
    qcRecordId: escapeHtml(document.qc.recordId),
    project: escapeHtml(product.project || "N/A"),
    quantity: escapeHtml(`${product.quantity} ${product.unit}`.trim()),
    supplier: escapeHtml(product.supplier || "N/A"),
    partNo: escapeHtml(product.partNo || "N/A"),
    productName: escapeHtml(product.productName || "N/A"),
    reference: escapeHtml(product.po || product.lotNo || "N/A"),
    slipNo: escapeHtml(product.slipNo || "N/A"),
    receivedDate: escapeHtml(formatLabelDate(product.receivedDate)),
  };
}

function qrImage(qrDataUrl: string, partNo: string): string {
  return `<img class="qc-label__qr" src="${qrDataUrl}" alt="QR ${partNo}" />`;
}

function footer(slipNo: string, receivedDate: string): string {
  return `<footer class="qc-label__footer"><span>${slipNo}</span><time>${receivedDate}</time></footer>`;
}

function projectAndQuantity(project: string, quantity: string): string {
  return `<div class="qc-label__headline"><strong class="qc-label__project">${project}</strong><strong class="qc-label__quantity">${quantity}</strong></div>`;
}

function qcRecordLine(qcRecordId: string): string {
  return `<div class="qc-label__record-id">HS QC: ${qcRecordId}</div>`;
}

function productCopy(values: ReturnType<typeof labelValues>, includeSupplier = true): string {
  return `<div class="qc-label__copy">${projectAndQuantity(values.project, values.quantity)}${includeSupplier ? `<strong class="qc-label__supplier">${values.supplier}</strong>` : ""}<strong class="qc-label__part">${values.partNo}</strong><em class="qc-label__name">${values.productName}</em><span class="qc-label__reference">${values.reference}</span></div>`;
}

function mainContent(document: InternalDocument, template: LabelTemplate, qrDataUrl: string): string {
  const values = labelValues(document);
  const qr = qrImage(qrDataUrl, values.partNo);
  if (template.layout === "part-header") {
    return `<header class="qc-label__part-banner">${values.partNo}</header><div class="qc-label__main"><div class="qc-label__qr-stack">${qr}</div><div class="qc-label__copy">${projectAndQuantity(values.project, values.quantity)}<strong class="qc-label__supplier">${values.supplier}</strong><em class="qc-label__name">${values.productName}</em><span class="qc-label__reference">${values.reference}</span></div></div>`;
  }
  if (template.layout === "qr-supplier") {
    return `<div class="qc-label__main"><div class="qc-label__qr-stack">${qr}<strong>${values.supplier}</strong></div>${productCopy(values, false)}</div>`;
  }
  return `<div class="qc-label__main">${qr}${productCopy(values)}</div>`;
}

function cqwFromMm(valueMm: number, template: LabelTemplate): string {
  return `${((valueMm / template.labelWidthMm) * 100).toFixed(3)}cqw`;
}

function cqwFromPt(valuePt: number, template: LabelTemplate): string {
  return cqwFromMm(valuePt * 0.352778, template);
}

function fittingPartBannerPt(partNo: string, template: LabelTemplate): number {
  const availableWidthMm = template.labelWidthMm - (template.metrics.paddingMm * 2);
  const characterCount = Math.max(partNo.trim().length, 1);
  const estimatedFitPt = availableWidthMm / (characterCount * .68 * .352778);
  return Math.max(1, Math.min(template.metrics.partPt, estimatedFitPt));
}

export function labelMarkup(document: InternalDocument, template: LabelTemplate, qrDataUrl: string): string {
  const values = labelValues(document);
  const partBannerPt = fittingPartBannerPt(document.product.partNo || "N/A", template);
  const qrRatio = ((template.qrSizeMm / template.labelWidthMm) * 100).toFixed(3);
  const metrics = template.metrics;
  const style = [
    `--qr-size:${template.qrSizeMm}mm`, `--qr-ratio:${qrRatio}%`,
    `--pad:${metrics.paddingMm}mm`, `--gap:${metrics.gapMm}mm`, `--qr-stack-gap:${metrics.qrGapMm}mm`,
    `--part-font:${metrics.partPt}pt`, `--part-banner-font:${partBannerPt.toFixed(3)}pt`, `--primary-font:${metrics.primaryPt}pt`, `--secondary-font:${metrics.secondaryPt}pt`, `--footer-font:${metrics.footerPt}pt`,
    `--preview-pad:${cqwFromMm(metrics.paddingMm, template)}`, `--preview-bottom-pad:${cqwFromMm(.8, template)}`,
    `--preview-gap:${cqwFromMm(metrics.gapMm, template)}`, `--preview-qr-stack-gap:${cqwFromMm(metrics.qrGapMm, template)}`,
    `--preview-part-font:${cqwFromPt(metrics.partPt, template)}`, `--preview-primary-font:${cqwFromPt(metrics.primaryPt, template)}`,
    `--preview-secondary-font:${cqwFromPt(metrics.secondaryPt, template)}`, `--preview-footer-font:${cqwFromPt(metrics.footerPt, template)}`,
  ].join(";");
  return `<article class="qc-label" style="${style}" data-layout="${template.layout}" data-density="${template.density}" data-template="${template.id}">${mainContent(document, template, qrDataUrl)}${qcRecordLine(values.qcRecordId)}${footer(values.slipNo, values.receivedDate)}</article>`;
}

function previewUnitsFromMm(valueMm: number): number {
  return valueMm * 10;
}

function previewUnitsFromPt(valuePt: number): number {
  return valuePt * 3.52778;
}

function inlineStyle(parts: Array<string | false>): string {
  return parts.filter(Boolean).join(";");
}

/**
 * Builds a self-contained preview in a fixed logical coordinate system.
 * The SVG viewBox scales the complete label as one unit, so preview sizing does
 * not depend on application CSS, container query units, or WebView style cache.
 */
export function labelPreviewMarkup(document: InternalDocument, template: LabelTemplate, qrDataUrl: string): string {
  const values = labelValues(document);
  const unitWidth = previewUnitsFromMm(template.labelWidthMm);
  const unitHeight = previewUnitsFromMm(template.labelHeightMm);
  const padding = previewUnitsFromMm(template.metrics.paddingMm);
  const bottomPadding = previewUnitsFromMm(.8);
  const gap = previewUnitsFromMm(template.metrics.gapMm);
  const qrGap = previewUnitsFromMm(template.metrics.qrGapMm);
  const qrSize = previewUnitsFromMm(template.qrSizeMm);
  const partFont = previewUnitsFromPt(template.metrics.partPt);
  const partBannerFont = previewUnitsFromPt(fittingPartBannerPt(document.product.partNo || "N/A", template));
  const primaryFont = previewUnitsFromPt(template.metrics.primaryPt);
  const secondaryFont = previewUnitsFromPt(template.metrics.secondaryPt);
  const footerFont = previewUnitsFromPt(template.metrics.footerPt);
  const isSmallestRoll = template.id === "roll-50x30";
  const headlineGap = previewUnitsFromMm(isSmallestRoll ? .25 : .55);
  const primaryMargin = previewUnitsFromMm(isSmallestRoll ? .3 : .7);
  const detailMargin = previewUnitsFromMm(isSmallestRoll ? .3 : .8);

  const rootStyle = inlineStyle([
    "box-sizing:border-box",
    "display:grid",
    template.layout === "part-header" ? "grid-template-rows:auto minmax(0,1fr) auto auto" : "grid-template-rows:minmax(0,1fr) auto auto",
    "width:100%",
    "height:100%",
    `padding:${padding}px ${padding}px ${bottomPadding}px`,
    "overflow:hidden",
    "border:2px solid #111",
    "background:#fff",
    "color:#000",
    "font-family:Arial,Helvetica,sans-serif",
  ]);
  const mainColumns = template.layout === "qr-supplier"
    ? `${qrSize + 20}px minmax(0,1fr)`
    : template.layout === "part-header"
      ? `${qrSize + 10}px minmax(0,1fr)`
      : `${qrSize}px minmax(0,1fr)`;
  const mainStyle = inlineStyle([
    "box-sizing:border-box",
    "display:grid",
    `grid-template-columns:${mainColumns}`,
    "align-items:center",
    `gap:${gap}px`,
    "min-width:0",
    "min-height:0",
    "overflow:hidden",
  ]);
  const qrStyle = inlineStyle([
    "box-sizing:border-box",
    "display:block",
    `width:${qrSize}px`,
    `height:${qrSize}px`,
    "max-width:100%",
    "max-height:100%",
    "aspect-ratio:1",
    "object-fit:contain",
    "image-rendering:pixelated",
  ]);
  const stackStyle = inlineStyle([
    "box-sizing:border-box",
    "display:flex",
    "min-width:0",
    "min-height:0",
    "height:100%",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    `gap:${qrGap}px`,
    "overflow:hidden",
    template.layout === "qr-supplier" && "border-right:2px solid #c4c4c4",
    template.layout === "qr-supplier" && "padding-right:20px",
  ]);
  const copyStyle = "box-sizing:border-box;display:flex;min-width:0;min-height:0;flex-direction:column;justify-content:center;align-items:flex-start;overflow:hidden;line-height:1";
  const headlineStyle = `box-sizing:border-box;display:grid;width:100%;gap:${headlineGap}px;font-size:${primaryFont}px;line-height:1`;
  const projectStyle = "min-width:0;overflow:hidden;overflow-wrap:anywhere;font-weight:900;line-height:1.05";
  const quantityStyle = "min-width:0;font-weight:900;white-space:nowrap";
  const supplierStyle = `box-sizing:border-box;margin-top:${primaryMargin}px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:${primaryFont}px;font-weight:900;line-height:1`;
  const partStyle = `box-sizing:border-box;margin-top:${detailMargin}px;overflow:hidden;overflow-wrap:anywhere;word-break:break-word;font-size:${partFont}px;font-weight:900;letter-spacing:.8px;line-height:.95`;
  const nameStyle = `box-sizing:border-box;margin-top:${detailMargin}px;max-width:100%;overflow:hidden;font-size:${secondaryFont}px;font-style:italic;line-height:1.05`;
  const referenceStyle = `box-sizing:border-box;margin-top:${primaryMargin}px;max-width:100%;overflow:hidden;font-size:${secondaryFont}px;line-height:1`;
  const recordStyle = `box-sizing:border-box;max-width:100%;overflow:hidden;padding-top:${previewUnitsFromMm(.35)}px;text-overflow:ellipsis;white-space:nowrap;font-size:${footerFont + 5.333}px;font-weight:700;line-height:1`;
  const footerStyle = `box-sizing:border-box;display:flex;min-width:0;align-items:flex-end;justify-content:space-between;gap:20px;border-top:2px solid #b8b8b8;padding-top:${previewUnitsFromMm(.5)}px;overflow:hidden;font-size:${footerFont}px;line-height:1;white-space:nowrap`;
  const footerItemStyle = "min-width:0;overflow:hidden;text-overflow:ellipsis";
  const qr = `<img src="${qrDataUrl}" alt="QR ${values.partNo}" style="${qrStyle}" />`;
  const headline = `<div style="${headlineStyle}"><strong style="${projectStyle}">${values.project}</strong><strong style="${quantityStyle}">${values.quantity}</strong></div>`;
  const copy = (includeSupplier = true, includePart = true) => `<div style="${copyStyle}">${headline}${includeSupplier ? `<strong style="${supplierStyle}">${values.supplier}</strong>` : ""}${includePart ? `<strong data-field="part-number" style="${partStyle}">${values.partNo}</strong>` : ""}<em style="${nameStyle}">${values.productName}</em><span style="${referenceStyle}">${values.reference}</span></div>`;

  let content: string;
  if (template.layout === "part-header") {
    const bannerStyle = inlineStyle([
      "box-sizing:border-box",
      `margin-bottom:${previewUnitsFromMm(.8)}px`,
      "max-height:1.9em",
      "overflow:hidden",
      "overflow-wrap:anywhere",
      "word-break:break-word",
      `font-size:${partBannerFont}px`,
      "font-weight:900",
      "letter-spacing:.8px",
      "line-height:.95",
      template.id === "roll-50x30" && "white-space:nowrap",
      template.id === "roll-50x30" && "text-overflow:ellipsis",
    ]);
    content = `<header data-field="part-number" style="${bannerStyle}">${values.partNo}</header><div style="${mainStyle}"><div style="${stackStyle}">${qr}</div>${copy(true, false)}</div>`;
  } else if (template.layout === "qr-supplier") {
    const stackSupplierStyle = `max-width:100%;overflow:hidden;text-align:center;text-overflow:ellipsis;white-space:nowrap;font-size:${primaryFont}px;font-weight:900;line-height:1`;
    content = `<div style="${mainStyle}"><div style="${stackStyle}">${qr}<strong style="${stackSupplierStyle}">${values.supplier}</strong></div>${copy(false)}</div>`;
  } else {
    content = `<div style="${mainStyle}">${qr}${copy()}</div>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${unitWidth} ${unitHeight}" role="img" aria-label="Preview tem ${values.partNo}" style="display:block;width:100%;height:auto;aspect-ratio:${unitWidth}/${unitHeight};overflow:hidden;background:#fff"><foreignObject x="0" y="0" width="${unitWidth}" height="${unitHeight}"><article xmlns="http://www.w3.org/1999/xhtml" style="${rootStyle}">${content}<div style="${recordStyle}">HS QC: ${values.qcRecordId}</div><footer style="${footerStyle}"><span style="${footerItemStyle};flex:1 1 auto">${values.slipNo}</span><time style="${footerItemStyle};flex:0 0 auto">${values.receivedDate}</time></footer></article></foreignObject></svg>`;
}

function printStyles(template: LabelTemplate): string {
  return `
    @page { size: ${template.pageSize}; margin: ${template.roll ? "0" : "8mm"}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    .sheet { display: grid; grid-template-columns: repeat(${template.columns}, ${template.labelWidthMm}mm); gap: ${template.gapMm}mm; align-content: start; }
    .qc-label {
      --pad: 1.5mm; --gap: 1.8mm; --part-font: 11pt; --primary-font: 8pt; --secondary-font: 7pt; --footer-font: 5pt;
      display: grid; grid-template-rows: minmax(0, 1fr) auto auto; width: ${template.labelWidthMm}mm; height: ${template.labelHeightMm}mm;
      padding: var(--pad) var(--pad) .8mm; overflow: hidden; border: .22mm solid #111; background: #fff; page-break-inside: avoid; break-inside: avoid;
    }
    .qc-label[data-density="compact"] { --pad: 1.1mm; --gap: 1.2mm; --part-font: 9pt; --primary-font: 7pt; --secondary-font: 6pt; --footer-font: 4.5pt; }
    .qc-label[data-density="large"] { --pad: 2mm; --gap: 2.5mm; --part-font: 16pt; --primary-font: 10pt; --secondary-font: 8.5pt; --footer-font: 6pt; }
    .qc-label__main { display: grid; min-width: 0; min-height: 0; overflow: hidden; }
    .qc-label__qr { display: block; width: var(--qr-size); height: var(--qr-size); max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: pixelated; }
    .qc-label__copy { display: flex; min-width: 0; min-height: 0; flex-direction: column; justify-content: center; align-items: flex-start; overflow: hidden; line-height: 1; }
    .qc-label__headline { display: grid; width: 100%; gap: .55mm; font-size: var(--primary-font); line-height: 1; }
    .qc-label__headline strong { min-width: 0; font-weight: 900; }
    .qc-label__project { overflow: hidden; overflow-wrap: anywhere; line-height: 1.05; }
    .qc-label__quantity { white-space: nowrap; }
    .qc-label__supplier { margin-top: .7mm; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--primary-font); line-height: 1; }
    .qc-label__part, .qc-label__part-banner { overflow-wrap: anywhere; word-break: break-word; font-size: var(--part-font); font-weight: 900; letter-spacing: .08pt; line-height: .95; }
    .qc-label__part { margin-top: .8mm; }
    .qc-label__name { margin-top: .8mm; max-width: 100%; overflow: hidden; font-size: var(--secondary-font); line-height: 1.05; }
    .qc-label__reference { margin-top: .7mm; max-width: 100%; overflow: hidden; font-size: var(--secondary-font); line-height: 1; }
    .qc-label__record-id { max-width: 100%; overflow: hidden; padding-top: .35mm; text-overflow: ellipsis; white-space: nowrap; font-size: calc(var(--footer-font) + .4pt); font-weight: 700; line-height: 1; }
    .qc-label__footer { display: flex; min-width: 0; align-items: flex-end; justify-content: space-between; gap: 2mm; border-top: .18mm solid #b8b8b8; padding-top: .5mm; font-size: var(--footer-font); line-height: 1; white-space: nowrap; }
    .qc-label__footer span, .qc-label__footer time { overflow: hidden; text-overflow: ellipsis; }
    .qc-label__footer span { flex: 1 1 auto; } .qc-label__footer time { flex: 0 0 auto; }
    .qc-label__qr-stack { display: flex; min-width: 0; min-height: 0; flex-direction: column; align-items: center; justify-content: center; gap: var(--qr-stack-gap); overflow: hidden; }
    .qc-label__qr-stack strong { max-width: 100%; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; font-size: var(--primary-font); line-height: 1; }
    .qc-label[data-layout="qr-left"] .qc-label__main { grid-template-columns: var(--qr-size) minmax(0, 1fr); align-items: center; gap: var(--gap); }
    .qc-label[data-layout="qr-supplier"] .qc-label__main { grid-template-columns: calc(var(--qr-size) + 2mm) minmax(0, 1fr); align-items: stretch; gap: var(--gap); }
    .qc-label[data-layout="qr-supplier"] .qc-label__qr-stack { border-right: .18mm solid #c4c4c4; padding-right: 2mm; }
    .qc-label[data-layout="part-header"] { grid-template-rows: auto minmax(0, 1fr) auto auto; }
    .qc-label[data-layout="part-header"] .qc-label__part-banner { margin-bottom: .8mm; max-height: 1.9em; overflow: hidden; font-size: var(--part-banner-font, var(--part-font)); line-height: 1; white-space: nowrap; }
    .qc-label[data-layout="part-header"] .qc-label__main { grid-template-columns: calc(var(--qr-size) + 1mm) minmax(0, 1fr); align-items: center; gap: var(--gap); }
    .qc-label[data-template="roll-50x30"] { --part-font: 8.2pt; --primary-font: 6.5pt; --secondary-font: 5.8pt; --footer-font: 4.2pt; }
    .qc-label[data-template="roll-50x30"] .qc-label__part-banner { white-space: nowrap; }
    .qc-label[data-template="roll-62x29"] { --part-font: 8.8pt; --primary-font: 6.8pt; --secondary-font: 5.8pt; }
    .qc-label[data-template="roll-100x30"] .qc-label__headline { gap: .3mm; }
    .qc-label[data-template="roll-100x30"] .qc-label__supplier,
    .qc-label[data-template="roll-100x30"] .qc-label__part,
    .qc-label[data-template="roll-100x30"] .qc-label__name,
    .qc-label[data-template="roll-100x30"] .qc-label__reference { margin-top: .3mm; }
    ${template.roll ? ".qc-label { border: 0; break-after: page; page-break-after: always; } .qc-label:last-child { break-after: auto; page-break-after: auto; }" : ""}
  `;
}

export function printSheetHtml(document: InternalDocument, template: LabelTemplate, copies: number, qrDataUrl: string): string {
  const safeCopies = Math.max(1, Math.min(copies, 100));
  const labels = Array.from({ length: safeCopies }, () => labelMarkup(document, template, qrDataUrl)).join("");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"/><title>Tem ${escapeHtml(document.product.partNo)}</title><style>${printStyles(template)}</style></head><body><main class="sheet">${labels}</main><script>window.onload=()=>window.print();</script></body></html>`;
}
