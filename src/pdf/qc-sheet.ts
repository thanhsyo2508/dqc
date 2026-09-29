import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { evaluateMeasurementRow, type MeasurementAssessment, type MeasurementStandard, type ProductQc } from "../domain/product-qc.js";

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
  page.drawRectangle({ x: MARGIN, y: y - 18, width: 4, height: 18, color: BLUE });
  drawText(page, title, MARGIN + 12, y - 6, fonts, 10, 270, NAVY);
  drawRightText(page, subtitle, PAGE_WIDTH - MARGIN, y - 6, fonts, 7.2, MUTED);
  return y - 24;
}

function infoCell(page: PDFPage, label: string, value: string, x: number, y: number, width: number, fonts: PdfFonts): void {
  page.drawRectangle({ x, y: y - 30, width, height: 30, color: SURFACE, borderColor: LINE, borderWidth: 0.5 });
  drawText(page, label.toUpperCase(), x + 9, y - 10, fonts, 6, width - 18, MUTED);
  drawText(page, value || "-", x + 9, y - 23, fonts, 8.4, width - 18, INK);
}

function summaryCell(page: PDFPage, label: string, value: string, x: number, y: number, width: number, fonts: PdfFonts, accent: Color = BLUE): void {
  page.drawRectangle({ x, y: y - 36, width, height: 36, color: WHITE, borderColor: LINE, borderWidth: 0.6 });
  page.drawRectangle({ x, y: y - 36, width: 3, height: 36, color: accent });
  drawText(page, label.toUpperCase(), x + 10, y - 11, fonts, 6, width - 18, MUTED);
  drawText(page, value || "-", x + 10, y - 27, fonts, 8.4, width - 18, INK);
}

function drawHeader(page: PDFPage, data: ProductQc, fonts: PdfFonts, continued = false): number {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 86, width: PAGE_WIDTH, height: 86, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 86, width: 9, height: 86, color: BLUE });
  drawText(page, "DIGITAL QC", MARGIN, PAGE_HEIGHT - 24, fonts, 7.5, 180, rgb(0.55, 0.75, 1));
  drawText(page, continued ? "PHIẾU KIỂM TRA - TIẾP THEO" : "PHIẾU KIỂM TRA CHẤT LƯỢNG", MARGIN, PAGE_HEIGHT - 48, fonts, 16.5, 360, WHITE);
  drawText(page, continued ? "MEASUREMENT CONTINUATION" : "PRODUCT QUALITY CONTROL REPORT", MARGIN, PAGE_HEIGHT - 66, fonts, 7.5, 330, rgb(0.72, 0.78, 0.86));
  drawRightText(page, data.recordId, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 33, fonts, 9, WHITE);
  drawRightText(page, `Ngày kiểm tra: ${data.inspectionDate}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 51, fonts, 7, rgb(0.78, 0.84, 0.92));
  drawRightText(page, `Mã hàng: ${data.product.partNo}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 68, fonts, 7, rgb(0.78, 0.84, 0.92));
  return PAGE_HEIGHT - 104;
}

const MEASUREMENT_COLUMNS = ["STT", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "NGOẠI QUAN", "ĐÁNH GIÁ"];
const MEASUREMENT_WIDTHS = [30, 45, 45, 45, 45, 45, 45, 45, 100, 78];

function drawMeasurementHeader(page: PDFPage, y: number, fonts: PdfFonts): number {
  let x = MARGIN;
  for (let index = 0; index < MEASUREMENT_COLUMNS.length; index += 1) {
    const width = MEASUREMENT_WIDTHS[index];
    page.drawRectangle({ x, y: y - 21, width, height: 21, color: NAVY });
    const label = MEASUREMENT_COLUMNS[index];
    const labelWidth = textWidth(label, 6.7, fonts);
    drawText(page, label, x + Math.max(5, (width - labelWidth) / 2), y - 14, fonts, 6.7, width - 8, WHITE);
    x += width;
  }
  return y - 21;
}

function assessmentLabel(status: MeasurementAssessment["status"]): string {
  return status === "pass" ? "ĐẠT" : status === "fail" ? "KHÔNG ĐẠT" : "CHƯA ĐỦ";
}

