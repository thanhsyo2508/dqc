import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ProductQc } from "../domain/product-qc.js";

export interface QcSheetOptions {
  fontBytes?: Uint8Array;
  fallbackFontBytes?: Uint8Array;
  fontName?: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

const NAVY = rgb(0.055, 0.12, 0.23);
const BLUE = rgb(0.11, 0.38, 0.78);
const PALE_BLUE = rgb(0.93, 0.96, 1);
const GREEN = rgb(0.05, 0.55, 0.35);
const PALE_GREEN = rgb(0.91, 0.98, 0.95);
const RED = rgb(0.78, 0.13, 0.13);
const PALE_RED = rgb(1, 0.94, 0.94);
const INK = rgb(0.10, 0.15, 0.23);
const MUTED = rgb(0.38, 0.45, 0.55);
const LINE = rgb(0.82, 0.86, 0.91);
const SURFACE = rgb(0.97, 0.98, 0.99);
const WHITE = rgb(1, 1, 1);

interface PdfFonts {
  primary: PDFFont;
  fallback?: PDFFont;
}

function usesFallback(character: string): boolean {
  // Match the exact unicode range shipped in Fontsource's Vietnamese subset.
  // Common accents such as à/á live in the Latin subset and must stay there.
  return /[\u0102-\u0103\u0110-\u0111\u0128-\u0129\u0168-\u0169\u01a0-\u01a1\u01af-\u01b0\u0300-\u0301\u0303-\u0304\u0308-\u0309\u0323\u0329\u1ea0-\u1ef9\u20ab]/u.test(character);
}

function fontRuns(value: string, fonts: PdfFonts): Array<{ value: string; font: PDFFont }> {
  const runs: Array<{ value: string; font: PDFFont }> = [];
  const safeValue = fonts.fallback
    ? value
    : value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  for (const character of safeValue) {
    const font = fonts.fallback && usesFallback(character) ? fonts.fallback : fonts.primary;
    const previous = runs[runs.length - 1];
    if (previous?.font === font) previous.value += character;
    else runs.push({ value: character, font });
  }
  return runs;
}

function textWidth(value: string, size: number, fonts: PdfFonts): number {
  return fontRuns(value, fonts).reduce((total, run) => total + run.font.widthOfTextAtSize(run.value, size), 0);
}

function fitText(value: string, fonts: PdfFonts, size: number, maxWidth: number): string {
  if (textWidth(value, size, fonts) <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && textWidth(`${result}...`, size, fonts) > maxWidth) result = result.slice(0, -1);
  return `${result}...`;
}

function drawText(page: PDFPage, value: string, x: number, y: number, fonts: PdfFonts, size = 9, maxWidth = CONTENT_WIDTH, color: Color = INK): void {
  let cursor = x;
  for (const run of fontRuns(fitText(String(value ?? ""), fonts, size, maxWidth), fonts)) {
    page.drawText(run.value, { x: cursor, y, size, font: run.font, color });
    cursor += run.font.widthOfTextAtSize(run.value, size);
  }
}

function drawRightText(page: PDFPage, value: string, right: number, y: number, fonts: PdfFonts, size: number, color: Color = INK): void {
  const width = textWidth(value, size, fonts);
  drawText(page, value, right - width, y, fonts, size, width + 2, color);
}

function sectionTitle(page: PDFPage, title: string, subtitle: string, y: number, fonts: PdfFonts): number {
  page.drawRectangle({ x: MARGIN, y: y - 22, width: 4, height: 22, color: BLUE });
  drawText(page, title, MARGIN + 12, y - 8, fonts, 10.5, 270, NAVY);
  drawRightText(page, subtitle, PAGE_WIDTH - MARGIN, y - 8, fonts, 7.5, MUTED);
  return y - 30;
}

function infoCell(page: PDFPage, label: string, value: string, x: number, y: number, width: number, fonts: PdfFonts): void {
  page.drawRectangle({ x, y: y - 36, width, height: 36, color: SURFACE, borderColor: LINE, borderWidth: 0.5 });
  drawText(page, label.toUpperCase(), x + 9, y - 12, fonts, 6.5, width - 18, MUTED);
  drawText(page, value || "-", x + 9, y - 27, fonts, 9, width - 18, INK);
}

function summaryCell(page: PDFPage, label: string, value: string, x: number, y: number, width: number, fonts: PdfFonts, accent: Color = BLUE): void {
  page.drawRectangle({ x, y: y - 44, width, height: 44, color: WHITE, borderColor: LINE, borderWidth: 0.6 });
  page.drawRectangle({ x, y: y - 44, width: 3, height: 44, color: accent });
  drawText(page, label.toUpperCase(), x + 10, y - 14, fonts, 6.5, width - 18, MUTED);
  drawText(page, value || "-", x + 10, y - 31, fonts, 9, width - 18, INK);
}

function drawHeader(page: PDFPage, data: ProductQc, fonts: PdfFonts, continued = false): number {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 104, width: PAGE_WIDTH, height: 104, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 104, width: 9, height: 104, color: BLUE });
  drawText(page, "DIGITAL QC", MARGIN, PAGE_HEIGHT - 30, fonts, 8, 180, rgb(0.55, 0.75, 1));
  drawText(page, continued ? "PHIẾU KIỂM TRA - TIẾP THEO" : "PHIẾU KIỂM TRA CHẤT LƯỢNG", MARGIN, PAGE_HEIGHT - 57, fonts, 18, 360, WHITE);
  drawText(page, continued ? "MEASUREMENT CONTINUATION" : "PRODUCT QUALITY CONTROL REPORT", MARGIN, PAGE_HEIGHT - 76, fonts, 8, 330, rgb(0.72, 0.78, 0.86));
  drawRightText(page, data.recordId, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 42, fonts, 9.5, WHITE);
  drawRightText(page, `Ngày kiểm tra: ${data.inspectionDate}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 62, fonts, 7.5, rgb(0.78, 0.84, 0.92));
  drawRightText(page, `Mã hàng: ${data.product.partNo}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 80, fonts, 7.5, rgb(0.78, 0.84, 0.92));
  return PAGE_HEIGHT - 126;
}

