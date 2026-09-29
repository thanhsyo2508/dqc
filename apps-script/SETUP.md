# Triển khai Digital QC với Google OAuth và Shared Drive

Ứng dụng dùng OAuth 2.0 Authorization Code + PKCE, mở trang đăng nhập trong trình duyệt hệ thống. Refresh token chỉ được lưu trong Windows Credential Manager. Apps Script xác minh ID token lần nữa trước mọi thao tác.

## 1. Tạo Shared Drive Restricted

1. Trong Google Workspace, tạo Shared Drive riêng cho Digital QC.
2. Chỉ thêm người dùng hoặc Google Group cần thiết; không bật `Anyone with the link` và không cấp quyền rộng cho toàn domain.
3. Tạo thư mục gốc, ví dụ `Digital QC/PDF`, rồi lấy ID thư mục từ URL.
4. Tài khoản sở hữu deployment Apps Script cần tối thiểu quyền cho phép tạo file/thư mục. Nhân viên chỉ cần xem PDF có thể là Viewer.
5. Spreadsheet log nên nằm trong cùng Shared Drive hoặc khu vực Restricted tương đương.

Script dùng Advanced Drive service v3 và tự tạo cây `YYYY/MM/DD` dưới thư mục gốc. Hàm `verifyStorageConfiguration()` sẽ từ chối thư mục My Drive khi `REQUIRE_SHARED_DRIVE=true`, đồng thời từ chối quyền `anyone` hoặc `domain`.

## 2. Tạo OAuth Desktop Client

Trong Google Cloud Console:

1. Chọn/tạo project thuộc Google Workspace của công ty.
2. Cấu hình OAuth consent screen; với ứng dụng nội bộ nên chọn audience `Internal`.
3. Tạo OAuth Client loại `Desktop app`.
4. Copy Client ID có dạng `...apps.googleusercontent.com`.
5. Không cần và không được nhúng client secret vào ứng dụng desktop.

Tạo file `.env.local` ở thư mục gốc (file này đã được Git bỏ qua):

```dotenv
VITE_GOOGLE_OAUTH_CLIENT_ID=000000000000-xxxxxxxx.apps.googleusercontent.com
```

Có thể copy từ `.env.example`. Build lại ứng dụng sau khi đổi Client ID.

## 3. Push Apps Script

```powershell
clasp login
cd apps-script
clasp create --type standalone --title "Digital QC Production"
clasp push
clasp open-script
```

Manifest đã bật Advanced Drive service v3. Nếu Google Cloud project liên kết yêu cầu, hãy bật thêm Google Drive API trong Cloud Console.

## 4. Cấu hình Script Properties

Trong `Project Settings → Script properties`, thêm:

```text
DRIVE_FOLDER_ID=<ID thư mục trong Shared Drive>
LOG_SPREADSHEET_ID=<ID spreadsheet log>
ALLOWED_USERS_SHEET_ID=<ID spreadsheet allowlist>
ALLOWED_USERS_SHEET_NAME=ALLOWED_USERS
OAUTH_CLIENT_ID=<cùng Desktop Client ID với VITE_GOOGLE_OAUTH_CLIENT_ID>
GOOGLE_WORKSPACE_DOMAIN=company.com
ENFORCE_AUTH=true
REQUIRE_SHARED_DRIVE=true
RATE_LIMIT_PER_MINUTE=5
MAX_BYTES=20971520
MAX_REQUEST_BYTES=31457280
GLOBAL_DAILY_FILE_LIMIT=1000
GLOBAL_DAILY_BYTE_LIMIT=10737418240
```

`GOOGLE_WORKSPACE_DOMAIN` có thể bỏ trống nếu cho phép tài khoản ngoài domain nhưng vẫn bắt buộc phải có trong allowlist.

## 5. Khởi tạo allowlist và kiểm tra Drive

