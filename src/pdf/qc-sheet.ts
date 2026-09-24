import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ProductQc } from "../domain/product-qc.js";

export interface QcSheetOptions {
  fontBytes?: Uint8Array;
  fallbackFontBytes?: Uint8Array;
  fontName?: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;

interface PdfFonts {
  primary: PDFFont;
  fallback?: PDFFont;
}

function usesFallback(character: string): boolean {
  return /[\u00c0-\u024f\u1e00-\u1eff]/u.test(character);
}

function fontRuns(value: string, fonts: PdfFonts): Array<{ value: string; font: PDFFont }> {
  const runs: Array<{ value: string; font: PDFFont }> = [];
  for (const character of value) {
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
  return `${result}…`;
}

function text(page: PDFPage, value: string, x: number, y: number, fonts: PdfFonts, size = 9, maxWidth = PAGE_WIDTH - (MARGIN * 2)) {
  let cursor = x;
  for (const run of fontRuns(fitText(value, fonts, size, maxWidth), fonts)) {
    page.drawText(run.value, { x: cursor, y, size, font: run.font, color: rgb(0.08, 0.08, 0.08) });
    cursor += run.font.widthOfTextAtSize(run.value, size);
  }
}

function row(page: PDFPage, label: string, value: string, y: number, fonts: PdfFonts) {
  page.drawRectangle({
    x: MARGIN,
    y: y - 13,
    width: 511,
    height: 18,
    borderWidth: 0.5,
    borderColor: rgb(0.35, 0.35, 0.35),
  });
  page.drawLine({
    start: { x: MARGIN + 190, y: y - 13 },
    end: { x: MARGIN + 190, y: y + 5 },
    thickness: 0.5,
    color: rgb(0.35, 0.35, 0.35),
  });
  text(page, label, MARGIN + 5, y - 7, fonts, 8);
  text(page, value, MARGIN + 196, y - 7, fonts, 8, 315);
}

function drawMeasurementHeader(page: PDFPage, y: number, fonts: PdfFonts): number {
  const columns = ["No", "1", "2", "3", "4", "5", "6", "7", "Visual"];
  const widths = [34, 52, 52, 52, 52, 52, 52, 52, 113];
  let x = MARGIN;
  for (let i = 0; i < columns.length; i += 1) {
    page.drawRectangle({ x, y: y - 18, width: widths[i], height: 18, borderWidth: 0.5, borderColor: rgb(0.35, 0.35, 0.35) });
    text(page, columns[i], x + 5, y - 12, fonts, 8, widths[i] - 10);
    x += widths[i];
  }
  return y - 18;
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

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  text(page, data.recordId, MARGIN, PAGE_HEIGHT - 48, fonts, 13);
  text(page, data.inspectionDate, 420, PAGE_HEIGHT - 48, fonts, 10);
  text(page, "PRODUCT QC RECORD", MARGIN, PAGE_HEIGHT - 72, fonts, 11);

  const p = data.product;
  const fields: Array<[string, string]> = [
    ["Project", p.project],
    ["PO", p.po],
    ["Part No", p.partNo],
    ["Product name", p.productName ?? ""],
    ["Lot No", p.lotNo ?? "N/A"],
    ["Quantity / Unit", `${p.quantity} ${p.unit}`],
    ["Supplier", p.supplier ?? ""],
    ["Receiving slip", p.slipNo],
    ["Received date", p.receivedDate],
    ["Inspection level", data.inspectionLevel ?? ""],
    ["Inspector", data.inspector],
    ["Defect quantity", String(data.defectQuantity ?? 0)],
    ["Defect content", data.defectContent ?? ""],
    ["Response due", data.responseDueDate ?? ""],
  ];

  text(page, "GENERAL INFORMATION", MARGIN, PAGE_HEIGHT - 102, fonts, 10);
  let y = PAGE_HEIGHT - 122;
  for (const [label, value] of fields) {
    row(page, label, value, y, fonts);
    y -= 20;
  }

  y -= 10;
  text(page, "MEASUREMENT RESULTS", MARGIN, y, fonts, 10);
  y -= 18;
  const widths = [34, 52, 52, 52, 52, 52, 52, 52, 113];
  y = drawMeasurementHeader(page, y, fonts);

  for (const measurement of data.measurements) {
    if (y - 18 < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 54;
      text(page, "MEASUREMENT RESULTS (continued)", MARGIN, y, fonts, 10);
      y = drawMeasurementHeader(page, y - 18, fonts);
    }
    y -= 18;
    let x = MARGIN;
    const values = [String(measurement.no), ...measurement.values.map(String), measurement.visualResult ?? ""];
    for (let i = 0; i < widths.length; i += 1) {
      page.drawRectangle({ x, y: y - 18, width: widths[i], height: 18, borderWidth: 0.5, borderColor: rgb(0.35, 0.35, 0.35) });
      text(page, values[i] ?? "", x + 5, y - 12, fonts, 8, widths[i] - 10);
      x += widths[i];
    }
  }

  return pdf.save();
}
