import type { FileEntry } from "@zip.js/zip.js";
import type { Product } from "./product-qc.js";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_ZIP_BYTES = 512 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 2000;

export interface ZipPdfSource {
  name: string;
  size: number;
  loadBytes: () => Promise<Uint8Array>;
}

export interface ZipMatchIssue {
  kind: "missing" | "duplicate" | "unmatched" | "oversize" | "invalid";
  partNo?: string;
  fileName?: string;
  message: string;
}

export interface ZipMatchResult {
  byPartNo: Map<string, ZipPdfSource>;
  issues: ZipMatchIssue[];
  pdfCount: number;
  zipName: string;
}

export function normalizePartNo(value: string): string {
  return value.normalize("NFC").trim().replace(/\.pdf$/i, "").trim().toLocaleUpperCase("en-US");
}

function entryBasename(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "";
}

async function readPdfEntry(entry: FileEntry, displayName: string): Promise<Uint8Array> {
  if (entry.uncompressedSize !== undefined && entry.uncompressedSize > MAX_PDF_BYTES) {
    throw new Error(`PDF "${displayName}" vượt giới hạn 20 MiB.`);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const writer = new WritableStream<Uint8Array>({
    write(chunk) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_PDF_BYTES) throw new Error(`PDF "${displayName}" vượt giới hạn 20 MiB.`);
      chunks.push(chunk.slice());
    },
  });
  await entry.getData(writer, { useWebWorkers: false });
  if (totalBytes === 0) throw new Error(`PDF "${displayName}" không có dữ liệu.`);
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  chunks.length = 0;
  return result;
}

/** Read ZIP metadata only; PDF bytes are decompressed lazily one product at a time. */
export async function matchPdfZip(file: File, products: Product[]): Promise<ZipMatchResult> {
  if (!/\.zip$/i.test(file.name)) throw new Error("Hãy chọn file ZIP chứa bản vẽ PDF.");
  if (file.size <= 0 || file.size > MAX_ZIP_BYTES) throw new Error("File ZIP rỗng hoặc vượt giới hạn 512 MiB.");

  const { BlobReader, ZipReader } = await import("@zip.js/zip.js");
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false, strictness: "strict" });
  try {
    const entries = await reader.getEntries();
    if (entries.length > MAX_ZIP_ENTRIES) throw new Error(`ZIP có quá nhiều mục (tối đa ${MAX_ZIP_ENTRIES}).`);

    const productKeys = new Map<string, Product[]>();
    for (const product of products) {
      const key = normalizePartNo(product.partNo);
      if (!key) continue;
      productKeys.set(key, [...(productKeys.get(key) ?? []), product]);
    }

    const filesByKey = new Map<string, FileEntry[]>();
    const issues: ZipMatchIssue[] = [];
    let pdfCount = 0;
    let declaredTotalBytes = 0;
    for (const entry of entries) {
      if (entry.directory || entry.symlink) continue;
      if (entry.filename.replace(/\\/g, "/").split("/").some((segment) => segment === "__MACOSX")) continue;
      const name = entryBasename(entry.filename);
      if (name.startsWith("._")) continue;
      if (!/\.pdf$/i.test(name)) continue;
      pdfCount += 1;
      if (entry.encrypted) {
        issues.push({ kind: "invalid", fileName: name, message: `PDF ${name} đang được mã hóa; hãy giải mã rồi thêm lại vào ZIP.` });
        continue;
      }
      declaredTotalBytes += entry.uncompressedSize ?? 0;
      const key = normalizePartNo(name);
      filesByKey.set(key, [...(filesByKey.get(key) ?? []), entry]);
    }
    if (declaredTotalBytes > 10 * 1024 * 1024 * 1024) {
      throw new Error("Tổng dung lượng PDF trong ZIP vượt giới hạn an toàn 10 GiB.");
    }

    const byPartNo = new Map<string, ZipPdfSource>();
    for (const [key, matchingProducts] of productKeys) {
      if (matchingProducts.length > 1) {
        issues.push({ kind: "duplicate", partNo: matchingProducts[0].partNo, message: `Mã hàng ${matchingProducts[0].partNo} bị lặp trong danh sách.` });
        continue;
      }
      const matches = filesByKey.get(key) ?? [];
      if (matches.length === 0) {
        issues.push({ kind: "missing", partNo: matchingProducts[0].partNo, message: `Chưa có PDF ${matchingProducts[0].partNo}.pdf trong ZIP.` });
        continue;
      }
      if (matches.length > 1) {
        issues.push({ kind: "duplicate", partNo: matchingProducts[0].partNo, message: `Có ${matches.length} PDF trùng mã ${matchingProducts[0].partNo}.` });
        continue;
      }
      const entry = matches[0];
      const displayName = entryBasename(entry.filename);
      const size = entry.uncompressedSize ?? 0;
      if (size > MAX_PDF_BYTES) {
        issues.push({ kind: "oversize", partNo: matchingProducts[0].partNo, fileName: displayName, message: `${displayName} vượt giới hạn 20 MiB.` });
        continue;
      }
      byPartNo.set(key, {
        name: displayName,
        size,
        loadBytes: () => readPdfEntry(entry, displayName),
      });
      filesByKey.delete(key);
    }

    for (const unclaimed of filesByKey.values()) {
      for (const entry of unclaimed) {
        const name = entryBasename(entry.filename);
        if (productKeys.has(normalizePartNo(name))) continue;
        issues.push({ kind: "unmatched", fileName: name, message: `Không tìm thấy mã hàng tương ứng với ${name}.` });
      }
    }

    return { byPartNo, issues, pdfCount, zipName: file.name };
  } finally {
    await reader.close();
  }
}
