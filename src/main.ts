import { PDFDocument } from "pdf-lib";
import "./styles.css";
import { createInternalDocument, documentStatusLabel, markDocumentUploaded, markQrPrinted, restoreInternalDocuments, serializeInternalDocuments, type InternalDocument, type UploadSuccessRecord } from "./domain/document-store.js";
import { parseProductPaste } from "./domain/paste-excel.js";
import { productKey, type Product, type ProductQc } from "./domain/product-qc.js";
import { mergeProductPdf } from "./pdf/merge.js";
import { createQcSheetPdf } from "./pdf/qc-sheet.js";
import { loadVietnameseFont } from "./pdf/vietnamese-font.js";
import { pingServer, uploadProductPdf } from "./api/upload-client.js";
import { listQueuedPdfs, retryQueuedPdfs } from "./api/tauri-bridge.js";
import { createQrDataUrl, getLabelTemplate, getPrinterProfile, labelMarkup, LABEL_TEMPLATES, PRINTER_PROFILES, printSheetHtml } from "./print/label-print.js";

let previewUrl: string | undefined;
let previewBytes: Uint8Array | undefined;
let drawingFiles: File[] = [];
let selectedProductIndex = 0;
const drawingFilesByDocument = new Map<string, File[]>();
const previewBytesByDocument = new Map<string, Uint8Array>();
const previewPageCountByDocument = new Map<string, number>();
const UPLOADED_DOCUMENT_STORAGE_KEY = "digital-qc.uploaded-documents.v1";
const RECENT_INSPECTORS_STORAGE_KEY = "digital-qc.recent-inspectors.v1";
const API_ENDPOINT_STORAGE_KEY = "digital-qc.api-endpoint.v1";
const LABEL_TEMPLATE_STORAGE_KEY = "digital-qc.label-template.v1";
const PRINTER_PROFILE_STORAGE_KEY = "digital-qc.printer-profile.v1";
let isGeneratingPreview = false;
let isUploading = false;
let printingDocumentId: string | undefined;

const sampleProduct: Product = {
  project: "AUTM260580-0",
  po: "MKAC-FBT-260817",
  partNo: "2410011-FR1-014",
  productName: "Bracket",
  lotNo: "N/A",
  supplier: "FBT",
  quantity: 1,
  unit: "PCS",
  slipNo: "NK-FBT-260909-10",
  receivedDate: "2026-09-09",
};

const restoredUploadedDocuments = restoreInternalDocuments(localStorage.getItem(UPLOADED_DOCUMENT_STORAGE_KEY)).filter((document) => Boolean(document.uploaded));
let uploadedDocuments: InternalDocument[] = restoredUploadedDocuments;
let documents: InternalDocument[] = uploadedDocuments.length > 0 ? [...uploadedDocuments] : [createInternalDocument(sampleProduct, 1)];
const products: Product[] = [];
let recentInspectors: string[] = restoreRecentInspectors();

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <span class="brand-mark">${icon("check")}</span>
        <div><strong>Digital QC</strong><span>Quality workspace</span></div>
      </div>
      <div class="topbar-actions">
        <button id="serverStatus" class="connection-pill" type="button" aria-haspopup="dialog" aria-label="Cấu hình server upload"><i></i><span id="serverStatusText">Chưa cấu hình server</span></button>
        <button class="icon-button" type="button" aria-label="Mở hướng dẫn">${icon("help")}</button>
      </div>
    </header>

    <div class="app-layout">
      <aside class="sidebar" aria-label="Tiến trình hồ sơ">
        <div class="sidebar-intro">
          <span class="eyebrow">QC WORKSPACE</span>
          <h2>Tạo hồ sơ mới</h2>
          <p>Hoàn thành từng bước để tạo một hồ sơ QC cho sản phẩm.</p>
        </div>
        <ol class="stepper">
          <li id="stepProduct" class="active"><span>01</span><div><strong>Sản phẩm</strong><small>Thông tin nhận diện</small></div></li>
          <li id="stepInspection"><span>02</span><div><strong>Kiểm tra</strong><small>Kết quả và đánh giá</small></div></li>
          <li id="stepPdf"><span>03</span><div><strong>Hồ sơ PDF</strong><small>Bản vẽ và preview</small></div></li>
        </ol>
        <div class="sidebar-note">
          <span class="note-icon">${icon("shield")}</span>
          <div><strong>Nguyên tắc an toàn</strong><p>Chỉ tạo QR sau khi PDF đã upload thành công.</p></div>
        </div>
      </aside>

      <main class="workspace-main">
        <div class="page-heading">
          <div><span class="eyebrow">PRODUCT-CENTRIC FLOW</span><h1>Tạo hồ sơ QC</h1><p>Mỗi sản phẩm có một PDF, một lần upload và một QR/link.</p></div>
          <span id="workflowStatus" class="draft-badge"><i></i><span>Bản nháp mới</span></span>
        </div>

        <div class="content-grid">
          <div class="form-column">
            <section class="panel product-panel">
              <div class="panel-heading"><div class="panel-icon blue">${icon("box")}</div><div><h2>Thông tin sản phẩm</h2><p>Dán nhanh nhiều dòng từ Excel hoặc chọn từng sản phẩm để chỉnh sửa</p></div><span class="required-note">* Bắt buộc</span></div>
              <div class="product-import">
                <div class="import-heading"><div><strong>Dán dữ liệu từ Excel</strong><small>9 cột: Mã dự án · PO · NCC · Mã hàng · Tên hàng · Số lượng · ĐVT · Phiếu nhập · Ngày nhập</small></div><span id="productCount" class="product-count">1 sản phẩm</span></div>
                <div class="import-controls"><textarea id="excelPaste" rows="2" placeholder="Copy các dòng trong Excel rồi dán vào đây (có thể gồm dòng tiêu đề)"></textarea><button id="importExcel" class="secondary" type="button">${icon("paste")} Nạp danh sách</button></div>
                <div id="productList" class="product-list" aria-label="Danh sách sản phẩm"></div>
              </div>
              <div class="form-grid">
                ${input("project", "Mã dự án *", "AUTM260580-0")}
                ${input("po", "PO *", "MKAC-FBT-260817")}
                ${input("partNo", "Mã hàng *", "2410011-FR1-014")}
                ${input("productName", "Tên hàng", "Bracket")}
                ${input("lotNo", "Số lot", "N/A")}
                ${input("supplier", "Nhà cung cấp", "FBT")}
                ${input("quantity", "Số lượng *", "1", "number")}
                ${input("unit", "Đơn vị tính", "PCS")}
                ${input("slipNo", "Số phiếu nhập kho *", "NK-FBT-260909-10")}
                ${input("receivedDate", "Ngày nhập kho", "2026-09-09", "date")}
              </div>
            </section>

            <section class="panel">
              <div class="panel-heading"><div class="panel-icon green">${icon("clipboard")}</div><div><h2>Thông tin kiểm tra</h2><p>Kết quả kiểm tra và thông tin người thực hiện</p></div></div>
              <div class="form-grid">
                ${input("recordId", "Mã hồ sơ QC *", "QC-TEST-0001")}
                ${input("inspectionDate", "Ngày kiểm tra", today(), "date")}
                ${input("inspector", "Người kiểm tra *", "")}
                ${input("inspectionLevel", "Cấp độ kiểm tra", "H:100% check")}
                ${input("defectQuantity", "Số lượng hàng lỗi", "0", "number")}
                ${input("responseDueDate", "Thời hạn phản hồi", "", "date")}
              </div>
              <label class="field full-field">Nội dung lỗi<textarea id="defectContent" rows="2" placeholder="Không có lỗi hoặc mô tả lỗi"></textarea></label>
              <div class="measurements"><div class="subsection-heading"><div><h3>Kết quả đo</h3><span>Thêm một dòng cho mỗi mẫu đo</span></div><button id="addMeasurementRow" class="tertiary" type="button">${icon("plus")} Thêm dòng đo</button></div>
                <div class="measurement-scroll"><div class="measurement-table-head"><span>Mẫu</span><span>V1</span><span>V2</span><span>V3</span><span>V4</span><span>V5</span><span>V6</span><span>V7</span><span>Ngoại quan</span><span></span></div>
                <div id="measurementRows">${measurementRow(1)}</div></div>
              </div>
            </section>

            <section class="panel source-panel">
              <div class="panel-heading"><div class="panel-icon violet">${icon("file")}</div><div><h2>Bản vẽ tham chiếu</h2><p>Kéo thả nhiều PDF; chúng sẽ được ghép sau phiếu QC</p></div><span class="required-note">PDF</span></div>
              <label id="drawingDropzone" class="dropzone" for="drawingPdf"><span class="dropzone-icon">${icon("upload")}</span><span><strong>Kéo thả hoặc chọn nhiều bản vẽ</strong><small>Chỉ nhận PDF · có thể chọn nhiều file cùng lúc</small></span><span class="browse-label">Duyệt file</span><input id="drawingPdf" type="file" accept="application/pdf,.pdf" multiple /></label>
              <div id="drawingList" class="drawing-list"><div class="drawing-empty">Chưa có bản vẽ nào được chọn.</div></div>
            </section>
          </div>

          <aside class="preview-column">
            <section class="preview-panel">
              <div class="preview-heading"><div><span class="eyebrow">LIVE DOCUMENT</span><h2>Preview hồ sơ</h2></div><span class="pdf-badge">PDF</span></div>
              <p id="statusMessage" class="message" role="status" aria-live="polite">Chọn bản vẽ để bắt đầu tạo preview.</p>
              <div id="previewBox" class="preview-box empty"><div class="empty-preview"><span>${icon("eye")}</span><strong>Chưa có bản preview</strong><small>Phiếu QC và bản vẽ sẽ hiển thị tại đây.</small></div></div>
              <div class="preview-footer"><button id="createPreview" class="primary">${icon("sparkle")} Tạo preview PDF</button><button id="uploadPdf" class="secondary" disabled>${icon("upload")} Gửi hồ sơ</button><button id="downloadPdf" class="secondary" disabled>${icon("download")} Tải PDF</button></div>
            </section>
            <div class="preview-tip"><span>${icon("info")}</span><p>Preview và file upload sẽ dùng cùng một bộ bytes PDF để đảm bảo tính toàn vẹn.</p></div>
          </aside>
        </div>
      </main>
    </div>
  </div>
