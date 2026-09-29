function doPost(e) {
  try {
    var request = parseRequest_(e);
    if (request.api_version && Number(request.api_version) !== DIGITAL_QC.API_VERSION) {
      fail_("VERSION_MISMATCH", "Client API version is not supported.", false);
    }

    var caller = authenticate_(request.auth);
    var action = String(request.action || "");
    var data = request.data || {};

    if (action === "ping") return json_(ok_({ user: caller.email || "anonymous", role: caller.role || "anonymous", allowed: true }));
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
  var allowedSheet = spreadsheet.insertSheet(DIGITAL_QC.ALLOWED_USERS_SHEET_NAME);
  allowedSheet.appendRow(ALLOWED_USER_COLUMNS);
  allowedSheet.setFrozenRows(1);

  properties.setProperties({
    DRIVE_FOLDER_ID: folder.getId(),
    LOG_SPREADSHEET_ID: spreadsheet.getId(),
    LOG_SHEET_NAME: DIGITAL_QC.LOG_SHEET_NAME,
    ALLOWED_USERS_SHEET_ID: spreadsheet.getId(),
    ENFORCE_AUTH: "false",
    REQUIRE_SHARED_DRIVE: "true",
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

/** Creates the production allowlist sheet and optionally adds the first admin. */
function setupAccessControl(adminEmail) {
  var config = getConfig_();
  if (!config.allowedUsersSheetId) throw new Error("Configure LOG_SPREADSHEET_ID or ALLOWED_USERS_SHEET_ID first.");
  var spreadsheet = SpreadsheetApp.openById(config.allowedUsersSheetId);
  var sheet = spreadsheet.getSheetByName(config.allowedUsersSheetName) || spreadsheet.insertSheet(config.allowedUsersSheetName);
  ensureAllowedUserColumns_(sheet);
  var normalizedEmail = String(adminEmail || "").trim().toLowerCase();
  if (normalizedEmail) {
    var adminRow = [
      normalizedEmail,
      "admin",
      true,
      DIGITAL_QC.DEFAULT_USER_DAILY_FILE_LIMIT,
      DIGITAL_QC.DEFAULT_USER_DAILY_BYTE_LIMIT,
    ];
    var existingRow = findAllowedUserRow_(sheet, normalizedEmail);
    if (existingRow) {
      var existingAdmin = sheet.getRange(existingRow, 1, 1, ALLOWED_USER_COLUMNS.length).getValues()[0];
      adminRow[3] = positiveLimit_(existingAdmin[3], DIGITAL_QC.DEFAULT_USER_DAILY_FILE_LIMIT);
      adminRow[4] = positiveLimit_(existingAdmin[4], DIGITAL_QC.DEFAULT_USER_DAILY_BYTE_LIMIT);
      sheet.getRange(existingRow, 1, 1, ALLOWED_USER_COLUMNS.length).setValues([adminRow]);
    } else {
      sheet.appendRow(adminRow);
    }
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, ALLOWED_USER_COLUMNS.length);
  return { spreadsheetId: spreadsheet.getId(), sheetName: sheet.getName(), adminEmail: normalizedEmail };
}

/** Initializes the allowlist with the Drive account executing this function. */
function setupAccessControlForCurrentUser() {
  var about = Drive.About.get({ fields: "user(emailAddress)" });
  var email = String(about && about.user && about.user.emailAddress || "").trim().toLowerCase();
  if (!email) throw new Error("Could not determine the current Google account from Drive API.");
  var result = setupAccessControl(email);
  console.log(JSON.stringify(result));
  return result;
}

function parseRequest_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    fail_("INVALID_INPUT", "Request body is required.", false);
  }
  var config = getConfig_();
  var requestBytes = Number(event.postData.length || event.postData.contents.length || 0);
  if (requestBytes > config.maxRequestBytes) {
    fail_("REQUEST_TOO_LARGE", "Request exceeds the configured size limit.", false);
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
  if (!config.enforceAuth) {
    return {
      email: "",
      role: "admin",
      dailyFileLimit: DIGITAL_QC.DEFAULT_USER_DAILY_FILE_LIMIT,
      dailyByteLimit: DIGITAL_QC.DEFAULT_USER_DAILY_BYTE_LIMIT,
    };
  }
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
  if (["accounts.google.com", "https://accounts.google.com"].indexOf(String(token.iss || "")) < 0) {
    fail_("UNAUTHENTICATED", "Token issuer is invalid.", false);
  }
  if (Number(token.exp || 0) <= Math.floor(Date.now() / 1000)) fail_("UNAUTHENTICATED", "Google ID token has expired.", false);
  if (String(token.email_verified || "").toLowerCase() !== "true") fail_("UNAUTHENTICATED", "Google account email is not verified.", false);
  if (config.workspaceDomain && String(token.hd || "").trim().toLowerCase() !== config.workspaceDomain) {
    fail_("FORBIDDEN", "Google account is outside the configured Workspace domain.", false);
  }

  var email = String(token.email || "").trim().toLowerCase();
  var allowedUser = email ? getAllowedUser_(email, config) : null;
  if (!allowedUser) fail_("FORBIDDEN", "Google account is not allowed for Digital QC.", false);
  enforceRateLimit_(email, config.rateLimitPerMinute);
  return allowedUser;
}

function getAllowedUser_(email, config) {
  if (!config.allowedUsersSheetId) return null;
  var spreadsheet = SpreadsheetApp.openById(config.allowedUsersSheetId);
  var sheet = spreadsheet.getSheetByName(config.allowedUsersSheetName);
  if (!sheet) return null;
  ensureAllowedUserColumns_(sheet);
  return findAllowedUser_(sheet, email);
}

function ensureAllowedUserColumns_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ALLOWED_USER_COLUMNS);
    return;
  }
  var headers = sheet.getRange(1, 1, 1, ALLOWED_USER_COLUMNS.length).getValues()[0];
  ALLOWED_USER_COLUMNS.forEach(function (expected, index) {
    var actual = String(headers[index] || "").trim();
    if (!actual) {
      sheet.getRange(1, index + 1).setValue(expected);
      return;
    }
    if (actual !== expected) {
      fail_("SHEET_SCHEMA_MISMATCH", "ALLOWED_USERS column " + (index + 1) + " must be " + expected + ".", false);
    }
  });
}

