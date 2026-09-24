# Changelog

Các thay đổi đáng chú ý của dự án Digital QC.

## [Unreleased]

### Workflow upload and UX hardening

- Lưu payload QR `open_url` và lịch sử in ngay trong metadata của hồ sơ upload thành công.
- Thêm `QR Label Studio`: preview QR, chọn profile Zebra/Brother/Godex/Windows và mẫu tem A4/tem cuộn, in nhiều bản qua hộp thoại hệ thống.

- Thêm nút `Gửi hồ sơ` dùng đúng bytes PDF đã preview; upload theo từng card mã hàng.
- Thêm hộp cấu hình URL Web App `/exec`, trạng thái server động và feedback upload thành công/thất bại.
- Gắn `documentId` và `requestId` vào event upload để không cập nhật nhầm card khi có nhiều hồ sơ.
- Thêm validation inline cho trường bắt buộc, `aria-invalid`, focus vào lỗi đầu tiên và nhãn bắt buộc rõ ràng.
- Tăng vùng chạm cho nút thao tác; bảng kết quả đo có cuộn ngang ở tablet và nhãn cột hiển thị trên mobile.
- Cập nhật stepper và badge trạng thái theo tiến trình sản phẩm → kiểm tra → preview → upload.

### UI improvements

- Bỏ nút và luồng lưu hồ sơ nội bộ; chỉ tự động lưu metadata sau khi upload thành công.
- Đổi trường ngoại quan thành select chỉ gồm `OK` và `NG` để nhập nhanh, tránh sai chính tả.
- Thu gọn DOCUMENT LIBRARY thành vùng click mở rộng; mặc định không liệt kê toàn bộ hồ sơ đã upload.
- Hiển thị mã hàng ở thẻ tài liệu đang chọn thay cho `DOC-00x`; mã hồ sơ nội bộ vẫn giữ trong dòng thông tin phụ để tra cứu.
- Điều chỉnh font cho các nhãn phân cấp như `DOCUMENT LIBRARY`, `LIVE DOCUMENT` và `MÃ HÀNG` để tách khỏi nội dung form.
- Thêm thư viện tài liệu nội bộ: sau khi backend trả về upload thành công, metadata file/QC được gắn vào đúng card mã hàng, lưu local và có thể mở lại từ danh sách.
- Giữ thanh header và QC WORKSPACE khi cuộn trang; sidebar có vùng cuộn riêng để không làm mất ngữ cảnh thao tác.
- Lưu 5 người kiểm tra nhập gần nhất trong local storage và gợi ý bằng autocomplete.
- Tạo khoảng cách 8px giữa các dòng kết quả đo để scan/form nhận diện từng mẫu rõ hơn.
- Cho phép dán trực tiếp dữ liệu tab-separated từ Excel để nạp nhiều sản phẩm và chọn từng sản phẩm để chỉnh sửa.
- Kết quả đo hỗ trợ nhiều dòng mẫu, có thể thêm, xóa và tự đánh số lại.
- Bản vẽ tham chiếu hỗ trợ kéo-thả hoặc chọn nhiều PDF, có danh sách file và xóa từng file.
- Bố cục workspace dùng toàn bộ chiều rộng khả dụng; preview PDF co giãn theo chiều cao màn hình.
- Bổ sung test parser Excel và test ghép nhiều PDF.
- Mỗi card mã hàng trở thành một hồ sơ tài liệu nội bộ độc lập với `documentId`, QC, bản vẽ, preview và trạng thái riêng.
- Thêm lưu metadata hồ sơ vào local storage; khi mở lại app, preview sẽ yêu cầu tạo lại nếu bytes PDF không còn trong bộ nhớ.
- Thêm bộ khung Apps Script cho `ping`, `upload_qc_pdf`, `find_uploads`, kiểm tra `%PDF-`, SHA-256, chống trùng `request_id`, lưu Drive và ghi `UPLOAD_LOG`.
- Thêm Rust outbox có ghi `meta.json` và `file.pdf` theo từng `request_id`, ghi atomically và có lệnh list/enqueue/discard.

### Added

- Design system Digital QC và giao diện workspace mới theo hướng Minimalism/Swiss.
- Sidebar tiến trình, layout form/preview hai cột, trạng thái draft/server và SVG icon nhất quán.
- UI alpha cho một sản phẩm: nhập metadata/QC, chọn PDF bản vẽ, tạo preview và tải PDF ghép.
- Khung form kết quả đo và kiểm tra dữ liệu bắt buộc ở phía client.
- Khởi tạo core pipeline theo mô hình product-centric.
- Thêm model `Product`, `ProductQc`, `MeasurementRow` và `productKey`.
- Thêm tạo PDF phiếu QC bằng `pdf-lib`.
- Thêm ghép PDF phiếu QC với các trang bản vẽ.
- Thêm upload client gửi nguyên bytes PDF, metadata sản phẩm và SHA-256.
- Thêm test với mock HTTP server cho tạo PDF, ghép PDF và upload.
- Thêm khung Vite UI và Tauri v2.
- Thêm icon tạm cho ứng dụng Tauri.
- Thêm `README.md` hướng dẫn chạy project.
- Cập nhật kiến trúc sang hướng một sản phẩm → một hồ sơ QC → một PDF → một QR/link.

### Changed

- QR mặc định chỉ chứa một `open_url` để mở hồ sơ PDF.
- Không gộp nhiều sản phẩm vào cùng một PDF hoặc một QR.
- Outbox, API và `UPLOAD_LOG` được thiết kế theo từng sản phẩm độc lập.
- Tauri shell vẫn ở mức khung; bundle đang tắt trong giai đoạn phát triển và cần bật lại trước phát hành.

### Not yet implemented

- Quy trình trạng thái hoàn chỉnh, OAuth Google, outbox Rust và kết nối Apps Script/Drive/Sheet thật.
- OAuth Google và lưu token trong keyring.
- Outbox thật trong Rust.
- Apps Script, Google Drive và Google Sheet thật.
- In tem trực tiếp.
- Font Unicode tiếng Việt và kiểm tra trực quan PDF trên môi trường phát hành.
- Đóng gói installer và updater.

## Quy ước cập nhật

- Ghi thay đổi mới nhất ở đầu file, trong mục `[Unreleased]`.
- Dùng nhóm `Added`, `Changed`, `Fixed`, `Removed`, `Security` hoặc `Not yet implemented`.
- Khi phát hành phiên bản, đổi `[Unreleased]` thành số phiên bản và ngày phát hành.
- Chỉ ghi thay đổi có ảnh hưởng đến người dùng, kiến trúc, dữ liệu hoặc vận hành.