`;

document.querySelector(".app-shell")?.insertAdjacentHTML("beforeend", `<dialog id="serverConfigDialog" class="server-config"><form id="serverConfigForm" method="dialog"><div class="dialog-heading"><span class="eyebrow">UPLOAD CONNECTION</span><h2>Cấu hình server upload</h2><p>Dán URL Web App <code>/exec</code> để gửi hồ sơ PDF lên kho tài liệu.</p></div><label class="field">URL server *<input id="serverEndpoint" type="url" required placeholder="https://script.google.com/macros/s/.../exec" aria-describedby="serverEndpointError" /><small id="serverEndpointError" class="field-error"></small></label><p id="serverPingMessage" class="dialog-message" role="status" aria-live="polite"></p><div class="dialog-actions"><button id="cancelServerConfig" class="secondary" type="button">Hủy</button><button id="pingServer" class="secondary" type="button">Kiểm tra kết nối</button><button class="primary" type="submit">Lưu cấu hình</button></div></form></dialog>`);
document.querySelector(".app-shell")?.insertAdjacentHTML("beforeend", `<dialog id="labelPrintDialog" class="label-print-dialog"><form id="labelPrintForm" method="dialog"><div class="dialog-heading"><span class="eyebrow">QR LABEL STUDIO</span><h2>In tem QR</h2><p id="labelPrintDocument">Chọn mẫu tem và profile máy in cho mã hàng.</p></div><div class="label-options"><label class="field">Dòng máy in<select id="printerProfile">${PRINTER_PROFILES.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join("")}</select><small id="printerProfileHint" class="field-hint"></small></label><label class="field">Form tem<select id="labelTemplate">${LABEL_TEMPLATES.map((template) => `<option value="${template.id}">${template.name}</option>`).join("")}</select><small id="labelTemplateHint" class="field-hint"></small></label><label class="field">Số bản in<input id="labelCopies" type="number" min="1" max="100" value="1" /></label></div><div id="labelPreview" class="label-preview" aria-live="polite"></div><div class="dialog-actions"><button id="cancelLabelPrint" class="secondary" type="button">Hủy</button><button id="confirmLabelPrint" class="primary" type="submit">${icon("print")} Mở hộp thoại in</button></div></form></dialog>`);

document.querySelector(".preview-heading")?.insertAdjacentHTML("afterend", `<div id="documentRecord" class="document-record"><div><span class="eyebrow">MÃ HÀNG</span><strong id="documentPartNo">2410011-FR1-014</strong><small id="documentUpdated">Chưa lưu thay đổi</small></div><span id="documentStatus" class="document-status draft">Nháp</span></div>`);
document.querySelector<HTMLInputElement>("#inspector")?.setAttribute("list", "recentInspectors");
document.querySelector<HTMLInputElement>("#inspector")?.setAttribute("autocomplete", "name");
document.querySelector<HTMLInputElement>("#inspector")?.insertAdjacentHTML("afterend", `<datalist id="recentInspectors"></datalist>`);
document.querySelector(".preview-tip")?.insertAdjacentHTML("afterend", `<details id="documentLibrary" class="library-panel"><summary class="library-summary"><span class="library-heading"><span class="library-heading-copy"><span class="eyebrow">DOCUMENT LIBRARY</span><strong>Tài liệu đã upload</strong></span><span id="uploadedCount" class="product-count">0 hồ sơ</span></span><span class="library-toggle" aria-hidden="true">${icon("chevron")}</span></summary><div class="library-content"><p class="library-description">Mở thư viện khi cần xem lại các file upload thành công theo từng mã hàng.</p><div class="library-filters"><label class="library-search-label" for="librarySearch">Mã hàng, PO, mã QC hoặc document ID<input id="librarySearch" type="search" placeholder="Ví dụ: 2410011 hoặc QC-260924" autocomplete="off" /></label><label class="library-date-label" for="libraryFrom">Từ ngày<input id="libraryFrom" type="date" /></label><label class="library-date-label" for="libraryTo">Đến ngày<input id="libraryTo" type="date" /></label></div><div id="uploadedLibrary" class="uploaded-library"></div></div></details>`);

function icon(name: string): string {
  const paths: Record<string, string> = {
    check: '<path d="m5 12 4 4L19 6"/><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1.1 1.1-1.8 1.3-1.8 2.8"/><path d="M12 17h.01"/>',
    box: '<path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8 9h8M8 13h8M8 17h5"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    upload: '<path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 14v5h14v-5"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
    download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
    print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/><path d="M18 12h.01"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.8-4L3 10"/><path d="M3 5v5h5M4 13a8 8 0 0 0 14.8 4L21 14"/><path d="M21 19v-5h-5"/>',
    sparkle: '<path d="m12 3 1.1 4.4L17 9l-3.9 1.6L12 15l-1.1-4.4L7 9l3.9-1.6L12 3ZM19 14l.6 2.4L22 17l-2.4.6L19 20l-.6-2.4L16 17l2.4-.6L19 14Z"/>',
    shield: '<path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8 9h8M8 13h5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.info}</svg>`;
}

function input(id: string, label: string, initialValue: string, type = "text"): string {
  const required = label.includes("*");
  return `<label class="field">${label}<input id="${id}" type="${type}" value="${initialValue}"${required ? " required aria-required=\"true\"" : ""} aria-describedby="${id}Error" /><small id="${id}Error" class="field-error"></small></label>`;
}

