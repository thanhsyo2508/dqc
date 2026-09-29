import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createInternalDocument, createQrPayload, markDocumentUploaded, markQrPrinted, restoreInternalDocuments, serializeInternalDocuments } from "../src/domain/document-store.js";
import { parseProductPaste } from "../src/domain/paste-excel.js";
import { createUniqueQcRecordId, productKey, type ProductQc } from "../src/domain/product-qc.js";
import { createQcSheetPdf } from "../src/pdf/qc-sheet.js";
import { mergeProductPdf } from "../src/pdf/merge.js";
import { pingServer, uploadProductPdf } from "../src/api/upload-client.js";
import { createQrDataUrl, getLabelTemplate, printSheetHtml } from "../src/print/label-print.js";

const sampleQc: ProductQc = {
  recordId: "QC-TEST-0001",
  inspectionDate: "2026-09-24",
  inspector: "Test Inspector",
  inspectionLevel: "H:100% check",
  defectQuantity: 0,
  measurements: [{ no: 1, values: [369.5, 502.5, 20.2], visualResult: "OK" }],
  product: {
    project: "AUTM260580-0",
    po: "MKAC-FBT-260817",
    partNo: "2410011-FR1-014",
    lotNo: "N/A",
    supplier: "FBT",
    quantity: 1,
    unit: "PCS",
    slipNo: "NK-FBT-260909-10",
    receivedDate: "2026-09-09",
    productName: "Bracket",
  },
};

async function drawingPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Drawing page 1");
  pdf.addPage().drawText("Drawing page 2");
  return pdf.save();
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

