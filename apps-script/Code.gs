function doPost(e) {
  try {
    var request = parseRequest_(e);
    if (request.api_version && Number(request.api_version) !== DIGITAL_QC.API_VERSION) {
      fail_("VERSION_MISMATCH", "Client API version is not supported.", false);
    }

    var caller = authenticate_(request.auth);
    var action = String(request.action || "");
    var data = request.data || {};

    if (action === "ping") return json_(ok_({ user: caller || "anonymous", allowed: true }));
    if (action === "upload_qc_pdf") return json_(ok_(uploadQcPdf_(data, caller)));
    fail_("INVALID_INPUT", "Unknown action.", false);
  } catch (error) {
    return json_(errorResponse_(error));
  }
}

/**
 * Tạo nhanh tài nguyên cho một Apps Script project test mới.
 * Chỉ chạy thủ công từ Apps Script editor, không gọi qua Web App.
 * Không dùng hàm này cho production vì nó tạo thư mục và spreadsheet mới.
 */
function setupTestEnvironment() {
  var properties = PropertiesService.getScriptProperties();
  var current = getConfig_();
  if (current.driveFolderId && current.logSpreadsheetId) {
    return {
      reused: true,
      driveFolderId: current.driveFolderId,
      logSpreadsheetId: current.logSpreadsheetId,
      logSheetName: current.logSheetName,
    };
  }

  var folder = DriveApp.createFolder("Digital QC - Test Files");
  var spreadsheet = SpreadsheetApp.create("Digital QC - Test Upload Log");
  var sheet = spreadsheet.getSheets()[0];
  sheet.setName(DIGITAL_QC.LOG_SHEET_NAME);
  sheet.appendRow(LOG_COLUMNS);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, LOG_COLUMNS.length);

  properties.setProperties({
    DRIVE_FOLDER_ID: folder.getId(),
    LOG_SPREADSHEET_ID: spreadsheet.getId(),
    LOG_SHEET_NAME: DIGITAL_QC.LOG_SHEET_NAME,
    ENFORCE_AUTH: "false",
    MAX_BYTES: String(DIGITAL_QC.DEFAULT_MAX_BYTES),
  }, true);

  return {
    reused: false,
    driveFolderId: folder.getId(),
    logSpreadsheetId: spreadsheet.getId(),
    logSheetName: DIGITAL_QC.LOG_SHEET_NAME,
    spreadsheetUrl: spreadsheet.getUrl(),
    folderUrl: folder.getUrl(),
  };
}

function parseRequest_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    fail_("INVALID_INPUT", "Request body is required.", false);
  }
  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    fail_("INVALID_INPUT", "Request body must be valid JSON.", false);
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return Object.assign({ success: true, api_version: DIGITAL_QC.API_VERSION }, data || {});
}

function errorResponse_(error) {
  var known = error && error.__digitalQc;
  return {
    success: false,
    api_version: DIGITAL_QC.API_VERSION,
    code: known ? error.code : "INTERNAL",
    message: known ? error.message : String(error && error.message || error),
    retryable: known ? Boolean(error.retryable) : true,
  };
}

function fail_(code, message, retryable) {
  throw { __digitalQc: true, code: code, message: message, retryable: retryable };
}

function authenticate_(auth) {
  var config = getConfig_();
  if (!config.enforceAuth) return "";
  if (!auth || !auth.id_token) fail_("UNAUTHENTICATED", "Google ID token is required.", false);
  if (!config.oauthClientId) fail_("CONFIG_MISSING", "OAUTH_CLIENT_ID is not configured.", false);

  var response;
  try {
    response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(auth.id_token), {
      muteHttpExceptions: true,
    });
  } catch (error) {
    fail_("AUTH_PROVIDER_UNAVAILABLE", "Could not verify Google ID token.", true);
  }

  if (response.getResponseCode() !== 200) fail_("UNAUTHENTICATED", "Google ID token is invalid or expired.", false);
  var token = JSON.parse(response.getContentText());
  if (String(token.aud || "") !== config.oauthClientId) fail_("UNAUTHENTICATED", "Token audience does not match this app.", false);
  if (Number(token.exp || 0) <= Math.floor(Date.now() / 1000)) fail_("UNAUTHENTICATED", "Google ID token has expired.", false);
  if (String(token.email_verified || "").toLowerCase() !== "true") fail_("UNAUTHENTICATED", "Google account email is not verified.", false);

  var email = String(token.email || "").trim().toLowerCase();
  if (!email || !isAllowedUser_(email, config)) fail_("FORBIDDEN", "Google account is not allowed for Digital QC.", false);
  return email;
}

function isAllowedUser_(email, config) {
  if (!config.allowedUsersSheetId) return false;
  var spreadsheet = SpreadsheetApp.openById(config.allowedUsersSheetId);
  var sheet = spreadsheet.getSheetByName(config.allowedUsersSheetName);
  if (!sheet || sheet.getLastRow() < 2) return false;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  return values.some(function (row) { return String(row[0] || "").trim().toLowerCase() === email; });
}

