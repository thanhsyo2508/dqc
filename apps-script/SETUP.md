# Tạo Apps Script server để test Digital QC

Thư mục này là một Apps Script **standalone project**. App desktop gọi URL Web App của project bằng các action:

- `ping` — kiểm tra endpoint.
- `upload_qc_pdf` — lưu một PDF vào Drive và metadata vào Sheet.

## 1. Đăng nhập clasp

Mở PowerShell tại thư mục gốc repo:

```powershell
clasp login
```

Trình duyệt sẽ mở để bạn cấp quyền cho clasp. Chỉ cần làm một lần trên máy phát triển.

Kiểm tra clasp:

```powershell
clasp --version
```

## 2. Tạo project Google Apps Script

Chạy trong thư mục `apps-script`:

```powershell
cd apps-script
clasp create --type standalone --title "Digital QC - Test Server"
```

Sau lệnh này clasp tạo `.clasp.json` có `scriptId`. File này đã được bỏ qua bởi Git vì mỗi máy/môi trường có thể dùng project khác nhau.

`clasp create` có thể tải manifest mặc định và thay đổi `appsscript.json` local. Hãy giữ lại manifest của repo với múi giờ `Asia/Ho_Chi_Minh` và các scope Drive/Sheets trước khi `clasp push`; nếu không, số QC và thời gian ghi log có thể bị lệch.

Nếu muốn tạo project trong một thư mục Drive cụ thể, dùng thêm `--parentId FOLDER_ID`.

## 3. Push source lên Google

```powershell
clasp push
clasp open-script
```

Trong Apps Script editor, chọn hàm `setupTestEnvironment` rồi bấm **Run** một lần. Hàm này sẽ tự tạo:

- thư mục Drive `Digital QC - Test Files`;
- spreadsheet `Digital QC - Test Upload Log`;
- sheet `UPLOAD_LOG` với dòng tiêu đề;
- Script Properties cho `DRIVE_FOLDER_ID`, `LOG_SPREADSHEET_ID`, `ENFORCE_AUTH=false`.

Hàm này chỉ dành cho project test. Không chạy trong project production nếu chưa kiểm tra lại tài khoản Drive và spreadsheet đích.

Sau khi chạy, kiểm tra mục **Project Settings → Script properties**. Không đưa các giá trị này vào Git.

## 4. Deploy Web App

Trong Apps Script editor:

1. **Deploy → New deployment**.
2. Chọn loại **Web app**.
3. **Execute as:** `Me` (chủ project).
4. **Who has access:** chọn phạm vi phù hợp môi trường test, thường là `Anyone` hoặc tài khoản trong domain.
5. Bấm **Deploy** và copy URL kết thúc bằng `/exec`.

URL đúng có dạng:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

Không dùng URL editor dạng `https://script.google.com/d/SCRIPT_ID/edit` và không để nguyên chữ `DEPLOYMENT_ID`.

Có thể deploy bằng clasp sau khi đã tạo deployment đầu tiên:

```powershell
clasp deploy --description "Digital QC test server"
clasp deployments
```

Sau mọi thay đổi source:

```powershell
clasp push
```

Nếu dùng deployment có sẵn, cần tạo version/deployment mới trong Apps Script để URL `/exec` chạy code mới.

## 5. Test endpoint trước khi nối app

Từ thư mục `apps-script`:

```powershell
.\test-webapp.ps1 -Endpoint "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" -Mode all
```

Script sẽ lần lượt kiểm tra ping, upload, trùng `request_id` và các lỗi validation. Kết quả upload phải xuất hiện trong thư mục Drive và dòng `UPLOAD_LOG`.

Các mode kiểm tra mở rộng:

```powershell
.\test-webapp.ps1 -Endpoint "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" -Mode duplicate
.\test-webapp.ps1 -Endpoint "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" -Mode validation
.\test-webapp.ps1 -Endpoint "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" -Mode concurrency
.\test-webapp.ps1 -Endpoint "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" -Mode near-limit
```

`near-limit` tạo và upload file khoảng 19 MiB nên chỉ chạy khi chấp nhận dùng quota Drive test. Lỗi ghi Drive/Sheet cần kiểm tra bằng một project/folder/sheet test có ID sai hoặc quyền bị thu hồi; không cố tình chạy trên production.

Sau đó mở app Digital QC, bấm cấu hình server trên topbar, dán đúng URL `/exec`, bấm **Kiểm tra kết nối**, rồi mới thử gửi hồ sơ thật.

## 6. Xử lý lỗi thường gặp

- `CONFIG_MISSING`: chưa chạy `setupTestEnvironment` hoặc Script Properties sai ID.
- `403` khi deploy: tài khoản chạy Web App chưa có quyền tạo file trong Drive/Sheet.
- `ping` thành công nhưng upload lỗi: kiểm tra quota Drive, kích thước PDF và log `ERROR_LOG`.
- Code mới chưa chạy: `clasp push` chỉ cập nhật source; hãy tạo version/deployment mới hoặc cập nhật deployment hiện có.
- Không dùng URL `/dev` trong app desktop; `/dev` chỉ dành cho chủ project và thử nhanh trong editor.

## 7. Bật xác thực sau khi test contract

Hiện test server dùng `ENFORCE_AUTH=false`. Chỉ bật xác thực sau khi đã có OAuth client và danh sách email:

```text
ENFORCE_AUTH=true
OAUTH_CLIENT_ID=...
ALLOWED_USERS_SHEET_ID=...
ALLOWED_USERS_SHEET_NAME=ALLOWED_USERS
```

Sheet `ALLOWED_USERS` cần có email ở cột A, bắt đầu từ dòng 2. Client Tauri chưa có OAuth PKCE và kho token hệ điều hành, vì vậy chưa được phép bật `ENFORCE_AUTH=true` trên endpoint mà app đang dùng. Đây là điều kiện bắt buộc trước production.