function measurementRow(no: number): string {
  return `<div class="measurement-row" data-row="${no}"><span class="row-label">Mẫu ${String(no).padStart(2, "0")}</span>${[1, 2, 3, 4, 5, 6, 7].map((column) => `<label class="measurement-field"><span class="measurement-field-label">V${column}</span><input class="measure-value" data-column="${column}" aria-label="Mẫu ${no}, vị trí ${column}" placeholder="${column}" /></label>`).join("")}<label class="measurement-field"><span class="measurement-field-label">Ngoại quan</span><select class="measure-visual" aria-label="Mẫu ${no}, ngoại quan"><option value="">Chọn</option><option value="OK">OK</option><option value="NG">NG</option></select></label><button class="remove-measurement" type="button" data-row="${no}" aria-label="Xóa mẫu ${no}">${icon("trash")}</button></div>`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function value(id: string): string {
  return (document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)?.value ?? "").trim();
}

function setField(id: string, fieldValue: string | number): void {
  const field = document.querySelector<HTMLInputElement>(`#${id}`);
  if (field) field.value = String(fieldValue ?? "");
}

function restoreRecentInspectors(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_INSPECTORS_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((name): name is string => typeof name === "string" && name.trim().length > 0).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecentInspectors(): void {
  localStorage.setItem(RECENT_INSPECTORS_STORAGE_KEY, JSON.stringify(recentInspectors.slice(0, 5)));
}

function renderRecentInspectors(): void {
  const list = document.querySelector<HTMLDataListElement>("#recentInspectors");
  if (!list) return;
  list.innerHTML = recentInspectors.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function rememberInspector(name = value("inspector")): void {
  const normalized = name.trim();
  if (!normalized) return;
  recentInspectors = [normalized, ...recentInspectors.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 5);
  saveRecentInspectors();
  renderRecentInspectors();
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] ?? character);
}

function setMessage(message: string, kind: "info" | "error" | "success" = "info") {
  const element = document.querySelector<HTMLParagraphElement>("#statusMessage")!;
  element.textContent = message;
  element.className = `message ${kind}`;
}

function setFieldError(id: string, message = ""): void {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  const error = document.querySelector<HTMLElement>(`#${id}Error`);
  if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
  if (error) error.textContent = message;
}

function clearFieldErrors(): void {
  document.querySelectorAll<HTMLElement>(".field-error").forEach((element) => { element.textContent = ""; });
  document.querySelectorAll<HTMLElement>("[aria-invalid='true']").forEach((element) => element.setAttribute("aria-invalid", "false"));
}

function renderServerStatus(state: "not-configured" | "configured" | "checking" | "uploading" | "online" | "error"): void {
  const button = document.querySelector<HTMLButtonElement>("#serverStatus");
  const label = document.querySelector<HTMLElement>("#serverStatusText");
  if (!button || !label) return;
  const labels = { "not-configured": "Chưa cấu hình server", configured: "Server đã cấu hình", checking: "Đang kiểm tra server…", uploading: "Đang gửi hồ sơ…", online: "Server đang hoạt động", error: "Server lỗi · Bấm để sửa" };
  label.textContent = labels[state];
  button.className = `connection-pill is-${state}`;
}

function renderPreviewActions(): void {
  const hasPreview = Boolean(previewBytes);
  const current = activeDocument();
  const alreadyUploaded = current?.status === "sent" && Boolean(current.uploaded);
  const create = document.querySelector<HTMLButtonElement>("#createPreview");
  const upload = document.querySelector<HTMLButtonElement>("#uploadPdf");
  const download = document.querySelector<HTMLButtonElement>("#downloadPdf");
  if (create) { create.disabled = isGeneratingPreview || isUploading; create.className = hasPreview ? "secondary" : "primary"; }
  if (upload) {
    upload.disabled = !hasPreview || isGeneratingPreview || isUploading || alreadyUploaded;
    upload.className = hasPreview && !alreadyUploaded ? "primary" : "secondary";
    upload.setAttribute("aria-busy", isUploading ? "true" : "false");
    upload.innerHTML = alreadyUploaded ? `${icon("check")} Đã gửi hồ sơ` : `${icon("upload")} Gửi hồ sơ`;
    upload.title = alreadyUploaded ? "Hồ sơ này đã gửi thành công" : "Gửi hồ sơ QC";
  }
  if (download) download.disabled = !hasPreview || isGeneratingPreview;
}