Từ PowerShell trong thư mục `apps-script`, chạy bằng tài khoản quản trị đã đăng nhập với `clasp`:

```powershell
clasp run setupAccessControlForCurrentUser
```

Hàm lấy email từ Drive API, tạo/kiểm tra sheet `ALLOWED_USERS` và thêm quản trị viên đầu tiên. Execution API trong manifest dùng `MYSELF`, nên chỉ tài khoản `clasp` của bạn được gọi. Sau đó chỉnh các dòng theo schema:

| Cột | Giá trị |
|---|---|
| `email` | email viết thường |
| `role` | `admin`, `uploader` hoặc `viewer` |
| `active` | `TRUE` để cho phép |
| `daily_file_limit` | số file tối đa/ngày của tài khoản |
| `daily_byte_limit` | tổng byte tối đa/ngày của tài khoản |

Chạy tiếp:

```javascript
verifyStorageConfiguration()
```

Kết quả phải có `valid: true`, `sharedDriveId` khác rỗng và `canAddChildren: true`.

## 6. Deploy Web App

1. `Deploy → New deployment → Web app`.
2. `Execute as`: tài khoản triển khai.
3. Chọn phạm vi truy cập cho phép app native gọi endpoint. Nếu phải chọn `Anyone`, lớp nghiệp vụ vẫn bắt buộc token vì `ENFORCE_AUTH=true`.
4. Copy URL kết thúc bằng `/exec`.

Ứng dụng chỉ chấp nhận URL dạng:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Mỗi lần cập nhật source phải `clasp push` và cập nhật version/deployment để `/exec` chạy code mới.

## 7. Nghiệm thu

1. Build/chạy Tauri; màn hình đăng nhập phải chặn toàn bộ workspace.
2. Đăng nhập bằng tài khoản không có trong allowlist: `FORBIDDEN`.
3. Đăng nhập bằng `viewer`: ping thành công nhưng upload bị từ chối.
4. Đăng nhập bằng `uploader`: upload thành công, file nằm đúng `YYYY/MM/DD`, log có `uploaded_by`.
5. Hạ `daily_file_limit` xuống `1`, upload lần hai phải trả `USER_DAILY_QUOTA`.
6. Gửi quá nhanh phải trả `RATE_LIMITED`.
7. Bật link `Anyone` hoặc dùng thư mục My Drive, `verifyStorageConfiguration()` phải thất bại.
8. Đăng xuất, upload/retry outbox phải yêu cầu đăng nhập lại.

Với project test riêng, có thể chạy `setupTestEnvironment()`; hàm này cố ý đặt `ENFORCE_AUTH=false` và `REQUIRE_SHARED_DRIVE=false`. Tuyệt đối không dùng cấu hình test cho production.

Kiểm tra endpoint test không bật auth:

```powershell
.\test-webapp.ps1 -Endpoint "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" -Mode all
```

Nếu endpoint bật auth, truyền ID token ngắn hạn:

```powershell
.\test-webapp.ps1 -Endpoint "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" -Mode ping -IdToken "<ID_TOKEN>"
```

## 8. Giới hạn bảo mật cần biết

- OAuth Client ID không phải secret; bảo mật dựa trên PKCE, token Google, kiểm tra audience/domain/allowlist và quyền Drive.
- ID token ngắn hạn chỉ nằm trong RAM; refresh token nằm trong Windows Credential Manager.
- Rate limit dùng Apps Script Cache + Lock và quota ngày dùng `UPLOAD_LOG`. Đây là lớp chống lạm dụng nghiệp vụ, không phải hệ thống chống DDoS ở tầng mạng.
- Shared Drive Restricted bảo vệ file ngay cả khi URL/QR bị lộ; người quét vẫn phải đăng nhập tài khoản được cấp quyền Drive.
- Quản trị viên Workspace vẫn cần tự tạo Shared Drive, OAuth client và cấp quyền thật; source code không thể tự cấp các quyền tổ chức này.
