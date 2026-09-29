var DIGITAL_QC = {
  API_VERSION: 1,
  DEFAULT_MAX_BYTES: 20 * 1024 * 1024,
  MAX_REQUEST_BYTES: 30 * 1024 * 1024,
  DEFAULT_RATE_LIMIT_PER_MINUTE: 5,
  DEFAULT_USER_DAILY_FILE_LIMIT: 100,
  DEFAULT_USER_DAILY_BYTE_LIMIT: 500 * 1024 * 1024,
  DEFAULT_GLOBAL_DAILY_FILE_LIMIT: 1000,
  DEFAULT_GLOBAL_DAILY_BYTE_LIMIT: 10 * 1024 * 1024 * 1024,
  TIME_ZONE: "Asia/Ho_Chi_Minh",
  LOG_SHEET_NAME: "UPLOAD_LOG",
  ERROR_SHEET_NAME: "ERROR_LOG",
  ALLOWED_USERS_SHEET_NAME: "ALLOWED_USERS",
};

var ALLOWED_USER_COLUMNS = [
  "email",
  "role",
  "active",
  "daily_file_limit",
  "daily_byte_limit",
];

var LOG_COLUMNS = [
  "uploaded_at",
  "qc_no",
  "request_id",
  "product_key",
  "project",
  "po",
  "part_no",
  "lot_no",
  "supplier",
  "quantity",
  "unit",
  "slip_no",
  "received_date",
  "page_count",
  "size_bytes",
  "sha256",
  "file_id",
  "open_url",
  "download_url",
  "uploaded_by",
  "status",
  "qc_record_id",
];

function getConfig_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    driveFolderId: properties.getProperty("DRIVE_FOLDER_ID") || "",
    logSpreadsheetId: properties.getProperty("LOG_SPREADSHEET_ID") || "",
    logSheetName: properties.getProperty("LOG_SHEET_NAME") || DIGITAL_QC.LOG_SHEET_NAME,
    allowedUsersSheetId: properties.getProperty("ALLOWED_USERS_SHEET_ID") || properties.getProperty("LOG_SPREADSHEET_ID") || "",
    allowedUsersSheetName: properties.getProperty("ALLOWED_USERS_SHEET_NAME") || DIGITAL_QC.ALLOWED_USERS_SHEET_NAME,
    oauthClientId: properties.getProperty("OAUTH_CLIENT_ID") || "",
    workspaceDomain: (properties.getProperty("GOOGLE_WORKSPACE_DOMAIN") || "").trim().toLowerCase(),
    enforceAuth: (properties.getProperty("ENFORCE_AUTH") || "true").toLowerCase() === "true",
    requireSharedDrive: (properties.getProperty("REQUIRE_SHARED_DRIVE") || "true").toLowerCase() === "true",
    rateLimitPerMinute: positiveConfigNumber_(properties, "RATE_LIMIT_PER_MINUTE", DIGITAL_QC.DEFAULT_RATE_LIMIT_PER_MINUTE),
    globalDailyFileLimit: positiveConfigNumber_(properties, "GLOBAL_DAILY_FILE_LIMIT", DIGITAL_QC.DEFAULT_GLOBAL_DAILY_FILE_LIMIT),
    globalDailyByteLimit: positiveConfigNumber_(properties, "GLOBAL_DAILY_BYTE_LIMIT", DIGITAL_QC.DEFAULT_GLOBAL_DAILY_BYTE_LIMIT),
    maxBytes: positiveConfigNumber_(properties, "MAX_BYTES", DIGITAL_QC.DEFAULT_MAX_BYTES),
    maxRequestBytes: positiveConfigNumber_(properties, "MAX_REQUEST_BYTES", DIGITAL_QC.MAX_REQUEST_BYTES),
  };
}

function positiveConfigNumber_(properties, key, fallback) {
  var value = Number(properties.getProperty(key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
