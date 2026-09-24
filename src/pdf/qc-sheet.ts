import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ProductQc } from "../domain/product-qc.js";

export interface QcSheetOptions {
  fontBytes?: Uint8Array;
  fontName?: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;

function text(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size = 9) {
  page.drawText(value, { x, y, size, font, color: rgb(0.08, 0.08, 0.08) });
}

function row(page: PDFPage, label: string, value: string, y: number, font: PDFFont) {
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
  text(page, label, MARGIN + 5, y - 7, font, 8);
  text(page, value, MARGIN + 196, y - 7, font, 8);
}

export async function createQcSheetPdf(data: ProductQc, options: QcSheetOptions = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let font: PDFFont;

  if (options.fontBytes) {
    pdf.registerFontkit(fontkit);
    font = await pdf.embedFont(options.fontBytes, { subset: true });
  } else {
    font = await pdf.embedFont(StandardFonts.Helvetica);
  }

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  text(page, data.recordId, MARGIN, PAGE_HEIGHT - 48, font, 13);
  text(page, data.inspectionDate, 420, PAGE_HEIGHT - 48, font, 10);
  text(page, "PRODUCT QC RECORD", MARGIN, PAGE_HEIGHT - 72, font, 11);

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

  text(page, "GENERAL INFORMATION", MARGIN, PAGE_HEIGHT - 102, font, 10);
  let y = PAGE_HEIGHT - 122;
  for (const [label, value] of fields) {
    row(page, label, value, y, font);
    y -= 20;
  }

  y -= 10;
  text(page, "MEASUREMENT RESULTS", MARGIN, y, font, 10);
  y -= 18;
  const columns = ["No", "1", "2", "3", "4", "5", "6", "7", "Visual"];
  const widths = [34, 52, 52, 52, 52, 52, 52, 52, 113];
  let x = MARGIN;
  for (let i = 0; i < columns.length; i += 1) {
    page.drawRectangle({ x, y: y - 18, width: widths[i], height: 18, borderWidth: 0.5, borderColor: rgb(0.35, 0.35, 0.35) });
    text(page, columns[i], x + 5, y - 12, font, 8);
    x += widths[i];
  }

  for (const measurement of data.measurements) {
    y -= 18;
    x = MARGIN;
    const values = [String(measurement.no), ...measurement.values.map(String), measurement.visualResult ?? ""];
    for (let i = 0; i < columns.length; i += 1) {
      page.drawRectangle({ x, y: y - 18, width: widths[i], height: 18, borderWidth: 0.5, borderColor: rgb(0.35, 0.35, 0.35) });
      text(page, values[i] ?? "", x + 5, y - 12, font, 8);
      x += widths[i];
    }
  }

  return pdf.save();
}
