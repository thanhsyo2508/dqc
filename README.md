# Digital QC — core pipeline

## UI hiện tại

Màn hình tạo hồ sơ vẫn giữ nguyên nguyên tắc một sản phẩm → một PDF → một QR/link, đồng thời hỗ trợ thao tác nhanh cho dữ liệu thực tế:

- Dán nhiều dòng từ Excel theo 9 cột: Mã dự án, PO, NCC, Mã hàng, Tên hàng, Số lượng, ĐVT, Phiếu nhập, Ngày nhập.
- Chọn từng sản phẩm trong danh sách để chỉnh sửa và tạo hồ sơ độc lập.
- Thêm nhiều dòng kết quả đo cho nhiều mẫu trong cùng một hồ sơ.
- Kéo-thả hoặc chọn nhiều bản vẽ PDF; các PDF được ghép nối sau phiếu QC.
- Mỗi card mã hàng quản lý riêng thông tin kiểm tra, bản vẽ, preview và trạng thái tài liệu; không gộp với mã hàng khác.
- File upload thành công được ghi metadata vào thư viện tài liệu nội bộ theo card; QC có thể mở lại hồ sơ và link Drive riêng.
- QC WORKSPACE/header được giữ khi cuộn, 5 người kiểm tra gần nhất được gợi ý, và các dòng kết quả đo có khoảng cách nhẹ để dễ scan.
- Dữ liệu nháp và preview chỉ tồn tại trong phiên làm việc; local storage chỉ tự động giữ metadata của hồ sơ sau khi upload thành công.
- Nút `Gửi hồ sơ` upload đúng PDF preview theo từng card; URL Web App `/exec` được nhập trong cấu hình server trên topbar.
- Khi server trả thành công, metadata được tự động đưa vào `DOCUMENT LIBRARY`; event upload có correlation theo `documentId`/`requestId` để không nhầm mã hàng.
- QR được lưu cùng hồ sơ upload dưới dạng chuỗi 9 trường phân tách bằng dấu phẩy: mã dự án, mã hàng, số lượng, mã NCC, số phiếu nhập kho, ngày nhập kho, mã PO, mã hồ sơ QC và link PDF; có thể mở lại từ Document Library.
- Form `In tem QR` hỗ trợ mẫu A4, Zebra/Godex 100×50 mm, Brother 62×29 mm và máy in văn phòng generic; hộp thoại in Windows vẫn là nơi chọn thiết bị thực tế.
- Có nút `Kiểm tra kết nối` gửi `ping` tới Web App, hiển thị trạng thái loading/thành công/lỗi trước khi upload.
- Workspace được khóa cho tới khi đăng nhập Google bằng trình duyệt hệ thống; refresh token được giữ trong Windows Credential Manager và mọi upload đều bắt buộc xác thực.
- Document Library có tìm kiếm theo mã hàng, PO, mã QC hoặc document ID để không phải cuộn danh sách dài.
- Validation hiển thị ngay cạnh trường lỗi; bảng đo responsive và có nhãn cột rõ trên mobile.
- Giao diện mở rộng theo màn hình, ưu tiên hiển thị form và preview trong cùng một workspace.

Đây là bước triển khai đầu tiên theo mô hình product-centric. Hiện tại project tập trung kiểm chứng pipeline trước khi dựng UI Tauri:

```text
ProductQC → tạo phiếu PDF → ghép bản vẽ → upload nguyên bytes PDF
```

Mỗi sản phẩm có một hồ sơ QC độc lập, một PDF, một `request_id` và một QR/link.

## Chạy kiểm thử

```powershell
npm install
npm run build
npm test
```

Test hiện có:

- tạo PDF QC hợp lệ;
- ghép phiếu QC trước các trang bản vẽ;
- gửi đúng bytes PDF đã ghép tới mock HTTP server;
- lưu/phục hồi payload QR và lịch sử in;
- dựng HTML print sheet nhiều bản theo mẫu tem;
- kiểm tra metadata sản phẩm, số trang và SHA-256.

UI hiện có form product-centric, dán nhiều sản phẩm từ Excel, nhiều dòng đo, nhiều PDF bản vẽ, tạo PDF phiếu QC, ghép bản vẽ, preview, tải PDF, thư viện tài liệu local và upload theo từng card. Khi chạy Tauri, PDF được ghi vào Rust Outbox trước khi gửi; lỗi mạng được giữ lại và tự retry khi mở app hoặc có mạng trở lại.

Đã bổ sung Apps Script tại `apps-script/`, HTTP Outbox Rust và OAuth PKCE tại `src-tauri/src/`. Backend hỗ trợ `ALLOWED_USERS` theo vai trò, rate limit/quota ngày và Shared Drive Restricted. Để đưa lên production, quản trị viên vẫn cần tạo OAuth Client ID, Shared Drive và cấp quyền Google Workspace thật theo `apps-script/SETUP.md`.

Giao diện hiện dùng design system tại `design-system/digital-qc/MASTER.md`: phong cách Minimalism/Swiss, màu navy–blue–green, trạng thái tác nghiệp rõ và responsive cho màn hình nhỏ.

Chạy UI web local:

```powershell
npm run dev
```

Khung Tauri:

```powershell
npm run tauri dev
```

Lưu ý: cần chọn ít nhất một file PDF bản vẽ trong UI để tạo preview hoàn chỉnh. Font Noto Sans Vietnamese đã được nhúng khi tạo phiếu QC; OAuth/Shared Drive cần được cấu hình bằng tài khoản tổ chức và kiểm tra máy in thực tế trước khi nghiệm thu.

## Tài liệu dự án

- `docs/USER_GUIDE.md` — hướng dẫn sử dụng từ đăng nhập, nhập dữ liệu, upload PDF đến in tem QR.
- `KIEN_TRUC_CHI_TIET_DIGITAL_QC.md` — kiến trúc và lộ trình.
- `CHANGELOG.md` — lịch sử thay đổi.
- `EXPERIENCE.md` — bài học, quyết định và các lỗi cần tránh.
- `design-system/digital-qc/MASTER.md` — quy chuẩn màu, typography, spacing và component UI.

Hướng dẫn tạo project Apps Script bằng clasp và test Web App nằm ở `apps-script/SETUP.md`. Script `apps-script/test-webapp.ps1` có các mode kiểm tra upload, duplicate, validation, concurrency và near-limit.

Client gọi Apps Script bằng request `text/plain` chứa JSON để tránh CORS preflight `OPTIONS`; không đổi thành `application/json` nếu vẫn dùng Web App Apps Script trực tiếp từ UI.