const MEASUREMENT_COLUMNS = ["STT", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "NGOẠI QUAN"];
const MEASUREMENT_WIDTHS = [32, 52, 52, 52, 52, 52, 52, 52, 127];

function drawMeasurementHeader(page: PDFPage, y: number, fonts: PdfFonts): number {
  let x = MARGIN;
  for (let index = 0; index < MEASUREMENT_COLUMNS.length; index += 1) {
    const width = MEASUREMENT_WIDTHS[index];
    page.drawRectangle({ x, y: y - 24, width, height: 24, color: NAVY });
    const label = MEASUREMENT_COLUMNS[index];
    const labelWidth = textWidth(label, 7, fonts);
    drawText(page, label, x + Math.max(5, (width - labelWidth) / 2), y - 16, fonts, 7, width - 8, WHITE);
    x += width;
  }
  return y - 24;
}

function drawMeasurementRow(page: PDFPage, values: string[], y: number, rowIndex: number, fonts: PdfFonts): number {
  let x = MARGIN;
  const rowHeight = 23;
  const fill = rowIndex % 2 === 0 ? WHITE : SURFACE;
  for (let index = 0; index < MEASUREMENT_WIDTHS.length; index += 1) {
    const width = MEASUREMENT_WIDTHS[index];
    const visual = index === MEASUREMENT_WIDTHS.length - 1 ? String(values[index] ?? "").toUpperCase() : "";
    const cellFill = visual === "OK" ? PALE_GREEN : visual === "NG" ? PALE_RED : fill;
    const textColor = visual === "OK" ? GREEN : visual === "NG" ? RED : INK;
    page.drawRectangle({ x, y: y - rowHeight, width, height: rowHeight, color: cellFill, borderColor: LINE, borderWidth: 0.45 });
    const value = values[index] ?? "";
    const valueWidth = textWidth(value, 7.5, fonts);
    drawText(page, value, x + Math.max(5, (width - valueWidth) / 2), y - 15, fonts, 7.5, width - 10, textColor);
    x += width;
  }
  return y - rowHeight;
}

function drawFooter(page: PDFPage, pageNumber: number, totalPages: number, fonts: PdfFonts): void {
  page.drawLine({ start: { x: MARGIN, y: 28 }, end: { x: PAGE_WIDTH - MARGIN, y: 28 }, thickness: 0.5, color: LINE });
  drawText(page, "Digital QC - Tài liệu được tạo tự động", MARGIN, 15, fonts, 6.5, 260, MUTED);
  drawRightText(page, `Trang ${pageNumber}/${totalPages}`, PAGE_WIDTH - MARGIN, 15, fonts, 6.5, MUTED);
}