function renderWorkflowState(): void {
  const current = activeDocument();
  if (!current) return;
  const productComplete = Boolean(value("project") && value("po") && value("partNo") && value("slipNo") && Number(value("quantity")) > 0);
  const inspectionComplete = Boolean(value("recordId") && value("inspector"));
  const previewReady = current.status === "preview-ready" || current.status === "sent";
  const workflow = document.querySelector<HTMLElement>("#workflowStatus");
  const workflowText = workflow?.querySelector("span:last-child");
  const state = current.status === "sent" ? "sent" : current.status === "error" ? "error" : previewReady ? "preview-ready" : "draft";
  const stateLabels = { sent: "Đã upload", error: "Cần kiểm tra", "preview-ready": "Preview sẵn sàng", draft: "Bản nháp" };
  if (workflow) workflow.className = `draft-badge workflow-${state}`;
  if (workflowText) workflowText.textContent = stateLabels[state];
  const productStep = document.querySelector<HTMLElement>("#stepProduct");
  const inspectionStep = document.querySelector<HTMLElement>("#stepInspection");
  const pdfStep = document.querySelector<HTMLElement>("#stepPdf");
  if (productStep) productStep.className = productComplete ? "complete" : "active";
  if (inspectionStep) inspectionStep.className = productComplete && inspectionComplete ? "complete" : productComplete ? "active" : "";
  if (pdfStep) pdfStep.className = previewReady ? "complete" : productComplete && inspectionComplete ? "active" : "";
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function persistUploadedDocumentLibrary(): void {
  localStorage.setItem(UPLOADED_DOCUMENT_STORAGE_KEY, serializeInternalDocuments(uploadedDocuments.filter((document) => document.uploaded)));
}

function activeDocument(): InternalDocument {
  return documents[selectedProductIndex] ?? documents[0];
}

function displayTime(value: string): string {
  return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function renderDocumentRecord(): void {
  const current = activeDocument();
  if (!current) return;
  const partNo = document.querySelector<HTMLElement>("#documentPartNo");
  const updated = document.querySelector<HTMLElement>("#documentUpdated");
  const status = document.querySelector<HTMLElement>("#documentStatus");
  if (partNo) partNo.textContent = current.product.partNo || "Chưa có mã hàng";
  if (updated) updated.textContent = `Hồ sơ ${current.documentId} · cập nhật ${displayTime(current.updatedAt)} · ${current.drawingNames.length} bản vẽ`;
  if (status) {
    status.textContent = documentStatusLabel(current.status);
    status.className = `document-status ${current.status}`;
  }
  renderWorkflowState();
}

function renderEmptyPreview(): void {
  const previewBox = document.querySelector<HTMLDivElement>("#previewBox");
  if (!previewBox) return;
  previewBox.className = "preview-box empty";
  previewBox.innerHTML = `<div class="empty-preview"><span>${icon("eye")}</span><strong>Chưa có bản preview</strong><small>Phiếu QC và bản vẽ của mã hàng đang chọn sẽ hiển thị tại đây.</small></div>`;
  renderPreviewActions();
}

function showPreview(bytes: Uint8Array): void {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(new Blob([blobPart(bytes)], { type: "application/pdf" }));
  const previewBox = document.querySelector<HTMLDivElement>("#previewBox")!;
  previewBox.className = "preview-box";
  previewBox.innerHTML = `<iframe title="PDF preview" src="${previewUrl}"></iframe>`;
  renderPreviewActions();
}

function clearActivePreview(): void {
  const current = activeDocument();
  if (!current) return;
  previewBytes = undefined;
  previewBytesByDocument.delete(current.documentId);
  previewPageCountByDocument.delete(current.documentId);
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
  }
  renderEmptyPreview();
  current.status = "draft";
  current.requestId = undefined;
  current.pageCount = undefined;
  current.updatedAt = new Date().toISOString();
  renderProductList();
  renderDocumentRecord();
}

function markActiveDocumentDirty(): void {
  const current = activeDocument();
  if (!current) return;
  if (previewBytes || current.status === "preview-ready") clearActivePreview();
  current.status = "draft";
  current.statusMessage = undefined;
  current.updatedAt = new Date().toISOString();
  renderProductList();
  renderDocumentRecord();
}

function readFormSnapshot(): ProductQc {
  return {
    recordId: value("recordId"),
    inspectionDate: value("inspectionDate") || today(),
    inspector: value("inspector"),
    inspectionLevel: value("inspectionLevel"),
    defectQuantity: Number(value("defectQuantity") || 0),
    defectContent: value("defectContent"),
    responseDueDate: value("responseDueDate"),
    measurements: [...document.querySelectorAll<HTMLDivElement>("#measurementRows .measurement-row")].map((row, index) => ({
      no: index + 1,
      values: [...row.querySelectorAll<HTMLInputElement>(".measure-value")].map((field) => field.value.trim()),
      visualResult: row.querySelector<HTMLSelectElement>(".measure-visual")?.value.trim(),
    })),
    product: productFromForm(),
  };
}

function persistActiveDocument(): void {
  const current = activeDocument();
  if (!current) return;
  const qc = readFormSnapshot();
  current.qc = qc;
  current.product = qc.product;
  current.drawingNames = drawingFiles.map((file) => file.name);
  current.updatedAt = new Date().toISOString();
  drawingFilesByDocument.set(current.documentId, [...drawingFiles]);
}

function renderMeasurementRowsFromData(rows: ProductQc["measurements"]): void {
  const container = document.querySelector<HTMLDivElement>("#measurementRows")!;
  const safeRows = rows.length > 0 ? rows : [{ no: 1, values: [], visualResult: "" }];
  container.innerHTML = safeRows.map((row, index) => measurementRow(index + 1)).join("");
  safeRows.forEach((row, index) => {
    const element = container.querySelectorAll<HTMLDivElement>(".measurement-row")[index];
    element.querySelectorAll<HTMLInputElement>(".measure-value").forEach((field, column) => { field.value = String(row.values[column] ?? ""); });
    const visual = element.querySelector<HTMLSelectElement>(".measure-visual");
    if (visual) visual.value = row.visualResult ?? "";
  });
}

function renderProductList(): void {
  const list = document.querySelector<HTMLDivElement>("#productList")!;
  const count = document.querySelector<HTMLSpanElement>("#productCount")!;
  count.textContent = `${documents.length} sản phẩm · ${documents.filter((document) => document.status === "sent").length} đã gửi`;
  list.innerHTML = documents.map((document, index) => `<button class="product-item ${index === selectedProductIndex ? "selected" : ""}" type="button" data-product-index="${index}" aria-pressed="${index === selectedProductIndex}"><span class="product-index">${String(index + 1).padStart(2, "0")}</span><span class="product-summary"><strong>${escapeHtml(document.product.partNo || "Chưa có mã hàng")}</strong><small>${escapeHtml(document.product.productName || "Sản phẩm mới")} · ${escapeHtml(document.product.po || "Chưa có PO")}</small><span class="document-status ${document.status}">${documentStatusLabel(document.status)}</span></span><span class="product-arrow">›</span></button>`).join("");
}

function renderUploadedLibrary(): void {
  const library = document.querySelector<HTMLDetailsElement>("#documentLibrary");
  const list = document.querySelector<HTMLDivElement>("#uploadedLibrary");
  const count = document.querySelector<HTMLSpanElement>("#uploadedCount");
  const query = value("librarySearch").toLowerCase();
  const fromDate = value("libraryFrom");
  const toDate = value("libraryTo");
  const filteredDocuments = uploadedDocuments.filter((record) => {
    const matchesQuery = [record.product.partNo, record.product.po, record.uploaded?.qcNo, record.documentId].some((field) => field?.toLowerCase().includes(query));
    const uploadDate = record.uploaded?.sentAt.slice(0, 10) ?? "";
    return matchesQuery && (!fromDate || uploadDate >= fromDate) && (!toDate || uploadDate <= toDate);
  });
  const uploaded = filteredDocuments.map((record) => ({ record }));
  if (count) count.textContent = query ? `${uploaded.length}/${uploadedDocuments.length} hồ sơ` : `${uploaded.length} hồ sơ`;
  if (!list) return;
  if (!library?.open) {
    list.innerHTML = `<div class="library-empty">Nhấn để mở thư viện tài liệu.</div>`;
    return;
  }
  if (uploaded.length === 0) {
    list.innerHTML = `<div class="library-empty">${query ? "Không tìm thấy hồ sơ phù hợp." : "Chưa có file upload thành công trong phiên này."}</div>`;
    return;
  }
  list.innerHTML = uploaded.map(({ record }) => `<div class="library-item"><button type="button" class="library-open" data-library-document-id="${escapeHtml(record.documentId)}"><span class="file-type">PDF</span><span><strong>${escapeHtml(record.product.partNo)}</strong><small>${escapeHtml(record.uploaded?.qcNo ?? record.documentId)} · ${displayTime(record.uploaded?.sentAt ?? record.updatedAt)}</small></span></button><span class="library-actions">${record.uploaded?.qr?.payload ? `<button type="button" class="library-print" data-print-document-id="${escapeHtml(record.documentId)}">${icon("print")} In tem</button>` : `<span class="library-no-qr">Chưa có QR</span>`}${record.uploaded?.openUrl ? `<a class="library-link" href="${escapeHtml(record.uploaded.openUrl)}" target="_blank" rel="noreferrer">Mở</a>` : ""}<button type="button" class="library-delete" data-delete-document-id="${escapeHtml(record.documentId)}" aria-label="Xóa hồ sơ ${escapeHtml(record.product.partNo)}" title="Xóa khỏi Document Library">${icon("trash")}</button></span></div>`).join("");
}

function deleteUploadedDocument(documentId: string): void {
  const record = uploadedDocuments.find((item) => item.documentId === documentId);
  if (!record) return;
  const partNo = record.product.partNo || record.documentId;
  if (!window.confirm(`Xóa hồ sơ ${partNo} khỏi Document Library trên máy này? File đã upload trên Google Drive không bị xóa.`)) return;

  const index = documents.findIndex((item) => item.documentId === documentId);
  const wasSelected = index === selectedProductIndex;
  uploadedDocuments = uploadedDocuments.filter((item) => item.documentId !== documentId);
  drawingFilesByDocument.delete(documentId);
  previewBytesByDocument.delete(documentId);
  previewPageCountByDocument.delete(documentId);
  if (index >= 0) documents.splice(index, 1);
  if (documents.length === 0) documents = [createInternalDocument(sampleProduct, 1)];
  if (index >= 0 && index < selectedProductIndex) selectedProductIndex -= 1;
  selectedProductIndex = Math.max(0, Math.min(selectedProductIndex, documents.length - 1));
  persistUploadedDocumentLibrary();
  if (wasSelected || index >= 0) loadProductDocument(selectedProductIndex, false);
  renderProductList();
  renderUploadedLibrary();
  renderDocumentRecord();
  setMessage(`Đã xóa hồ sơ ${partNo} khỏi Document Library trên máy này.`, "success");
}

function removeProductCard(documentId: string): void {
  const index = documents.findIndex((document) => document.documentId === documentId);
  if (index < 0) return;
  const wasSelected = index === selectedProductIndex;
  documents.splice(index, 1);
  drawingFilesByDocument.delete(documentId);
  previewBytesByDocument.delete(documentId);
  previewPageCountByDocument.delete(documentId);

  if (documents.length === 0) {
    documents = [createInternalDocument({
      ...sampleProduct,
      project: "",
      po: "",
      partNo: "",
      productName: "",
      supplier: "",
      quantity: 0,
      slipNo: "",
      receivedDate: "",
    }, 1)];
  }
  if (index < selectedProductIndex) selectedProductIndex -= 1;
  selectedProductIndex = Math.max(0, Math.min(selectedProductIndex, documents.length - 1));

  if (wasSelected) {
    previewBytes = undefined;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = undefined;
    }
    loadProductDocument(selectedProductIndex, false);
  } else {
    renderProductList();
    renderDocumentRecord();
  }
}