function drawMeasurementStandardRow(page: PDFPage, standard: MeasurementStandard | undefined, y: number, fonts: PdfFonts): number {
  let x = MARGIN;
  const rowHeight = 27;
  for (let index = 0; index < MEASUREMENT_WIDTHS.length; index += 1) {
    const width = MEASUREMENT_WIDTHS[index];
    page.drawRectangle({ x, y: y - rowHeight, width, height: rowHeight, color: PALE_BLUE, borderColor: rgb(0.62, 0.75, 0.94), borderWidth: 0.55 });
    if (index === 0) {
      drawText(page, "CHUẨN", x + 3, y - 16, fonts, 5.8, width - 6, BLUE);
    } else if (index <= 7) {
      const criterion = standard?.values[index - 1];
      const target = String(criterion?.target ?? "").trim() || "-";
      const minus = String(criterion?.minusTolerance ?? "").trim();
      const plus = String(criterion?.plusTolerance ?? "").trim();
      const tolerance = minus || plus ? `-${minus || plus}/+${plus || minus}` : "Chưa đặt sai số";
      const targetWidth = textWidth(target, 7.1, fonts);
      drawText(page, target, x + Math.max(3, (width - targetWidth) / 2), y - 11, fonts, 7.1, width - 6, NAVY);
      const toleranceWidth = textWidth(tolerance, 4.8, fonts);
      drawText(page, tolerance, x + Math.max(2, (width - toleranceWidth) / 2), y - 21, fonts, 4.8, width - 4, MUTED);
    } else if (index === 8) {
      const visual = String(standard?.visualResult ?? "").trim().toUpperCase() || "KHÔNG ÁP DỤNG";
      const visualWidth = textWidth(visual, 6, fonts);
      drawText(page, visual, x + Math.max(4, (width - visualWidth) / 2), y - 16, fonts, 6, width - 8, BLUE);
    } else {
      drawText(page, "TỰ ĐỘNG", x + 7, y - 16, fonts, 5.8, width - 14, BLUE);
    }
    x += width;
  }
  return y - rowHeight;
}