function uploadQcPdf_(data, uploadedBy) {
  validateUploadData_(data);
  var config = getConfig_();
  var bytes;
  try {
    bytes = Utilities.base64Decode(String(data.pdf_base64));
  } catch (error) {
    fail_("INVALID_INPUT", "pdf_base64 is not valid base64.", false);
  }

  if (!bytes || bytes.length === 0) fail_("INVALID_INPUT", "PDF content is empty.", false);
  if (bytes.length > config.maxBytes) fail_("TOO_LARGE", "PDF exceeds the configured size limit.", false);
  if (!isPdf_(bytes)) fail_("NOT_A_PDF", "PDF signature %PDF- is missing.", false);

  var actualHash = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
  if (actualHash !== String(data.sha256).toLowerCase()) fail_("HASH_MISMATCH", "PDF SHA-256 does not match.", true);
  if (!config.driveFolderId || !config.logSpreadsheetId) fail_("CONFIG_MISSING", "Drive folder or log spreadsheet is not configured.", false);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (error) {
    fail_("LOCK_TIMEOUT", "Could not lock upload sequence.", true);
  }

  var createdFile = null;
  try {
    var sheet = getLogSheet_(config);
    var duplicate = findRequest_(sheet, String(data.request_id));
    if (duplicate) return Object.assign(rowResult_(duplicate), { duplicate: true });

    var qcNo = nextQcNo_(sheet);
    var fileName = qcNo + "-" + String(data.part_no) + ".pdf";
    var folder = DriveApp.getFolderById(config.driveFolderId);
    createdFile = folder.createFile(Utilities.newBlob(bytes, MimeType.PDF, fileName));

    var row = [
      new Date(), qcNo, String(data.request_id), String(data.product_key), String(data.project), String(data.po), String(data.part_no),
      String(data.lot_no || "N/A"), String(data.supplier || ""), Number(data.quantity), String(data.unit || "PCS"), String(data.slip_no),
      String(data.received_date || ""), Number(data.page_count), bytes.length, actualHash, createdFile.getId(), createdFile.getUrl(),
      safeDownloadUrl_(createdFile), uploadedBy || "", "done",
    ];
    sheet.appendRow(row);
    return rowResult_(row);
  } catch (error) {
    if (createdFile) {
      try { createdFile.setTrashed(true); } catch (cleanupError) { logError_(cleanupError, data); }
    }
    if (error && error.__digitalQc) throw error;
    fail_("DRIVE_OR_SHEET_FAILED", String(error && error.message || error), true);
  } finally {
    lock.releaseLock();
  }
}

function validateUploadData_(data) {
  ["request_id", "product_key", "project", "po", "part_no", "slip_no", "sha256", "pdf_base64"].forEach(function (key) {
    if (data[key] === undefined || data[key] === null || String(data[key]).trim() === "") fail_("INVALID_INPUT", key + " is required.", false);
  });
  if (!Number.isFinite(Number(data.quantity)) || Number(data.quantity) <= 0) fail_("INVALID_INPUT", "quantity must be greater than zero.", false);
  if (!Number.isFinite(Number(data.page_count)) || Number(data.page_count) < 1) fail_("INVALID_INPUT", "page_count must be positive.", false);
  if (!/^[a-f0-9]{64}$/i.test(String(data.sha256))) fail_("INVALID_INPUT", "sha256 must be a 64-character hex string.", false);
}

function isPdf_(bytes) {
  var signature = [37, 80, 68, 70, 45];
  return signature.every(function (value, index) { return bytes[index] === value; });
}

function hex_(bytes) {
  return bytes.map(function (value) { return (value + 256).toString(16).slice(-2); }).join("");
}

function getLogSheet_(config) {
  var spreadsheet = SpreadsheetApp.openById(config.logSpreadsheetId);
  var sheet = spreadsheet.getSheetByName(config.logSheetName) || spreadsheet.insertSheet(config.logSheetName);
  if (sheet.getLastRow() === 0) sheet.appendRow(LOG_COLUMNS);
  return sheet;
}

function findRequest_(sheet, requestId) {
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, LOG_COLUMNS.length).getValues();
  for (var index = 0; index < rows.length; index += 1) {
    if (String(rows[index][2]) === requestId) return rows[index];
  }
  return null;
}

function nextQcNo_(sheet) {
  var datePart = Utilities.formatDate(new Date(), DIGITAL_QC.TIME_ZONE, "yyMMdd");
  var prefix = "QC-" + datePart + "-";
  var count = 0;
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().forEach(function (row) {
      if (String(row[0]).indexOf(prefix) === 0) count += 1;
    });
  }
  return prefix + String(count + 1).padStart(4, "0");
}

function rowResult_(row) {
  return {
    uploaded_at: row[0], qc_no: row[1], request_id: row[2], product_key: row[3],
    project: row[4], po: row[5], part_no: row[6], lot_no: row[7], supplier: row[8],
    quantity: row[9], unit: row[10], slip_no: row[11], received_date: row[12], page_count: row[13],
    size_bytes: row[14], sha256: row[15], file_name: row[1] + "-" + row[6] + ".pdf", file_id: row[16],
    open_url: row[17], download_url: row[18], uploaded_by: row[19], status: row[20], duplicate: false,
  };
}

function safeDownloadUrl_(file) {
  try { return file.getDownloadUrl(); } catch (error) { return ""; }
}

function logError_(error, data) {
  try {
    var config = getConfig_();
    if (!config.logSpreadsheetId) return;
    var spreadsheet = SpreadsheetApp.openById(config.logSpreadsheetId);
    var sheet = spreadsheet.getSheetByName(DIGITAL_QC.ERROR_SHEET_NAME) || spreadsheet.insertSheet(DIGITAL_QC.ERROR_SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(["at", "message", "request_id", "product_key"]);
    sheet.appendRow([new Date(), String(error && error.message || error), data && data.request_id || "", data && data.product_key || ""]);
  } catch (ignored) {
    // Error logging must never hide the original upload failure.
  }
}