function registerUploadSuccess(result: UploadSuccessRecord): void {
  const current = documents.find((document) => (result.documentId && document.documentId === result.documentId) || (result.requestId && document.requestId === result.requestId));
  if (!current) {
    renderServerStatus("error");
    setMessage("Upload thành công nhưng không xác định được mã hàng tương ứng. Vui lòng kiểm tra Document Library.", "error");
    return;
  }
  markDocumentUploaded(current, result);
  const existingIndex = uploadedDocuments.findIndex((document) => document.documentId === current.documentId);
  if (existingIndex >= 0) uploadedDocuments[existingIndex] = current;
  else uploadedDocuments.push(current);
  persistUploadedDocumentLibrary();
  removeProductCard(current.documentId);
  renderUploadedLibrary();
  renderServerStatus("online");
  setMessage(`Upload thành công cho mã hàng ${current.product.partNo}. Card đã được đóng và hồ sơ đã lưu vào Document Library.`, "success");
}

function normalizeUploadSuccess(detail: UploadSuccessRecord & Record<string, unknown>): UploadSuccessRecord {
  return {
    documentId: detail.documentId ?? detail.document_id as string | undefined,
    requestId: detail.requestId ?? detail.request_id as string | undefined,
    productKey: detail.productKey ?? detail.product_key as string | undefined,
    qcNo: detail.qcNo ?? detail.qc_no as string | undefined,
    fileName: detail.fileName ?? detail.file_name as string | undefined,
    fileId: detail.fileId ?? detail.file_id as string | undefined,
    openUrl: detail.openUrl ?? detail.open_url as string | undefined,
    downloadUrl: detail.downloadUrl ?? detail.download_url as string | undefined,
    sentAt: detail.sentAt ?? detail.sent_at as string | undefined,
  };
}

function restoreDocumentForm(record: InternalDocument): void {
  const qc = record.qc;
  setField("project", record.product.project);
  setField("po", record.product.po);
  setField("partNo", record.product.partNo);
  setField("productName", record.product.productName ?? "");
  setField("lotNo", record.product.lotNo ?? "N/A");
  setField("supplier", record.product.supplier ?? "");
  setField("quantity", record.product.quantity);
  setField("unit", record.product.unit);
  setField("slipNo", record.product.slipNo);
  setField("receivedDate", record.product.receivedDate);
  setField("recordId", qc.recordId);
  setField("inspectionDate", qc.inspectionDate);
  setField("inspector", qc.inspector);
  setField("inspectionLevel", qc.inspectionLevel ?? "");
  setField("defectQuantity", qc.defectQuantity ?? 0);
  setField("responseDueDate", qc.responseDueDate ?? "");
  const defectContent = globalThis.document.querySelector<HTMLTextAreaElement>("#defectContent");
  if (defectContent) defectContent.value = qc.defectContent ?? "";
  renderMeasurementRowsFromData(qc.measurements);
}

function loadProductDocument(index: number, announce = true): void {
  const next = documents[index];
  if (!next) return;
  if (index !== selectedProductIndex) persistActiveDocument();
  selectedProductIndex = index;
  drawingFiles = [...(drawingFilesByDocument.get(next.documentId) ?? [])];
  restoreDocumentForm(next);
  previewBytes = previewBytesByDocument.get(next.documentId);
  if (previewBytes) showPreview(previewBytes); else renderEmptyPreview();
  renderDrawingList();
  renderProductList();
  renderDocumentRecord();
  if (announce) setMessage(`Đang mở hồ sơ riêng của mã hàng ${next.product.partNo}.`);
}

function productFromForm(): Product {
  return {
    project: value("project"),
    po: value("po"),
    partNo: value("partNo"),
    productName: value("productName"),
    lotNo: value("lotNo") || "N/A",
    supplier: value("supplier"),
    quantity: Number(value("quantity")) || 0,
    unit: value("unit") || "PCS",
    slipNo: value("slipNo"),
    receivedDate: value("receivedDate"),
  };
}

function syncCurrentProduct(): void {
  persistActiveDocument();
}

function legacyRenderProductList(): void {
  const list = document.querySelector<HTMLDivElement>("#productList")!;
  const count = document.querySelector<HTMLSpanElement>("#productCount")!;
  count.textContent = `${products.length} sản phẩm`;
  list.innerHTML = products.map((product, index) => `<button class="product-item ${index === selectedProductIndex ? "selected" : ""}" type="button" data-product-index="${index}" aria-pressed="${index === selectedProductIndex}"><span class="product-index">${String(index + 1).padStart(2, "0")}</span><span class="product-summary"><strong>${escapeHtml(product.partNo || "Chưa có mã hàng")}</strong><small>${escapeHtml(product.productName || "Sản phẩm mới")} · ${escapeHtml(product.po || "Chưa có PO")}</small></span><span class="product-arrow">›</span></button>`).join("");
}

function legacyLoadProduct(index: number): void {
  const product = products[index];
  if (!product) return;
  selectedProductIndex = index;
  setField("project", product.project);
  setField("po", product.po);
  setField("partNo", product.partNo);
  setField("productName", product.productName ?? "");
  setField("lotNo", product.lotNo ?? "N/A");
  setField("supplier", product.supplier ?? "");
  setField("quantity", product.quantity);
  setField("unit", product.unit);
  setField("slipNo", product.slipNo);
  setField("receivedDate", product.receivedDate);
  renderProductList();
}

function readProductQc(): ProductQc {
  clearFieldErrors();
  const quantity = Number(value("quantity"));
  const defectQuantity = Number(value("defectQuantity") || 0);
  const required: Array<[string, string]> = [
    ["project", "Mã dự án"], ["po", "PO"], ["partNo", "Mã hàng"], ["slipNo", "Số phiếu nhập kho"], ["recordId", "Mã hồ sơ QC"], ["inspector", "Người kiểm tra"],
  ];
  let firstInvalid = "";
  for (const [id, label] of required) {
    if (!value(id)) {
      setFieldError(id, `Vui lòng nhập ${label.toLowerCase()}.`);
      if (!firstInvalid) firstInvalid = id;
    }
  }
  if (!Number.isFinite(quantity) || quantity <= 0) { setFieldError("quantity", "Số lượng phải lớn hơn 0."); if (!firstInvalid) firstInvalid = "quantity"; }
  if (!Number.isFinite(defectQuantity) || defectQuantity < 0) { setFieldError("defectQuantity", "Số lượng hàng lỗi không hợp lệ."); if (!firstInvalid) firstInvalid = "defectQuantity"; }
  if (firstInvalid) {
    document.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
    throw new Error("Vui lòng bổ sung các trường bắt buộc trước khi tiếp tục.");
  }

  return {
    recordId: value("recordId"),
    inspectionDate: value("inspectionDate") || today(),
    inspector: value("inspector"),
    inspectionLevel: value("inspectionLevel"),
    defectQuantity,
    defectContent: value("defectContent"),
    responseDueDate: value("responseDueDate"),
    measurements: [...document.querySelectorAll<HTMLDivElement>("#measurementRows .measurement-row")].map((row, index) => ({
      no: index + 1,
      values: [...row.querySelectorAll<HTMLInputElement>(".measure-value")].map((field) => field.value.trim()),
      visualResult: row.querySelector<HTMLSelectElement>(".measure-visual")?.value.trim(),
    })),
    product: productFromForm(),
  };
}