function drawMeasurementRow(page: PDFPage, values: string[], assessment: MeasurementAssessment, y: number, rowIndex: number, fonts: PdfFonts): number {
  let x = MARGIN;
  const rowHeight = 18;
  const fill = rowIndex % 2 === 0 ? WHITE : SURFACE;
  for (let index = 0; index < MEASUREMENT_WIDTHS.length; index += 1) {
    const width = MEASUREMENT_WIDTHS[index];
    const checkStatus = index >= 1 && index <= 7
      ? assessment.cells[index - 1]
      : index === 8 ? assessment.visual
        : index === 9 ? assessment.status : "not-configured";
    const cellFill = checkStatus === "pass" ? PALE_GREEN : checkStatus === "fail" ? PALE_RED : fill;
    const textColor = checkStatus === "pass" ? GREEN : checkStatus === "fail" ? RED : INK;
    page.drawRectangle({ x, y: y - rowHeight, width, height: rowHeight, color: cellFill, borderColor: LINE, borderWidth: 0.45 });
    const value = values[index] ?? "";
    const valueWidth = textWidth(value, 7, fonts);
    drawText(page, value, x + Math.max(5, (width - valueWidth) / 2), y - 12, fonts, 7, width - 10, textColor);
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

  page.drawRectangle({ x: MARGIN, y: y - 60, width: CONTENT_WIDTH, height: 60, color: PALE_BLUE, borderColor: rgb(0.72, 0.82, 0.96), borderWidth: 0.8 });
  drawText(page, "MÃ HÀNG / PART NUMBER", MARGIN + 14, y - 15, fonts, 6.5, 220, MUTED);
  drawText(page, product.partNo, MARGIN + 14, y - 35, fonts, 14, 350, NAVY);
  drawText(page, product.productName ?? "-", MARGIN + 14, y - 51, fonts, 8, 350, MUTED);
  page.drawRectangle({ x: PAGE_WIDTH - MARGIN - 112, y: y - 49, width: 98, height: 38, color: WHITE, borderColor: rgb(0.65, 0.78, 0.95), borderWidth: 0.7 });
  drawText(page, "SỐ LƯỢNG", PAGE_WIDTH - MARGIN - 101, y - 24, fonts, 6, 78, MUTED);
  drawText(page, `${product.quantity} ${product.unit}`, PAGE_WIDTH - MARGIN - 101, y - 42, fonts, 11.5, 78, BLUE);
  y -= 72;

  y = sectionTitle(page, "THÔNG TIN SẢN PHẨM", "Product information", y, fonts);
  const gap = 8;
  const cellWidth = (CONTENT_WIDTH - (gap * 2)) / 3;
  const infoRows: Array<[[string, string], [string, string], [string, string]]> = [
    [["Mã dự án", product.project], ["PO", product.po], ["Nhà cung cấp", product.supplier ?? "-"]],
    [["Số lot", product.lotNo ?? "N/A"], ["Phiếu nhập kho", product.slipNo], ["Ngày nhập kho", product.receivedDate]],
  ];
  for (const row of infoRows) {
    row.forEach(([label, value], columnIndex) => {
      infoCell(page, label, value, MARGIN + ((cellWidth + gap) * columnIndex), y, cellWidth, fonts);
    });
    y -= 34;
  }

  y -= 2;
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
  y -= 44;

  page.drawRectangle({ x: MARGIN, y: y - 36, width: CONTENT_WIDTH, height: 36, color: (data.defectQuantity ?? 0) > 0 ? PALE_RED : PALE_GREEN, borderColor: (data.defectQuantity ?? 0) > 0 ? rgb(0.95, 0.65, 0.65) : rgb(0.65, 0.87, 0.77), borderWidth: 0.7 });
  drawText(page, "NỘI DUNG LỖI / DEFECT DESCRIPTION", MARGIN + 12, y - 11, fonts, 6, 240, MUTED);
  drawText(page, data.defectContent || "Không ghi nhận lỗi.", MARGIN + 12, y - 26, fonts, 8, CONTENT_WIDTH - 24, (data.defectQuantity ?? 0) > 0 ? RED : GREEN);
  y -= 48;

  const measurementAssessments = data.measurements.map((measurement) => evaluateMeasurementRow(measurement, data.measurementStandard));
  const passedMeasurements = measurementAssessments.filter((assessment) => assessment.status === "pass").length;
  const failedMeasurements = measurementAssessments.filter((assessment) => assessment.status === "fail").length;
  const pendingMeasurements = measurementAssessments.filter((assessment) => assessment.status === "pending").length;
  const measurementSummary = `${passedMeasurements} đạt · ${failedMeasurements} không đạt · ${pendingMeasurements} chưa đủ`;
  y = sectionTitle(page, "KẾT QUẢ ĐO", measurementSummary, y, fonts);
  y = drawMeasurementHeader(page, y, fonts);
  y = drawMeasurementStandardRow(page, data.measurementStandard, y, fonts);
  let rowsOnCurrentPage = 0;

  for (let rowIndex = 0; rowIndex < data.measurements.length; rowIndex += 1) {
    const measurement = data.measurements[rowIndex];
    const pageRowLimit = page === pdf.getPages()[0] ? 17 : 33;
    if (y - 18 < 52 || rowsOnCurrentPage >= pageRowLimit) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = drawHeader(page, data, fonts, true);
      y = sectionTitle(page, "KẾT QUẢ ĐO (TIẾP THEO)", measurementSummary, y, fonts);
      y = drawMeasurementHeader(page, y, fonts);
      y = drawMeasurementStandardRow(page, data.measurementStandard, y, fonts);
      rowsOnCurrentPage = 0;
    }
    const assessment = measurementAssessments[rowIndex];
    const values = [String(measurement.no), ...Array.from({ length: 7 }, (_, index) => String(measurement.values[index] ?? "")), measurement.visualResult ?? "", assessmentLabel(assessment.status)];
    y = drawMeasurementRow(page, values, assessment, y, rowIndex, fonts);
    rowsOnCurrentPage += 1;
  }

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => drawFooter(currentPage, index + 1, pages.length, fonts));
  return pdf.save();
}