export async function createQcSheetPdf(data: ProductQc, options: QcSheetOptions = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let fonts: PdfFonts;

  if (options.fontBytes) {
    pdf.registerFontkit(fontkit);
    fonts = {
      primary: await pdf.embedFont(options.fontBytes, { subset: true }),
      fallback: options.fallbackFontBytes ? await pdf.embedFont(options.fallbackFontBytes, { subset: true }) : undefined,
    };
  } else {
    fonts = { primary: await pdf.embedFont(StandardFonts.Helvetica) };
  }

  const product = data.product;
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = drawHeader(page, data, fonts);

  page.drawRectangle({ x: MARGIN, y: y - 78, width: CONTENT_WIDTH, height: 78, color: PALE_BLUE, borderColor: rgb(0.72, 0.82, 0.96), borderWidth: 0.8 });
  drawText(page, "MÃ HÀNG / PART NUMBER", MARGIN + 16, y - 19, fonts, 7, 220, MUTED);
  drawText(page, product.partNo, MARGIN + 16, y - 42, fonts, 16, 350, NAVY);
  drawText(page, product.productName ?? "-", MARGIN + 16, y - 62, fonts, 9, 350, MUTED);
  page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 118, y: y - 62, width: 102, height: 46, color: WHITE, borderColor: rgb(0.65, 0.78, 0.95), borderWidth: 0.7 });
  drawText(page, "SỐ LƯỢNG", PAGE_WIDTH - MARGIN - 106, y - 31, fonts, 6.5, 80, MUTED);
  drawText(page, `${product.quantity} ${product.unit}`, PAGE_WIDTH - MARGIN - 106, y - 51, fonts, 13, 82, BLUE);
  y -= 98;

  y = sectionTitle(page, "THÔNG TIN SẢN PHẨM", "Product information", y, fonts);
  const gap = 8;
  const cellWidth = (CONTENT_WIDTH - gap) / 2;
  const infoRows: Array<[[string, string], [string, string]]> = [
    [["Mã dự án", product.project], ["PO", product.po]],
    [["Nhà cung cấp", product.supplier ?? "-"], ["Số lot", product.lotNo ?? "N/A"]],
    [["Phiếu nhập kho", product.slipNo], ["Ngày nhập kho", product.receivedDate]],
  ];
  for (const row of infoRows) {
    infoCell(page, row[0][0], row[0][1], MARGIN, y, cellWidth, fonts);
    infoCell(page, row[1][0], row[1][1], MARGIN + cellWidth + gap, y, cellWidth, fonts);
    y -= 44;
  }

  y -= 4;
  y = sectionTitle(page, "KẾT QUẢ KIỂM TRA", "Inspection summary", y, fonts);
  const summaryWidth = CONTENT_WIDTH / 4;
  const defectAccent = (data.defectQuantity ?? 0) > 0 ? RED : GREEN;
  const summaries: Array<[string, string, Color]> = [
    ["Cấp độ", data.inspectionLevel ?? "-", BLUE],
    ["Người kiểm tra", data.inspector || "-", BLUE],
    ["Số lượng lỗi", String(data.defectQuantity ?? 0), defectAccent],
    ["Hạn phản hồi", data.responseDueDate || "-", defectAccent],
  ];
  summaries.forEach(([label, value, accent], index) => summaryCell(page, label, value, MARGIN + (summaryWidth * index), y, summaryWidth, fonts, accent));
  y -= 54;

  page.drawRectangle({ x: MARGIN, y: y - 46, width: CONTENT_WIDTH, height: 46, color: (data.defectQuantity ?? 0) > 0 ? PALE_RED : PALE_GREEN, borderColor: (data.defectQuantity ?? 0) > 0 ? rgb(0.95, 0.65, 0.65) : rgb(0.65, 0.87, 0.77), borderWidth: 0.7 });
  drawText(page, "NỘI DUNG LỖI / DEFECT DESCRIPTION", MARGIN + 12, y - 14, fonts, 6.5, 240, MUTED);
  drawText(page, data.defectContent || "Không ghi nhận lỗi.", MARGIN + 12, y - 32, fonts, 8.5, CONTENT_WIDTH - 24, (data.defectQuantity ?? 0) > 0 ? RED : GREEN);
  y -= 66;

  y = sectionTitle(page, "KẾT QUẢ ĐO", `${data.measurements.length} mẫu đo`, y, fonts);
  y = drawMeasurementHeader(page, y, fonts);
  let rowsOnCurrentPage = 0;

  for (let rowIndex = 0; rowIndex < data.measurements.length; rowIndex += 1) {
    const measurement = data.measurements[rowIndex];
    const pageRowLimit = page === pdf.getPages()[0] ? 8 : 18;
    if (y - 23 < 52 || rowsOnCurrentPage >= pageRowLimit) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = drawHeader(page, data, fonts, true);
      y = sectionTitle(page, "KẾT QUẢ ĐO (TIẾP THEO)", `${data.measurements.length} mẫu đo`, y, fonts);
      y = drawMeasurementHeader(page, y, fonts);
      rowsOnCurrentPage = 0;
    }
    const values = [String(measurement.no), ...measurement.values.map(String), measurement.visualResult ?? ""];
    y = drawMeasurementRow(page, values, y, rowIndex, fonts);
    rowsOnCurrentPage += 1;
  }

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => drawFooter(currentPage, index + 1, pages.length, fonts));
  return pdf.save();
}