function legacyRenderDrawingList(): void {
  const list = document.querySelector<HTMLDivElement>("#drawingList")!;
  if (drawingFiles.length === 0) {
    list.innerHTML = `<div class="drawing-empty">Chưa có bản vẽ nào được chọn.</div>`;
    return;
  }
  list.innerHTML = drawingFiles.map((file, index) => `<div class="drawing-item"><span class="file-type">PDF</span><span class="drawing-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><span class="drawing-size">${Math.max(1, Math.round(file.size / 1024))} KB</span><button class="remove-drawing" type="button" data-drawing-index="${index}" aria-label="Xóa ${escapeHtml(file.name)}">${icon("trash")}</button></div>`).join("");
}

function legacyAddDrawingFiles(files: File[]): void {
  const accepted = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  const rejected = files.length - accepted.length;
  const known = new Set(drawingFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  const fresh = accepted.filter((file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`));
  drawingFiles = [...drawingFiles, ...fresh];
  renderDrawingList();
  if (rejected > 0) setMessage(`${rejected} file không phải PDF đã được bỏ qua.`, "error");
  else if (fresh.length > 0) setMessage(`Đã chọn ${drawingFiles.length} bản vẽ PDF.`);
}

function renderDrawingList(): void {
  const list = document.querySelector<HTMLDivElement>("#drawingList")!;
  if (drawingFiles.length === 0) {
    list.innerHTML = `<div class="drawing-empty">Chưa có bản vẽ nào được chọn cho mã hàng này.</div>`;
    return;
  }
  list.innerHTML = drawingFiles.map((file, index) => `<div class="drawing-item"><span class="file-type">PDF</span><span class="drawing-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><span class="drawing-size">${Math.max(1, Math.round(file.size / 1024))} KB</span><button class="remove-drawing" type="button" data-drawing-index="${index}" aria-label="Xóa ${escapeHtml(file.name)}">${icon("trash")}</button></div>`).join("");
}

function addDrawingFiles(files: File[]): void {
  const accepted = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  const rejected = files.length - accepted.length;
  const known = new Set(drawingFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  const fresh = accepted.filter((file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`));
  if (fresh.length > 0) markActiveDocumentDirty();
  drawingFiles = [...drawingFiles, ...fresh];
  renderDrawingList();
  persistActiveDocument();
  if (rejected > 0) setMessage(`${rejected} file không phải PDF đã được bỏ qua.`, "error");
  else if (fresh.length > 0) setMessage(`Đã chọn ${drawingFiles.length} bản vẽ riêng cho ${activeDocument().product.partNo}.`);
}

function renumberMeasurementRows(): void {
  document.querySelectorAll<HTMLDivElement>("#measurementRows .measurement-row").forEach((row, index) => {
    const no = index + 1;
    row.dataset.row = String(no);
    const label = row.querySelector<HTMLSpanElement>(".row-label");
    if (label) label.textContent = `Mẫu ${String(no).padStart(2, "0")}`;
    row.querySelectorAll<HTMLInputElement>(".measure-value").forEach((field, column) => { field.ariaLabel = `Mẫu ${no}, vị trí ${column + 1}`; });
    const visual = row.querySelector<HTMLSelectElement>(".measure-visual");
    if (visual) visual.ariaLabel = `Mẫu ${no}, ngoại quan`;
    const remove = row.querySelector<HTMLButtonElement>(".remove-measurement");
    if (remove) { remove.dataset.row = String(no); remove.ariaLabel = `Xóa mẫu ${no}`; }
  });
}

document.querySelector<HTMLDivElement>("#productList")!.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-product-index]");
  if (!target) return;
  syncCurrentProduct();
  loadProductDocument(Number(target.dataset.productIndex));
});

document.querySelector<HTMLDetailsElement>("#documentLibrary")?.addEventListener("toggle", () => renderUploadedLibrary());
document.querySelector<HTMLInputElement>("#librarySearch")?.addEventListener("input", () => renderUploadedLibrary());
document.querySelector<HTMLInputElement>("#libraryFrom")?.addEventListener("change", () => renderUploadedLibrary());
document.querySelector<HTMLInputElement>("#libraryTo")?.addEventListener("change", () => renderUploadedLibrary());
document.querySelector<HTMLDivElement>("#uploadedLibrary")!.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("a")) return;
  const deleteTarget = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-delete-document-id]");
  if (deleteTarget?.dataset.deleteDocumentId) {
    deleteUploadedDocument(deleteTarget.dataset.deleteDocumentId);
    return;
  }
  const printTarget = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-print-document-id]");
  if (printTarget?.dataset.printDocumentId) {
    openLabelPrint(printTarget.dataset.printDocumentId);
    return;
  }
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-library-document-id]");
  if (!target) return;
  const documentId = target.dataset.libraryDocumentId;
  const libraryRecord = uploadedDocuments.find((record) => record.documentId === documentId);
  if (!libraryRecord) return;
  let index = documents.findIndex((record) => record.documentId === documentId);
  if (index < 0) {
    documents.push(libraryRecord);
    index = documents.length - 1;
    renderProductList();
  }
  loadProductDocument(index);
});

document.querySelector<HTMLInputElement>("#inspector")!.addEventListener("blur", () => rememberInspector());
window.addEventListener("digital-qc:upload-success", (event) => {
  const detail = (event as CustomEvent<UploadSuccessRecord & Record<string, unknown>>).detail;
  if (detail) registerUploadSuccess(normalizeUploadSuccess(detail));
});

async function retryOutboxOnStartup(): Promise<void> {
  try {
    const queuedBeforeRetry = await listQueuedPdfs();
    if (queuedBeforeRetry.length > 0) {
      setMessage(`${queuedBeforeRetry.length} hồ sơ đang được bảo toàn trong Outbox; app sẽ tự thử gửi lại khi có mạng.`, "info");
    }
    const results = await retryQueuedPdfs();
    const successful = results.filter((result) => result.success && result.response);
    if (successful.length === 0) return;
    successful.forEach((result) => {
      const response = result.response ?? {};
      if (!documents.some((document) => document.documentId === result.document_id)) {
        try {
          const restoredQc = JSON.parse(result.meta.qc_json) as ProductQc;
          const restored = createInternalDocument(restoredQc.product, documents.length + 1);
          restored.documentId = result.document_id;
          restored.requestId = result.request_id;
          restored.qc = restoredQc;
          restored.product = restoredQc.product;
          documents.push(restored);
        } catch {
          // The upload result is still retained by the server even if old metadata cannot restore the card.
        }
      }
      window.dispatchEvent(new CustomEvent("digital-qc:upload-success", {
        detail: { ...response, documentId: result.document_id, requestId: result.request_id },
      }));
    });
    renderProductList();
    if (successful.length > 0) setMessage(`Đã tự động gửi ${successful.length} hồ sơ trong Outbox sau khi kết nối trở lại.`, "success");
  } catch {
    // Browser mode and an unavailable Tauri bridge are both safe no-ops here.
  }
}

document.querySelector<HTMLButtonElement>("#importExcel")!.addEventListener("click", () => {
  try {
    const imported = parseProductPaste(value("excelPaste"));
    if (documents.length > 0) persistActiveDocument();
    documents = imported.map((product, index) => createInternalDocument(product, index + 1));
    drawingFilesByDocument.clear();
    previewBytesByDocument.clear();
    previewPageCountByDocument.clear();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
    previewBytes = undefined;
    selectedProductIndex = 0;
    loadProductDocument(0, false);
    renderUploadedLibrary();
    setMessage(`Đã nạp ${imported.length} sản phẩm từ Excel.`, "success");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Không đọc được dữ liệu Excel.", "error");
  }
});

document.querySelector<HTMLButtonElement>("#addMeasurementRow")!.addEventListener("click", () => {
  const rows = document.querySelector<HTMLDivElement>("#measurementRows")!;
  const nextNo = rows.querySelectorAll(".measurement-row").length + 1;
  rows.insertAdjacentHTML("beforeend", measurementRow(nextNo));
});

document.querySelector<HTMLDivElement>("#measurementRows")!.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".remove-measurement");
  if (!button) return;
  const rows = document.querySelectorAll("#measurementRows .measurement-row");
  if (rows.length <= 1) return;
  button.closest<HTMLDivElement>(".measurement-row")?.remove();
  renumberMeasurementRows();
});

const drawingInput = document.querySelector<HTMLInputElement>("#drawingPdf")!;
const drawingDropzone = document.querySelector<HTMLLabelElement>("#drawingDropzone")!;
drawingInput.addEventListener("change", () => {
  addDrawingFiles(Array.from(drawingInput.files ?? []));
  drawingInput.value = "";
});
drawingDropzone.addEventListener("dragover", (event) => { event.preventDefault(); drawingDropzone.classList.add("drag-over"); });
drawingDropzone.addEventListener("dragleave", () => drawingDropzone.classList.remove("drag-over"));
drawingDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  drawingDropzone.classList.remove("drag-over");
  addDrawingFiles(Array.from(event.dataTransfer?.files ?? []));
});
document.querySelector<HTMLDivElement>("#drawingList")!.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-drawing-index]");
  if (!button) return;
  drawingFiles.splice(Number(button.dataset.drawingIndex), 1);
  markActiveDocumentDirty();
  renderDrawingList();
  persistActiveDocument();
  setMessage(`Còn ${drawingFiles.length} bản vẽ PDF.`);
});

function configuredEndpoint(): string {
  return localStorage.getItem(API_ENDPOINT_STORAGE_KEY)?.trim() ?? "";
}

function printTargetDocument(): InternalDocument | undefined {
  return uploadedDocuments.find((record) => record.documentId === printingDocumentId && record.uploaded?.qr?.payload);
}

async function renderLabelPreview(): Promise<void> {
  const current = printTargetDocument();
  const preview = document.querySelector<HTMLDivElement>("#labelPreview");
  const templateSelect = document.querySelector<HTMLSelectElement>("#labelTemplate");
  const profileSelect = document.querySelector<HTMLSelectElement>("#printerProfile");
  const templateHint = document.querySelector<HTMLElement>("#labelTemplateHint");
  const profileHint = document.querySelector<HTMLElement>("#printerProfileHint");
  if (!current || !preview || !templateSelect || !profileSelect || !current.uploaded?.qr?.payload) return;
  const template = getLabelTemplate(templateSelect.value);
  const profile = getPrinterProfile(profileSelect.value);
  if (templateHint) templateHint.textContent = `${template.description} · ${template.labelWidthMm}×${template.labelHeightMm} mm`;
  if (profileHint) profileHint.textContent = `${profile.family}: ${profile.note}`;
  const renderKey = `${current.documentId}:${template.id}:${profile.id}`;
  preview.innerHTML = `<div class="label-preview-loading">Đang dựng preview QR…</div>`;
  const qrDataUrl = await createQrDataUrl(current.uploaded.qr.payload, 320);
  if (renderKey !== `${printingDocumentId}:${templateSelect.value}:${profileSelect.value}`) return;
  const qrPercent = `${(template.qrSizeMm / template.labelWidthMm) * 100}%`;
  preview.innerHTML = `<div class="label-preview-sheet"><div class="label-preview-real" style="--preview-qr-width:${qrPercent}; aspect-ratio:${template.labelWidthMm} / ${template.labelHeightMm};">${labelMarkup(current, template, qrDataUrl)}</div><small class="label-preview-note">Preview đúng tỷ lệ ${template.labelWidthMm} × ${template.labelHeightMm} mm · nội dung sẽ được cắt gọn nếu vượt chiều rộng tem</small></div>`;
}

function openLabelPrint(documentId: string): void {
  const current = uploadedDocuments.find((record) => record.documentId === documentId);
  if (!current?.uploaded?.qr?.payload) {
    setMessage("Hồ sơ này chưa có link QR từ server.", "error");
    return;
  }
  printingDocumentId = documentId;
  const dialog = document.querySelector<HTMLDialogElement>("#labelPrintDialog");
  const documentLabel = document.querySelector<HTMLElement>("#labelPrintDocument");
  const profileSelect = document.querySelector<HTMLSelectElement>("#printerProfile");
  const templateSelect = document.querySelector<HTMLSelectElement>("#labelTemplate");
  const savedProfile = localStorage.getItem(PRINTER_PROFILE_STORAGE_KEY) ?? "windows-system";
  const profile = getPrinterProfile(savedProfile);
  if (profileSelect) profileSelect.value = profile.id;
  if (templateSelect) templateSelect.value = localStorage.getItem(LABEL_TEMPLATE_STORAGE_KEY) ?? profile.templateId;
  if (documentLabel) documentLabel.textContent = `${current.product.partNo} · ${current.uploaded.qcNo ?? current.qc.recordId} · đã lưu QR${current.uploaded.qr.printCount > 0 ? ` · đã in ${current.uploaded.qr.printCount} lần` : ""}`;
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  void renderLabelPreview();
}

function openServerConfig(): void {
  const dialog = document.querySelector<HTMLDialogElement>("#serverConfigDialog");
  const endpoint = document.querySelector<HTMLInputElement>("#serverEndpoint");
  if (!dialog || !endpoint) return;
  endpoint.value = configuredEndpoint();
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => endpoint.focus());
}

document.querySelector<HTMLButtonElement>("#serverStatus")!.addEventListener("click", openServerConfig);
document.querySelector<HTMLButtonElement>("#cancelServerConfig")!.addEventListener("click", () => document.querySelector<HTMLDialogElement>("#serverConfigDialog")?.close());
document.querySelector<HTMLButtonElement>("#pingServer")!.addEventListener("click", async () => {
  const endpoint = value("serverEndpoint");
  const button = document.querySelector<HTMLButtonElement>("#pingServer")!;
  const message = document.querySelector<HTMLElement>("#serverPingMessage")!;
  if (!endpoint) { setFieldError("serverEndpoint", "Vui lòng nhập URL server."); return; }
  setFieldError("serverEndpoint", "");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Đang kiểm tra…";
  message.className = "dialog-message is-loading";
  message.textContent = "Đang gửi ping đến Web App…";
  renderServerStatus("checking");
  try {
    const result = await pingServer(endpoint);
    renderServerStatus("online");
    message.className = "dialog-message is-success";
    message.textContent = result.user ? `Kết nối thành công · tài khoản: ${result.user}` : "Kết nối thành công · Web App đang hoạt động.";
    setMessage("Đã kiểm tra kết nối server thành công.", "success");
  } catch (error) {
    renderServerStatus("error");
    message.className = "dialog-message is-error";
    message.textContent = error instanceof Error ? error.message : "Không kết nối được server.";
    setMessage("Không kiểm tra được server. Kiểm tra URL hoặc quyền truy cập rồi thử lại.", "error");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "Kiểm tra kết nối";
  }
});
document.querySelector<HTMLFormElement>("#serverConfigForm")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const endpoint = value("serverEndpoint");
  if (!endpoint) { setFieldError("serverEndpoint", "Vui lòng nhập URL server."); return; }
  localStorage.setItem(API_ENDPOINT_STORAGE_KEY, endpoint);
  document.querySelector<HTMLDialogElement>("#serverConfigDialog")?.close();
  renderServerStatus("configured");
  setMessage("Đã lưu cấu hình server upload.", "success");
});

document.querySelector<HTMLButtonElement>("#cancelLabelPrint")!.addEventListener("click", () => document.querySelector<HTMLDialogElement>("#labelPrintDialog")?.close());
document.querySelector<HTMLSelectElement>("#printerProfile")!.addEventListener("change", () => {
  const profileSelect = document.querySelector<HTMLSelectElement>("#printerProfile")!;
  const templateSelect = document.querySelector<HTMLSelectElement>("#labelTemplate")!;
  const profile = getPrinterProfile(profileSelect.value);
  localStorage.setItem(PRINTER_PROFILE_STORAGE_KEY, profile.id);
  templateSelect.value = profile.templateId;
  localStorage.setItem(LABEL_TEMPLATE_STORAGE_KEY, templateSelect.value);
  void renderLabelPreview();
});
document.querySelector<HTMLSelectElement>("#labelTemplate")!.addEventListener("change", (event) => {
  localStorage.setItem(LABEL_TEMPLATE_STORAGE_KEY, (event.target as HTMLSelectElement).value);
  void renderLabelPreview();
});
document.querySelector<HTMLInputElement>("#labelCopies")!.addEventListener("input", () => { /* keeps the control native and keyboard-friendly */ });
document.querySelector<HTMLFormElement>("#labelPrintForm")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = printTargetDocument();
  const profileSelect = document.querySelector<HTMLSelectElement>("#printerProfile")!;
  const templateSelect = document.querySelector<HTMLSelectElement>("#labelTemplate")!;
  const copiesInput = document.querySelector<HTMLInputElement>("#labelCopies")!;
  if (!current?.uploaded?.qr?.payload) {
    setMessage("Không tìm thấy QR đã lưu cho hồ sơ này.", "error");
    return;
  }
  const template = getLabelTemplate(templateSelect.value);
  const profile = getPrinterProfile(profileSelect.value);
  const copies = Math.max(1, Math.min(100, Number(copiesInput.value) || 1));
  copiesInput.value = String(copies);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setMessage("Trình duyệt đã chặn cửa sổ in. Hãy cho phép popup rồi thử lại.", "error");
    return;
  }
  const qrDataUrl = await createQrDataUrl(current.uploaded.qr.payload, 480);
  printWindow.document.open();
  printWindow.document.write(printSheetHtml(current, template, copies, qrDataUrl));
  printWindow.document.close();
  markQrPrinted(current, template.id, profile.id);
  const localRecord = uploadedDocuments.find((record) => record.documentId === current.documentId);
  if (localRecord) localRecord.uploaded = current.uploaded;
  persistUploadedDocumentLibrary();
  renderUploadedLibrary();
  document.querySelector<HTMLDialogElement>("#labelPrintDialog")?.close();
  setMessage(`Đã mở hộp thoại in ${copies} tem QR cho ${current.product.partNo}.`, "success");
});

document.querySelector<HTMLButtonElement>("#createPreview")!.addEventListener("click", async () => {
  if (isGeneratingPreview || isUploading) return;
  isGeneratingPreview = true;
  renderPreviewActions();
  try {
    if (drawingFiles.length === 0) throw new Error("Cần chọn ít nhất một PDF bản vẽ trước khi tạo preview.");
    syncCurrentProduct();
    const qc = readProductQc();
    const current = activeDocument();
    setMessage(`Đang tạo phiếu QC và ghép ${drawingFiles.length} bản vẽ…`);
    let mergedBytes = await createQcSheetPdf(qc, await loadVietnameseFont());
    for (const [index, drawing] of drawingFiles.entries()) {
      setMessage(`Đang ghép bản vẽ ${index + 1}/${drawingFiles.length}…`);
      mergedBytes = await mergeProductPdf(mergedBytes, new Uint8Array(await drawing.arrayBuffer()));
    }
    previewBytes = mergedBytes;
    const pageCount = (await PDFDocument.load(previewBytes)).getPageCount();
    previewBytesByDocument.set(current.documentId, previewBytes);
    previewPageCountByDocument.set(current.documentId, pageCount);
    current.qc = qc;
    current.product = qc.product;
    current.drawingNames = drawingFiles.map((file) => file.name);
    current.pageCount = pageCount;
    current.status = "preview-ready";
    current.statusMessage = `${pageCount} pages ready`;
    current.updatedAt = new Date().toISOString();
    drawingFilesByDocument.set(current.documentId, [...drawingFiles]);
    showPreview(previewBytes);
    renderProductList();
    renderDocumentRecord();
    setMessage(`Preview sẵn sàng: ${pageCount} trang · ${productKey(qc.product)}`, "success");
  } catch (error) {
    previewBytes = undefined;
    renderPreviewActions();
    const current = activeDocument();
    current.status = "error";
    current.statusMessage = error instanceof Error ? error.message : "PDF error";
    current.updatedAt = new Date().toISOString();
    renderProductList();
    renderDocumentRecord();
    setMessage(error instanceof Error ? error.message : "Không tạo được PDF.", "error");
  } finally {
    isGeneratingPreview = false;
    renderPreviewActions();
  }
});

document.querySelector<HTMLButtonElement>("#uploadPdf")!.addEventListener("click", async () => {
  if (!previewBytes || isGeneratingPreview || isUploading) return;
  const selectedDocument = activeDocument();
  if (selectedDocument.status === "sent" && selectedDocument.uploaded) {
    setMessage("Hồ sơ này đã gửi thành công. Hãy chỉnh sửa và tạo preview mới nếu cần gửi lại.", "info");
    return;
  }
  const endpoint = configuredEndpoint();
  if (!endpoint) {
    setMessage("Chưa có URL server upload. Hãy cấu hình trước khi gửi hồ sơ.", "error");
    openServerConfig();
    return;
  }
  let qc: ProductQc;
  try {
    syncCurrentProduct();
    qc = readProductQc();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Thông tin QC chưa hợp lệ.", "error");
    return;
  }
  const current = activeDocument();
  const requestId = current.requestId ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  current.requestId = requestId;
  current.qc = qc;
  current.product = qc.product;
  current.statusMessage = "Đang upload";
  isUploading = true;
  renderPreviewActions();
  renderServerStatus("uploading");
  renderDocumentRecord();
  setMessage(`Đang gửi hồ sơ của mã hàng ${current.product.partNo}…`);
  try {
    await uploadProductPdf(previewBytes, qc, { endpoint, requestId, documentId: current.documentId, productKey: productKey(qc.product) });
  } catch (error) {
    current.status = "error";
    current.statusMessage = error instanceof Error ? error.message : "Upload failed";
    current.updatedAt = new Date().toISOString();
    renderServerStatus("error");
    renderProductList();
    renderDocumentRecord();
    setMessage(error instanceof Error ? error.message : "Không upload được hồ sơ.", "error");
  } finally {
    isUploading = false;
    renderPreviewActions();
  }
});

document.querySelector<HTMLButtonElement>("#downloadPdf")!.addEventListener("click", () => {
  if (!previewBytes) return;
  const url = URL.createObjectURL(new Blob([blobPart(previewBytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${value("recordId") || "qc-record"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector<HTMLDivElement>(".form-column")!.addEventListener("input", (event) => {
  const target = event.target as HTMLElement;
  if (target.id && target.id !== "excelPaste") setFieldError(target.id, "");
  if (target.id !== "excelPaste") markActiveDocumentDirty();
});

loadProductDocument(0, false);
renderProductList();
renderDrawingList();
renderRecentInspectors();
renderUploadedLibrary();
renderServerStatus(configuredEndpoint() ? "configured" : "not-configured");
renderPreviewActions();
void retryOutboxOnStartup();
window.addEventListener("online", () => { void retryOutboxOnStartup(); });

window.addEventListener("beforeunload", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
});
