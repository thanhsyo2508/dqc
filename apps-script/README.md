# Digital QC Apps Script

Backend nhận đúng PDF đã preview từ ứng dụng desktop, xác thực tài khoản Google, lưu file vào Shared Drive theo `YYYY/MM/DD` và ghi chỉ mục vào `UPLOAD_LOG`.

Hướng dẫn cấu hình production đầy đủ nằm trong [SETUP.md](./SETUP.md).

## Bảo mật đang áp dụng

- Mặc định `ENFORCE_AUTH=true`; mọi `ping` và upload phải có Google ID token hợp lệ.
- Token phải đúng `OAUTH_CLIENT_ID`, còn hạn, có email đã xác minh và đúng `GOOGLE_WORKSPACE_DOMAIN` nếu được cấu hình.
- Email phải có trong sheet `ALLOWED_USERS` và đang hoạt động.
- Vai trò `admin` và `uploader` được upload; `viewer` chỉ xác thực/ping.
- Giới hạn request/phút, số file/ngày và byte/ngày được kiểm tra trước khi ghi Drive.
- `request_id` trùng chỉ được trả lại cho chính người upload hoặc `admin`.
- Mặc định `REQUIRE_SHARED_DRIVE=true`; thư mục có quyền `anyone` hoặc `domain` bị từ chối.
- PDF được kiểm tra kích thước, chữ ký `%PDF-` và SHA-256.

## Sheet `ALLOWED_USERS`

| email | role | active | daily_file_limit | daily_byte_limit |
|---|---|---:|---:|---:|
| `admin@company.com` | `admin` | `TRUE` | `200` | `1073741824` |
| `qc@company.com` | `uploader` | `TRUE` | `100` | `524288000` |
| `viewer@company.com` | `viewer` | `TRUE` | `10` | `10485760` |

`daily_file_limit` và `daily_byte_limit` trống hoặc không hợp lệ sẽ dùng mặc định trong `Config.gs`.

## Script Properties

Bắt buộc cho production:

- `DRIVE_FOLDER_ID`: ID thư mục gốc bên trong Shared Drive Restricted.
- `LOG_SPREADSHEET_ID`: spreadsheet chứa `UPLOAD_LOG`.
- `ALLOWED_USERS_SHEET_ID`: spreadsheet chứa `ALLOWED_USERS`; có thể dùng cùng ID với log.
- `OAUTH_CLIENT_ID`: OAuth 2.0 Desktop Client ID dùng bởi ứng dụng Tauri.
- `ENFORCE_AUTH=true`.
- `REQUIRE_SHARED_DRIVE=true`.

Khuyến nghị:

- `GOOGLE_WORKSPACE_DOMAIN=company.com`.
- `RATE_LIMIT_PER_MINUTE=5`.
- `MAX_BYTES=20971520`.
- `MAX_REQUEST_BYTES=31457280`.
- `GLOBAL_DAILY_FILE_LIMIT=1000`.
- `GLOBAL_DAILY_BYTE_LIMIT=10737418240`.

Không commit Script Properties, token hoặc thông tin production vào repository.

## Lưu ý vận hành

Web App vẫn cần nhận request từ ứng dụng native, vì vậy lớp transport có thể được deploy ở chế độ `Anyone`; quyền nghiệp vụ không phải anonymous: `doPost` luôn xác minh ID token và allowlist. Rate limit trong Apps Script giúp chặn lạm dụng theo tài khoản nhưng không thay thế WAF/DDoS protection ở biên mạng. Nếu hệ thống mở ra Internet hoặc tải lớn, nên chuyển API trước Apps Script sang Cloud Run/API Gateway + Cloud Armor.