function findAllowedUser_(sheet, email) {
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, ALLOWED_USER_COLUMNS.length).getValues();
  var normalizedEmail = String(email || "").trim().toLowerCase();
  for (var index = 0; index < rows.length; index += 1) {
    var row = rows[index];
    if (String(row[0] || "").trim().toLowerCase() !== normalizedEmail) continue;
    var active = row[2] === true || ["true", "1", "yes"].indexOf(String(row[2] || "").trim().toLowerCase()) >= 0;
    var role = String(row[1] || "").trim().toLowerCase();
    if (!active || ["admin", "uploader", "viewer"].indexOf(role) < 0) return null;
    return {
      email: normalizedEmail,
      role: role,
      dailyFileLimit: positiveLimit_(row[3], DIGITAL_QC.DEFAULT_USER_DAILY_FILE_LIMIT),
      dailyByteLimit: positiveLimit_(row[4], DIGITAL_QC.DEFAULT_USER_DAILY_BYTE_LIMIT),
    };
  }
  return null;
}

function findAllowedUserRow_(sheet, email) {
  if (sheet.getLastRow() < 2) return 0;
  var normalizedEmail = String(email || "").trim().toLowerCase();
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var index = 0; index < values.length; index += 1) {
    if (String(values[index][0] || "").trim().toLowerCase() === normalizedEmail) return index + 2;
  }
  return 0;
}

