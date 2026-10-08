import { PDFDocument, type PDFPage } from "pdf-lib";

export interface DrawingPdfSource {
  name: string;
  loadBytes: () => Promise<Uint8Array>;
}

function isMemoryPressure(error: unknown): boolean {
  return error instanceof RangeError
    || (error instanceof Error && /out of memory|array buffer|allocation failed|heap limit/i.test(error.message));
}

function memoryGuidance(): string {
  return "Máy không đủ bộ nhớ để xử lý PDF này. Hãy giảm dung lượng bản vẽ hoặc chia thành ít file hơn rồi thử lại.";
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

/** Embed a source page upright and centered on a portrait A4 sheet without enlarging or distorting it. */
async function appendPageOnPortraitA4(document: PDFDocument, sourcePage: PDFPage): Promise<void> {
  const cropBox = sourcePage.getCropBox();
  const rotation = ((sourcePage.getRotation().angle % 360) + 360) % 360;
  const swapsAxes = rotation === 90 || rotation === 270;
  const displayedWidth = swapsAxes ? cropBox.height : cropBox.width;
  const displayedHeight = swapsAxes ? cropBox.width : cropBox.height;
  const scale = Math.min(1, A4_WIDTH / displayedWidth, A4_HEIGHT / displayedHeight);
  const offsetX = (A4_WIDTH - (displayedWidth * scale)) / 2;
  const offsetY = (A4_HEIGHT - (displayedHeight * scale)) / 2;
  const left = cropBox.x;
  const bottom = cropBox.y;
  const width = cropBox.width;
  const height = cropBox.height;

  let matrix: [number, number, number, number, number, number];
  switch (rotation) {
    case 90:
      matrix = [0, -scale, scale, 0, offsetX - (scale * bottom), offsetY + (scale * width) + (scale * left)];
      break;
    case 180:
      matrix = [-scale, 0, 0, -scale, offsetX + (scale * width) + (scale * left), offsetY + (scale * height) + (scale * bottom)];
      break;
    case 270:
      matrix = [0, scale, -scale, 0, offsetX + (scale * height) + (scale * bottom), offsetY - (scale * left)];
      break;
    default:
      matrix = [scale, 0, 0, scale, offsetX - (scale * left), offsetY - (scale * bottom)];
  }

  const embedded = await document.embedPage(sourcePage, {
    left,
    bottom,
    right: left + width,
    top: bottom + height,
  }, matrix);
  const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
  page.drawPage(embedded, { x: 0, y: 0, width, height });
}

/** Load and append all drawings, then serialize the combined document only once. */
export async function mergeProductPdfs(qcPdf: Uint8Array, drawings: DrawingPdfSource[]): Promise<Uint8Array> {
  let result: PDFDocument;
  try {
    result = await PDFDocument.load(qcPdf);
  } catch (error) {
    if (isMemoryPressure(error)) throw new Error(memoryGuidance());
    throw new Error("Không đọc lại được phiếu QC vừa tạo. Hãy thử tạo preview lại; nếu vẫn lỗi, khởi động lại ứng dụng.");
  }

  for (const source of drawings) {
    let drawing: PDFDocument;
    try {
      const bytes = await source.loadBytes();
      if (bytes.byteLength === 0) throw new Error("PDF rỗng");
      drawing = await PDFDocument.load(bytes);
    } catch (error) {
      if (isMemoryPressure(error)) throw new Error(memoryGuidance());
      const reason = error instanceof Error ? error.message : "không đọc được nội dung PDF";
      throw new Error(`Không đọc được bản vẽ “${source.name}” (${reason}). Hãy mở file này bằng trình đọc PDF, lưu lại thành PDF mới rồi thử lại.`);
    }

    try {
      for (const page of drawing.getPages()) await appendPageOnPortraitA4(result, page);
    } catch (error) {
      if (isMemoryPressure(error)) throw new Error(memoryGuidance());
      const reason = error instanceof Error ? error.message : "không thể sao chép các trang";
      throw new Error(`Không ghép được bản vẽ “${source.name}” (${reason}). File có thể dùng cấu trúc PDF không tương thích; hãy mở và xuất lại thành PDF mới.`);
    }
  }

  try {
    return await result.save({ useObjectStreams: true });
  } catch (error) {
    if (isMemoryPressure(error)) throw new Error(memoryGuidance());
    throw error;
  }
}

export async function mergeProductPdf(qcPdf: Uint8Array, drawingPdf: Uint8Array): Promise<Uint8Array> {
  return mergeProductPdfs(qcPdf, [{ name: "bản vẽ PDF", loadBytes: async () => drawingPdf }]);
}
