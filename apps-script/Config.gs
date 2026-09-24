var DIGITAL_QC = {
  API_VERSION: 1,
  DEFAULT_MAX_BYTES: 20 * 1024 * 1024,
  TIME_ZONE: "Asia/Ho_Chi_Minh",
  LOG_SHEET_NAME: "UPLOAD_LOG",
  ERROR_SHEET_NAME: "ERROR_LOG",
  ALLOWED_USERS_SHEET_NAME: "ALLOWED_USERS",
};

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
];

function getConfig_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    driveFolderId: properties.getProperty("DRIVE_FOLDER_ID") || "",
    logSpreadsheetId: properties.getProperty("LOG_SPREADSHEET_ID") || "",
    logSheetName: properties.getProperty("LOG_SHEET_NAME") || DIGITAL_QC.LOG_SHEET_NAME,
    allowedUsersSheetId: properties.getProperty("ALLOWED_USERS_SHEET_ID") || "",
    allowedUsersSheetName: properties.getProperty("ALLOWED_USERS_SHEET_NAME") || DIGITAL_QC.ALLOWED_USERS_SHEET_NAME,
    oauthClientId: properties.getProperty("OAUTH_CLIENT_ID") || "",
    enforceAuth: (properties.getProperty("ENFORCE_AUTH") || "false").toLowerCase() === "true",
    maxBytes: Number(properties.getProperty("MAX_BYTES") || DIGITAL_QC.DEFAULT_MAX_BYTES),
  };
}