function positiveLimit_(value, fallback) {
  var parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function enforceRateLimit_(email, limit) {
  var normalizedLimit = positiveLimit_(limit, DIGITAL_QC.DEFAULT_RATE_LIMIT_PER_MINUTE);
  var minute = Utilities.formatDate(new Date(), "UTC", "yyyyMMddHHmm");
  var key = "rate:" + minute + ":" + String(email).toLowerCase();
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var cache = CacheService.getScriptCache();
    var count = Number(cache.get(key) || 0);
    if (count >= normalizedLimit) fail_("RATE_LIMITED", "Too many requests. Please wait one minute.", true);
    cache.put(key, String(count + 1), 90);
  } catch (error) {
    if (error && error.__digitalQc) throw error;
    fail_("LOCK_TIMEOUT", "Could not verify request rate.", true);
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function uploadQcPdf_(data, caller) {
  if (!caller || ["admin", "uploader"].indexOf(caller.role) < 0) {
    fail_("FORBIDDEN", "This account does not have upload permission.", false);
  }
  validateUploadData_(data);
  var config = getConfig_();
  var encodedPdf = String(data.pdf_base64);
  if (encodedPdf.length > Math.ceil(config.maxBytes / 3) * 4 + 8) {
    fail_("TOO_LARGE", "PDF exceeds the configured size limit.", false);
  }
  var bytes;
  try {
    bytes = Utilities.base64Decode(encodedPdf);
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
    if (duplicate) {
      var sameUpload = String(duplicate[3]) === String(data.product_key) && String(duplicate[15]).toLowerCase() === actualHash;
      var sameOwner = String(duplicate[19] || "").trim().toLowerCase() === String(caller.email || "").trim().toLowerCase();
      if (!sameUpload || (!sameOwner && caller.role !== "admin")) {
        fail_("REQUEST_ID_CONFLICT", "request_id is already used by another upload.", false);
      }
      return Object.assign(rowResult_(duplicate), { duplicate: true });
    }

    var uploadedAt = new Date();
    enforceDailyQuota_(sheet, caller, bytes.length, config, uploadedAt);
    validateStorageRoot_(config);
    var qcNo = nextQcNo_(sheet, uploadedAt);
    var fileName = qcNo + "-" + safeFileSegment_(data.part_no) + ".pdf";
    var folderId = getOrCreateUploadDateFolder_(config.driveFolderId, uploadedAt);
    createdFile = createPdfFile_(folderId, bytes, fileName);

    var row = [
      uploadedAt, qcNo, String(data.request_id), String(data.product_key), String(data.project), String(data.po), String(data.part_no),
      String(data.lot_no || "N/A"), String(data.supplier || ""), Number(data.quantity), String(data.unit || "PCS"), String(data.slip_no),
      String(data.received_date || ""), Number(data.page_count), bytes.length, actualHash, createdFile.id, createdFile.webViewLink || driveOpenUrl_(createdFile.id),
      createdFile.webContentLink || "", caller.email || "", "done",
      String(data.qc_record_id || ""),
    ];
    sheet.appendRow(row);
    return rowResult_(row);
  } catch (error) {
    if (createdFile) {
      try { Drive.Files.update({ trashed: true }, createdFile.id, null, { supportsAllDrives: true }); } catch (cleanupError) { logError_(cleanupError, data); }
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
  ensureLogColumns_(sheet);
  return sheet;
}

function ensureLogColumns_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOG_COLUMNS);
    return;
  }

  var width = Math.max(sheet.getLastColumn(), LOG_COLUMNS.length);
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  LOG_COLUMNS.forEach(function (expected, index) {
    var actual = String(headers[index] || "").trim();
    if (!actual) {
      sheet.getRange(1, index + 1).setValue(expected);
      return;
    }
    if (actual !== expected) {
      fail_("SHEET_SCHEMA_MISMATCH", "UPLOAD_LOG column " + (index + 1) + " must be " + expected + ".", false);
    }
  });
}

function findRequest_(sheet, requestId) {
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, LOG_COLUMNS.length).getValues();
  for (var index = 0; index < rows.length; index += 1) {
    if (String(rows[index][2]) === requestId) return rows[index];
  }
  return null;
}

function enforceDailyQuota_(sheet, caller, incomingBytes, config, uploadedAt) {
  var day = Utilities.formatDate(uploadedAt, DIGITAL_QC.TIME_ZONE, "yyyyMMdd");
  var userFiles = 0;
  var userBytes = 0;
  var globalFiles = 0;
  var globalBytes = 0;
  if (sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, LOG_COLUMNS.length).getValues();
    rows.forEach(function (row) {
      var rowDate = row[0] instanceof Date ? row[0] : new Date(row[0]);
      if (isNaN(rowDate.getTime()) || Utilities.formatDate(rowDate, DIGITAL_QC.TIME_ZONE, "yyyyMMdd") !== day) return;
      if (String(row[20] || "").toLowerCase() !== "done") return;
      var size = Math.max(0, Number(row[14]) || 0);
      globalFiles += 1;
      globalBytes += size;
      if (String(row[19] || "").trim().toLowerCase() === caller.email) {
        userFiles += 1;
        userBytes += size;
      }
    });
  }
  if (userFiles + 1 > caller.dailyFileLimit || userBytes + incomingBytes > caller.dailyByteLimit) {
    fail_("USER_DAILY_QUOTA", "Your daily upload quota has been reached.", true);
  }
  if (globalFiles + 1 > config.globalDailyFileLimit || globalBytes + incomingBytes > config.globalDailyByteLimit) {
    fail_("GLOBAL_DAILY_QUOTA", "The system daily upload quota has been reached.", true);
  }
}

