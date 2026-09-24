# Digital QC Apps Script

Bộ khung server cho hợp đồng API của Digital QC. Server xử lý từng hồ sơ sản phẩm độc lập:

`PDF bytes + product metadata → một file Drive + một dòng UPLOAD_LOG`

## Script Properties bắt buộc

Trong Apps Script, mở `Project Settings → Script properties` và thêm:

- `DRIVE_FOLDER_ID`: thư mục Drive dùng để lưu PDF.
- `LOG_SPREADSHEET_ID`: spreadsheet chứa `UPLOAD_LOG`.

## Xác thực

Mặc định `ENFORCE_AUTH=false` để có thể kiểm tra contract ở môi trường thử nghiệm. Trước khi dùng thật:

- đặt `ENFORCE_AUTH=true`;
- đặt `OAUTH_CLIENT_ID` đúng OAuth client của ứng dụng;
- đặt `ALLOWED_USERS_SHEET_ID` tới spreadsheet có sheet `ALLOWED_USERS`, email nằm ở cột A từ dòng 2;
- chia sẻ thư mục Drive và spreadsheet cho tài khoản thực thi Web App.

Không commit các giá trị Script Properties, token hoặc ID môi trường production vào repository nếu repository được chia sẻ.

## Deploy thử nghiệm

1. Tạo một Apps Script project riêng cho môi trường thử nghiệm.
2. Chép `Code.gs`, `Config.gs` và `appsscript.json` vào project.
3. Cấu hình Script Properties bằng thư mục Drive và spreadsheet thử nghiệm.
4. Deploy `Web app`, execute as chủ sở hữu project.
5. Dùng URL `/exec` cho bước kiểm tra `ping` và upload một PDF nhỏ.

`Code.gs` không sinh PDF và không ghép PDF. Client phải gửi đúng bytes PDF đã preview. `request_id` được dùng để chống tạo file trùng khi retry.
