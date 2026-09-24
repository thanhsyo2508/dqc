# Digital QC — Error Report

Ngày kiểm tra: 24/09/2026

## Phạm vi kiểm tra

- TypeScript compile và unit/integration test.
- Vite production build.
- Rust format/check.
- Cú pháp PowerShell test helper.
- Rà soát luồng PDF, upload, Tauri Outbox và khởi động lại ứng dụng.

## Kết quả baseline

| ID | Mức độ | Phát hiện | Trạng thái ban đầu |
| --- | --- | --- | --- |
| DQC-ERR-001 | Cao | Rust HTTP client không có timeout; mạng treo có thể làm nút gửi giữ trạng thái vô hạn. | Đã sửa |
| DQC-ERR-002 | Trung bình | Outbox gửi thêm trường `qc` đầy đủ lên server dù server chỉ cần product metadata; làm request lớn hơn cần thiết. | Đã sửa |
| DQC-ERR-003 | Trung bình | Client giả định response luôn là JSON; endpoint sai/404 hoặc HTML redirect lỗi sẽ hiện lỗi parse khó hiểu. | Đã sửa |
| DQC-ERR-004 | Cao | PDF nhúng riêng subset Vietnamese; chữ Latin/tiêu đề hiển thị thành ô vuông trên trình đọc PDF. | Đã sửa |
| DQC-ERR-005 | Trung bình | Sau upload thành công, card vẫn còn trong danh sách `Thông tin sản phẩm`, dễ khiến người dùng gửi lại hoặc sửa nhầm hồ sơ đã hoàn tất. | Đã sửa |
| DQC-WARN-004 | Thấp | Vite cảnh báo bundle JavaScript lớn hơn 500 kB. Không làm build thất bại nhưng nên code-split trước khi phát hành. | Theo dõi |
| DQC-WARN-005 | Ngoài môi trường | Chưa render PNG để kiểm tra trực quan vì máy hiện tại không có `pdftoppm`/Poppler. | Chưa xác nhận |
| DQC-WARN-006 | Ngoài môi trường | Chưa test OAuth production và máy in Zebra/Brother/Godex vì thiếu Client ID, tài khoản và thiết bị thật. | Chưa xác nhận |

## Kiểm tra đã đạt

- `npm run build`: đạt.
- `npm test -- --run`: 14/14 đạt.
- `npm run build:ui`: đạt; chỉ còn cảnh báo kích thước bundle.
- `cargo fmt -- --check` và `cargo check`: đạt.
- `cargo test`: 2/2 Rust unit test đạt.
- PowerShell test helper: cú pháp đạt.
- Web App test thật: ping, upload, duplicate `request_id`, sai SHA-256, PDF hỏng, concurrency và PDF gần 20 MiB đạt.

## Post-fix verification

- Chạy lại `npm run build`, `npm test -- --run` và `npm run build:ui`: đạt.
- Chạy lại `cargo fmt`, `cargo check` và `cargo test`: đạt.
- Chạy lại Web App test thật với `-Mode all`: đạt.
- PDF production build đã chứa cả font Latin và Vietnamese subset.
- Upload success giữ metadata trong Document Library và loại card đã gửi khỏi workspace sản phẩm.
- Không còn lỗi functional trong các kiểm tra tự động hiện có.

## Kế hoạch sửa

1. Đã thêm timeout HTTP rõ ràng cho Rust Outbox: connect 15 giây, toàn request 120 giây.
2. Đã bỏ bản sao `qc` thừa khỏi JSON gửi lên Apps Script; `qc_json` chỉ còn nằm trong Outbox để khôi phục card.
3. Đã chuẩn hóa lỗi response không phải JSON để báo rõ endpoint sai hoặc không phải `/exec`.
4. Chạy lại toàn bộ test và cập nhật trạng thái report sau khi sửa.

## Hạng mục cần môi trường bên ngoài

- Render PDF bằng Poppler trên máy QA hoặc CI có `pdftoppm`.
- Cấu hình OAuth Client ID, PKCE loopback, keyring và allowlist email QC.
- Kiểm tra offset/khổ giấy/tốc độ với đúng model và driver máy in thực tế.