function validateStorageRoot_(config) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "storage-root:" + config.driveFolderId + ":" + String(config.requireSharedDrive);
  if (cache.get(cacheKey) === "ok") return;
  var root = Drive.Files.get(config.driveFolderId, {
    supportsAllDrives: true,
    fields: "id,name,mimeType,driveId,capabilities(canAddChildren)",
  });
  if (root.mimeType !== "application/vnd.google-apps.folder") fail_("CONFIG_INVALID", "DRIVE_FOLDER_ID must reference a folder.", false);
  if (config.requireSharedDrive && !root.driveId) fail_("CONFIG_INVALID", "DRIVE_FOLDER_ID must be inside a Shared Drive.", false);
  if (root.capabilities && root.capabilities.canAddChildren === false) fail_("FORBIDDEN", "The deployment account cannot add files to the configured folder.", false);
  if (config.requireSharedDrive) {
    var permissions = Drive.Permissions.list(config.driveFolderId, {
      supportsAllDrives: true,
      fields: "permissions(type,role,emailAddress,domain,allowFileDiscovery)",
    }).permissions || [];
    var publicPermission = permissions.some(function (permission) {
      return permission.type === "anyone" || permission.type === "domain";
    });
    if (publicPermission) fail_("CONFIG_INVALID", "Shared Drive folder must use Restricted access without anyone/domain links.", false);
  }
  cache.put(cacheKey, "ok", 300);
}

function getOrCreateUploadDateFolder_(rootFolderId, uploadedAt) {
  var pathSegments = Utilities.formatDate(uploadedAt, DIGITAL_QC.TIME_ZONE, "yyyy/MM/dd").split("/");
  return pathSegments.reduce(function (parentId, folderName) {
    return findOrCreateFolder_(parentId, folderName);
  }, rootFolderId);
}

function findOrCreateFolder_(parentId, folderName) {
  var escapedName = String(folderName).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  var response = Drive.Files.list({
    q: "'" + parentId + "' in parents and name = '" + escapedName + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 10,
    fields: "files(id,name)",
  });
  if (response.files && response.files.length) return response.files[0].id;
  var folder = Drive.Files.create({
    name: String(folderName),
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  }, null, { supportsAllDrives: true, fields: "id" });
  return folder.id;
}

function createPdfFile_(folderId, bytes, fileName) {
  return Drive.Files.create({
    name: fileName,
    mimeType: MimeType.PDF,
    parents: [folderId],
  }, Utilities.newBlob(bytes, MimeType.PDF, fileName), {
    supportsAllDrives: true,
    fields: "id,name,webViewLink,webContentLink",
  });
}

function safeFileSegment_(value) {
  return String(value || "file").replace(/[\\/:*?\"<>|\x00-\x1f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 100) || "file";
}

function driveOpenUrl_(fileId) {
  return "https://drive.google.com/file/d/" + encodeURIComponent(fileId) + "/view";
}

function nextQcNo_(sheet, uploadedAt) {
  var datePart = Utilities.formatDate(uploadedAt || new Date(), DIGITAL_QC.TIME_ZONE, "yyMMdd");
  var prefix = "QC-" + datePart + "-";
  var highestSequence = 0;
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().forEach(function (row) {
      var value = String(row[0] || "");
      if (value.indexOf(prefix) !== 0) return;
      var sequence = Number(value.slice(prefix.length));
      if (Number.isInteger(sequence) && sequence > highestSequence) highestSequence = sequence;
    });
  }
  return prefix + String(highestSequence + 1).padStart(4, "0");
}

function rowResult_(row) {
  return {
    uploaded_at: row[0], qc_no: row[1], request_id: row[2], product_key: row[3],
    project: row[4], po: row[5], part_no: row[6], lot_no: row[7], supplier: row[8],
    quantity: row[9], unit: row[10], slip_no: row[11], received_date: row[12], page_count: row[13],
    size_bytes: row[14], sha256: row[15], file_name: row[1] + "-" + safeFileSegment_(row[6]) + ".pdf", file_id: row[16],
    open_url: row[17], download_url: row[18], uploaded_by: row[19], status: row[20], qc_record_id: row[21] || "", duplicate: false,
  };
}

function verifyStorageConfiguration() {
  var config = getConfig_();
  if (!config.driveFolderId) throw new Error("DRIVE_FOLDER_ID is not configured.");
  CacheService.getScriptCache().remove("storage-root:" + config.driveFolderId + ":" + String(config.requireSharedDrive));
  validateStorageRoot_(config);
  var root = Drive.Files.get(config.driveFolderId, {
    supportsAllDrives: true,
    fields: "id,name,driveId,mimeType,capabilities(canAddChildren)",
  });
  var result = {
    valid: true,
    folderId: root.id,
    folderName: root.name,
    sharedDriveId: root.driveId || "",
    canAddChildren: !root.capabilities || root.capabilities.canAddChildren !== false,
    requireSharedDrive: config.requireSharedDrive,
  };
  console.log(JSON.stringify(result));
  return result;
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
