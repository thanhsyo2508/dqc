import { PDFDocument } from "pdf-lib";

export async function mergeProductPdf(qcPdf: Uint8Array, drawingPdf: Uint8Array): Promise<Uint8Array> {
  const result = await PDFDocument.load(qcPdf);
  const drawing = await PDFDocument.load(drawingPdf);
  const pages = await result.copyPages(drawing, drawing.getPageIndices());
  for (const page of pages) result.addPage(page);
  return result.save();
}
