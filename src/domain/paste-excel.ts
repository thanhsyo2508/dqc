import type { Product } from "./product-qc.js";

const HEADER_MARKERS = ["mã dự án", "ma du an", "project code", "project"];

function normalizeCell(value: string): string {
  return value.trim().replace(/^"|"$/g, "");
}

function isHeaderRow(cells: string[]): boolean {
  const firstCells = cells.slice(0, 4).map((cell) => normalizeCell(cell).toLowerCase());
  return firstCells.some((cell) => HEADER_MARKERS.some((marker) => cell.includes(marker)));
}

function parseQuantity(value: string, rowNumber: number): number {
  const normalized = normalizeCell(value).replace(/\s/g, "").replace(",", ".");
  const quantity = Number(normalized);

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(`Dòng ${rowNumber}: số lượng không hợp lệ.`);
  }

  return quantity;
}

/**
 * Parse tab-separated rows copied from Excel.
 * Expected columns: project, PO, supplier, part number, product name,
 * quantity, unit, receiving slip number, receiving date.
 */
export function parseProductPaste(text: string): Product[] {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.split("\t").map(normalizeCell))
    .filter((cells) => cells.some(Boolean));

  if (rows.length === 0) {
    throw new Error("Chưa có dữ liệu Excel để nạp.");
  }

  const dataRows = isHeaderRow(rows[0]) ? rows.slice(1) : rows;

  if (dataRows.length === 0) {
    throw new Error("Chỉ thấy dòng tiêu đề, chưa có sản phẩm.");
  }

  return dataRows.map((cells, index) => {
    const rowNumber = index + (rows.length === dataRows.length ? 1 : 2);

    if (cells.length < 9) {
      throw new Error(`Dòng ${rowNumber}: cần đủ 9 cột dữ liệu từ Excel.`);
    }

    if (!cells[0] || !cells[1] || !cells[3] || !cells[7]) {
      throw new Error(`Dòng ${rowNumber}: thiếu mã dự án, PO, mã hàng hoặc số phiếu nhập.`);
    }

    return {
      project: cells[0],
      po: cells[1],
      supplier: cells[2],
      partNo: cells[3],
      productName: cells[4],
      quantity: parseQuantity(cells[5], rowNumber),
      unit: cells[6] || "PCS",
      slipNo: cells[7],
      receivedDate: cells[8],
      lotNo: "N/A",
    };
  });
}