describe("product QC PDF pipeline", () => {
  it("creates a valid QC PDF for one product", async () => {
    const bytes = await createQcSheetPdf(sampleQc);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("merges the QC page before all drawing pages", async () => {
    const qcPdf = await createQcSheetPdf(sampleQc);
    const merged = await mergeProductPdf(qcPdf, await drawingPdf());
    const pdf = await PDFDocument.load(merged);
    expect(pdf.getPageCount()).toBe(3);
  });

  it("embeds Vietnamese text and paginates many measurement rows", async () => {
    const fontBytes = new Uint8Array(await readFile("node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"));
    const fallbackFontBytes = new Uint8Array(await readFile("node_modules/@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff"));
    const pdfBytes = await createQcSheetPdf({
      ...sampleQc,
      defectContent: "Không có lỗi ngoại quan; nội dung dài để kiểm tra khả năng cắt gọn trong ô PDF.",
      measurements: Array.from({ length: 32 }, (_, index) => ({
        no: index + 1,
        values: ["369.5", "502.5", "20.2", "OK", "OK", "OK", "OK"],
        visualResult: index % 2 === 0 ? "OK" : "NG",
      })),
    }, { fontBytes, fallbackFontBytes });

    const reopened = await PDFDocument.load(pdfBytes);
    expect(reopened.getPageCount()).toBeGreaterThan(1);
    expect(pdfBytes.byteLength).toBeGreaterThan(5_000);
    if (process.env.PDF_QA_OUTPUT) {
      await mkdir("tmp/pdfs", { recursive: true });
      await writeFile("tmp/pdfs/qc-many-measurements.pdf", pdfBytes);
    }
  });

  it("parses multiple products pasted from Excel", () => {
    const products = parseProductPaste([
      "Mã dự án\tPO\tMã NCC\tMã hàng\tTên hàng\tSố lượng\tĐơn vị tính\tSố phiếu NK\tNgày NK",
      "PROJECT-A\tPO-001\tSUP-01\tPART-001\tBracket A\t12\tPCS\tNK-001\t2026-09-24",
      "PROJECT-B\tPO-002\tSUP-02\tPART-002\tBracket B\t3,5\tPCS\tNK-002\t2026-09-25",
    ].join("\n"));

    expect(products).toHaveLength(2);
    expect(products[0].partNo).toBe("PART-001");
    expect(products[1].quantity).toBe(3.5);
    expect(products[1].supplier).toBe("SUP-02");
  });

  it("appends multiple drawing PDFs after the QC page", async () => {
    const qcPdf = await createQcSheetPdf(sampleQc);
    const firstDrawing = await drawingPdf();
    const secondDrawing = await drawingPdf();
    const merged = await mergeProductPdf(await mergeProductPdf(qcPdf, firstDrawing), secondDrawing);
    const pdf = await PDFDocument.load(merged);

    expect(pdf.getPageCount()).toBe(5);
  });

  it("keeps internal documents independent per product card", () => {
    const first = createInternalDocument(sampleQc.product, 1);
    const second = createInternalDocument({ ...sampleQc.product, partNo: "PART-002" }, 2);
    first.qc.inspector = "Inspector A";
    first.drawingNames = ["drawing-a.pdf"];
    second.qc.inspector = "Inspector B";
    second.drawingNames = ["drawing-b.pdf"];

    const restored = restoreInternalDocuments(serializeInternalDocuments([first, second]));
    expect(restored).toHaveLength(2);
    expect(restored[0].documentId).toBe("DOC-001");
    expect(restored[0].qc.inspector).toBe("Inspector A");
    expect(restored[0].drawingNames).toEqual(["drawing-a.pdf"]);
    expect(restored[1].product.partNo).toBe("PART-002");
    expect(restored[1].qc.inspector).toBe("Inspector B");
  });

  it("generates unique QC record ids with millisecond timestamp and numeric suffix", () => {
    const first = createUniqueQcRecordId();
    const second = createUniqueQcRecordId();
    expect(first).toMatch(/^QC-\d{13}-\d{6}$/);
    expect(second).toMatch(/^QC-\d{13}-\d{6}$/);
    expect(first).not.toBe(second);
  });

  it("persists successful upload metadata in the product document library", () => {
    const document = createInternalDocument(sampleQc.product, 1);
    markDocumentUploaded(document, {
      qcNo: "QC-260924-0001",
      fileName: "QC-260924-0001.pdf",
      fileId: "FILE_ID",
      openUrl: "https://drive.google.com/file/d/FILE_ID/view",
      sentAt: "2026-09-24T10:00:00.000Z",
    });

    const [restored] = restoreInternalDocuments(serializeInternalDocuments([document]));
    expect(restored.status).toBe("sent");
    expect(restored.uploaded?.qcNo).toBe("QC-260924-0001");
    expect(restored.uploaded?.fileId).toBe("FILE_ID");
    expect(restored.uploaded?.openUrl).toContain("FILE_ID");
  });

  it("persists the QR payload and print history with the product document", () => {
    const document = createInternalDocument(sampleQc.product, 1);
    markDocumentUploaded(document, { openUrl: "https://drive.google.com/file/d/FILE_ID/view", sentAt: "2026-09-24T10:00:00.000Z" });
    const qrPayload = JSON.parse(document.uploaded?.qr?.payload ?? "{}") as Record<string, unknown>;
    expect(qrPayload.type).toBe("digital-qc");
    expect(qrPayload.version).toBe(1);
    expect(qrPayload.project).toBe(sampleQc.product.project);
    expect(qrPayload.supplier).toBe(sampleQc.product.supplier);
    expect(qrPayload.quantity).toBe(sampleQc.product.quantity);
    expect(qrPayload.unit).toBe(sampleQc.product.unit);
    expect(qrPayload.part_no).toBe(sampleQc.product.partNo);
    expect(qrPayload.product_name).toBe(sampleQc.product.productName);
    expect(qrPayload.slip_no).toBe(sampleQc.product.slipNo);
    expect(qrPayload.received_date).toBe(sampleQc.product.receivedDate);
    expect(qrPayload.po).toBe(sampleQc.product.po);
    expect(qrPayload.pdf_url).toBe("https://drive.google.com/file/d/FILE_ID/view");
    expect(document.uploaded?.qr?.printCount).toBe(0);

    markQrPrinted(document, "a4-3x8", "windows-system");
    const [restored] = restoreInternalDocuments(serializeInternalDocuments([document]));
    expect(restored.uploaded?.qr?.printCount).toBe(1);
    expect(restored.uploaded?.qr?.templateId).toBe("a4-3x8");
    expect(restored.uploaded?.qr?.printerProfileId).toBe("windows-system");
  });

  it("builds a compact JSON QR payload with product metadata and PDF URL", () => {
    const document = createInternalDocument(sampleQc.product, 1);
    const payload = JSON.parse(createQrPayload(document, "https://example.test/file.pdf"));
    expect(payload).toMatchObject({
      type: "digital-qc",
      version: 1,
      part_no: sampleQc.product.partNo,
      pdf_url: "https://example.test/file.pdf",
    });
  });

  it("builds a multi-copy print sheet for a selected label template", () => {
    const document = createInternalDocument(sampleQc.product, 1);
    markDocumentUploaded(document, { openUrl: "https://example.test/qc/1" });
    const html = printSheetHtml(document, getLabelTemplate("roll-100x50"), 2, "data:image/png;base64,QR");
    expect((html.match(/class=\"label\"/g) ?? [])).toHaveLength(2);
    expect(html).toContain("100mm 50mm");
    expect(html).toContain("2410011-FR1-014");
  });

  it("generates a QR image from the stored URL payload", async () => {
    const dataUrl = await createQrDataUrl("https://example.test/qc/1");
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("pings the configured Apps Script endpoint", async () => {
    let request: any;
    let contentType: string | undefined;
    const result = await pingServer("https://example.test/exec", async (_input, init) => {
      request = JSON.parse(String(init?.body));
      contentType = new Headers(init?.headers).get("content-type") ?? undefined;
      return new Response(JSON.stringify({ success: true, api_version: 1, user: "qc@example.com", allowed: true }), { headers: { "content-type": "application/json" } });
    });
    expect(request.action).toBe("ping");
    expect(request.api_version).toBe(1);
    expect(contentType).toBe("text/plain;charset=UTF-8");
    expect(result.user).toBe("qc@example.com");
  });

  it("explains an HTML/404 response instead of exposing a JSON parse error", async () => {
    await expect(pingServer("https://example.test/not-an-exec", async () => new Response("<html>Not found</html>", { status: 404 })))
      .rejects.toThrow("response không phải JSON");
  });

  it("sends exactly the previewed PDF bytes and product metadata", async () => {
    let received: any;
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      received = await readJson(req);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        success: true,
        api_version: 1,
        qc_no: "QC-260924-0001",
        product_key: received.data.product_key,
        file_id: "FILE_ID",
        open_url: "https://drive.google.com/file/d/FILE_ID/view",
      }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");

    try {
      const pdfBytes = await mergeProductPdf(await createQcSheetPdf(sampleQc), await drawingPdf());
      const result = await uploadProductPdf(pdfBytes, sampleQc, {
        endpoint: `http://127.0.0.1:${address.port}/exec`,
        requestId: "request-test-0001",
        productKey: productKey(sampleQc.product),
      });

      expect(result.success).toBe(true);
      expect(received.action).toBe("upload_qc_pdf");
      expect(received.data.request_id).toBe("request-test-0001");
      expect(received.data.part_no).toBe(sampleQc.product.partNo);
      expect(received.data.page_count).toBe(3);
      expect(Buffer.from(received.data.pdf_base64, "base64").equals(Buffer.from(pdfBytes))).toBe(true);
      expect(received.data.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("includes document correlation in the upload success event", async () => {
    let detail: any;
    const originalWindow = (globalThis as any).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { dispatchEvent: (event: CustomEvent) => { detail = event.detail; } },
    });
    try {
      const pdfBytes = await createQcSheetPdf(sampleQc);
      await uploadProductPdf(pdfBytes, sampleQc, {
        endpoint: "https://example.test/exec",
        requestId: "request-correlated-0001",
        documentId: "DOC-2410011-FR1-014",
        productKey: productKey(sampleQc.product),
        fetchImpl: async () => new Response(JSON.stringify({ success: true, api_version: 1, qc_no: "QC-0001" }), { headers: { "content-type": "application/json" } }),
      });
      expect(detail.documentId).toBe("DOC-2410011-FR1-014");
      expect(detail.requestId).toBe("request-correlated-0001");
      expect(detail.productKey).toBe(productKey(sampleQc.product));
    } finally {
      if (originalWindow === undefined) delete (globalThis as any).window;
      else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    }
  });
});
