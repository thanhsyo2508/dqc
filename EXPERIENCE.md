# Experience / Engineering Notes

## 14. Upload phải gắn với đúng card

- Không dùng `activeDocument()` làm nguồn duy nhất khi nhận event upload; event phải mang `documentId` và `requestId`.
- Khi upload đang chạy, khóa nút tạo preview/gửi hồ sơ để tránh gửi trùng do double-click.
- Chỉ ghi vào Document Library sau response `success: true`; lỗi upload giữ nguyên preview để người dùng thử lại.
- Endpoint server là cấu hình người dùng, không hard-code URL hoặc token trong frontend.

## 15. Validation và responsive form

- Lỗi phải nằm cạnh trường liên quan, có `aria-invalid` và focus vào lỗi đầu tiên; toast/status chung chỉ dùng để bổ sung ngữ cảnh.
- Bảng đo có nhiều cột nên dùng vùng cuộn ngang ở tablet; trên mobile phải hiển thị nhãn `V1…V7` và `Ngoại quan` ngay trong từng ô.
- Các nút xóa/thêm/gửi cần vùng chạm tối thiểu khoảng 44px để thao tác ổn định trên màn hình cảm ứng.

## 16. QR và in tem

- QR chỉ được tạo sau khi server trả `open_url` của hồ sơ thành công; không tạo QR từ draft hoặc preview chưa upload.
- Lưu payload URL, `printCount`, `printedAt`, `templateId` và `printerProfileId` cùng `InternalDocument.uploaded` để có thể dựng lại QR sau khi khởi động app.
- Profile máy in chỉ chuẩn hóa khổ giấy và CSS print sheet. Việc chọn máy in thực tế đi qua hộp thoại in Windows, tránh khóa ứng dụng vào một driver/vendor.
- Tem roll phải dùng `@page size` đúng khổ và có `page-break-after`; nếu không, máy in nhiệt dễ tự co giãn hoặc ghép nhiều tem vào một trang.
- Không ghi ảnh QR base64 vào local storage; chỉ lưu payload URL và metadata lịch sử in.

## 17. Kết nối và thư viện tài liệu

- Luôn có ping endpoint trước khi người dùng thử upload thật; lỗi URL/quyền cần được phát hiện trong dialog cấu hình với hướng khắc phục rõ ràng.
- Trạng thái “đã cấu hình” không đồng nghĩa “server đang hoạt động”; chỉ gắn trạng thái online sau ping hoặc upload thành công.
- Document Library phải có tìm kiếm khi số hồ sơ tăng; lọc theo mã hàng, PO, mã QC và document ID là các khóa tra cứu QC thường dùng.

Tài liệu này ghi lại các bài học và quyết định cần nhớ khi phát triển Digital QC. Mục tiêu là tránh quay lại những hướng đã biết là dễ sai hoặc khó vận hành.

## 1. Định hướng nghiệp vụ

- Đơn vị trung tâm là **một sản phẩm/lô/phiếu** (`ProductQc`), không phải một batch PDF.
- Một sản phẩm tạo một hồ sơ QC, một PDF, một lần upload và một QR/link.
- Có thể nhập nhiều sản phẩm cùng lúc từ Excel, nhưng phải xử lý tuần tự hoặc độc lập từng sản phẩm.
- Không gộp nhiều sản phẩm vào một PDF hoặc một QR vì dễ nhầm hồ sơ, khó in lại và khó retry từng phần.

## 2. PDF: phải giữ nguyên byte đã preview

- PDF được preview phải là chính bytes được upload.
- Không tạo lại PDF ở bước upload.
- Luôn kiểm tra `%PDF-`, kích thước và SHA-256.
- PDF ghép phải có thứ tự: phiếu QC trước, bản vẽ sau.
- Khi thay đổi dữ liệu sản phẩm, QC hoặc bản vẽ thì preview cũ hết hiệu lực.
- Trước khi nối Apps Script thật, phải test độc lập: tạo PDF, ghép PDF, load lại PDF và kiểm tra số trang.
- Font Unicode tiếng Việt phải được nhúng; không dựa vào font chuẩn của PDF cho bản phát hành.

## 3. Upload và retry

- Phải ghi PDF vào outbox trước khi gửi mạng.
- Retry luôn dùng cùng `request_id`; không tạo request mới cho cùng một PDF.
- Server phải chống trùng theo `request_id`.
- Lỗi một sản phẩm không được làm mất trạng thái của sản phẩm khác.
- Mock server chỉ chứng minh client gửi đúng payload; vẫn phải có test tích hợp với Apps Script/Drive/Sheet thử nghiệm trước nghiệm thu.
- Không xem `page_count` hoặc `size_bytes` từ client là dữ liệu bảo mật; server phải tự kiểm tra phần cần thiết.

## 4. QR và truy xuất

- QR mặc định chỉ chứa một `open_url`.
- Không dùng payload nhiều dòng hoặc chuỗi CSV không có escaping làm định dạng chính.
- Thông tin mã hàng, PO, số lượng, nhà cung cấp và phiếu nhập nên in rõ trên tem, không nhồi vào QR.
- Link PDF phải tôn trọng quyền Drive `Restricted`; QR không phải cơ chế bảo mật.
- In lại tem phải dùng hồ sơ đã upload, không upload lại cùng PDF chỉ vì cần in lại.

## 5. Apps Script và xác thực

- Phải thử sớm giới hạn dung lượng, thời gian chạy và redirect của Web App `/exec`.
- Không xây toàn bộ UI trước khi biết upload PDF thực tế có phù hợp với Apps Script hay phải chia chunk.
- Với OAuth, phải xác minh `aud`, `exp`, `email_verified` và email được phép ở server.
- Không lưu token trong webview, file cấu hình hoặc log.
- Drive và quyền gọi API là hai lớp quyền khác nhau; phải kiểm tra cả hai.

## 6. Tauri và môi trường phát triển

- Rust chịu trách nhiệm mạng, bí mật, outbox, hash và lệnh hệ thống.
- Webview chịu trách nhiệm form, PDF, preview và QR; không gọi server trực tiếp.
- `node_modules/`, `dist/`, `src-tauri/target/` và schema sinh tự động không đưa vào source control.
- Tauri Windows cần bộ icon hợp lệ ngay cả khi mới chạy `cargo check`; phải tạo icon trước khi kiểm tra Rust scaffold.
- Tắt bundle chỉ là giải pháp phát triển tạm thời; trước phát hành phải bật bundle, ký mã và kiểm tra installer.

## 7. Quy trình làm việc an toàn

1. Cập nhật kiến trúc và `EXPERIENCE.md` nếu quyết định nghiệp vụ thay đổi.
2. Viết test cho phần PDF/API trước khi nối hệ thống thật.
3. Chạy `npm run build`, `npm test`, `npm run build:ui` và `cargo check` trước mỗi mốc.
4. Chỉ sau khi mock test đạt mới thử Apps Script thật với thư mục Drive/Sheet thử nghiệm.
5. Trước nghiệm thu, test hai sản phẩm gần giống nhau, retry sau khi cắt mạng, upload trùng và in lại tem.

## 8. Quy tắc giao diện

- Dùng một design system chung trong `design-system/digital-qc/MASTER.md`, không thêm màu và spacing tùy ý theo từng màn hình.
- Màn hình tác nghiệp phải làm rõ bước hiện tại, trạng thái server và hành động chính.
- Preview PDF là vùng nội dung chính, không để bị chìm dưới form.
- Dùng SVG icon nhất quán; không dùng emoji làm icon chức năng.
- Trạng thái lỗi/thành công phải có chữ, không chỉ dựa vào màu.
- Form phải có label nhìn thấy, focus state rõ và lỗi nằm gần trường liên quan.

## 9. Những việc không nên làm

- Không đưa token hoặc khóa bí mật vào JavaScript frontend.
- Không tạo QR trước khi server trả `success: true` và `open_url`.
- Không dùng link Drive công khai `Anyone with the link` cho hồ sơ QC.
- Không coi việc mock upload thành công là bằng chứng Apps Script thật đã sẵn sàng.
- Không bỏ qua test máy quét, máy in và tài khoản Google thực tế.

## 10. Nhập liệu hàng loạt và nhiều file

- Dữ liệu dán từ Excel phải dùng tab làm dấu phân cách; parser cần báo rõ dòng lỗi thay vì âm thầm bỏ qua.
- Import Excel chỉ nạp dữ liệu sản phẩm. Người dùng vẫn phải kiểm tra sản phẩm đang chọn trước khi tạo hồ sơ QC.
- Mỗi dòng kết quả đo đại diện cho một mẫu; khi xóa dòng phải đánh số lại để PDF không có số thứ tự bị đứt.
- File bản vẽ phải được giữ dưới dạng danh sách `File` trong UI; không đọc lại từ `input.files` sau khi input đã được reset.
- Khi ghép nhiều PDF, ghép tuần tự theo thứ tự người dùng chọn và luôn kiểm tra lại tổng số trang trước preview/upload.
- Không đặt giới hạn chiều rộng cứng cho workspace; preview nên co giãn theo chiều cao viewport nhưng vẫn có kích thước tối thiểu để đọc được.

## 11. Quản lý tài liệu nội bộ theo card mã hàng

- Card mã hàng là ranh giới dữ liệu: đổi card phải khôi phục đúng QC, dòng đo, bản vẽ, preview và trạng thái của card đó.
- Không dùng một biến preview hoặc một danh sách bản vẽ chung cho tất cả mã hàng.
- `documentId` phải được tạo ngay khi nạp sản phẩm để sau này gắn ổn định với outbox, request upload, file Drive và QR.
- Không lưu draft hoặc preview vào local storage. Chỉ metadata của hồ sơ upload thành công được lưu để thư viện tài liệu phục hồi sau khi app khởi động lại; bytes PDF và đối tượng `File` vẫn do Drive/outbox quản lý.
- Trạng thái `preview-ready` không được coi là đã gửi server. Chỉ chuyển sang `sent` sau khi backend trả thành công và trả về thông tin file.
- Apps Script thử nghiệm phải dùng Drive folder và spreadsheet riêng; không kiểm thử lần đầu trên dữ liệu production.
- Outbox phải ghi `file.pdf` và `meta.json` trước khi gọi mạng; `request_id` không được đổi khi retry.

## 12. Lưu và truy xuất file upload thành công

- Khi server trả `success: true`, phải lưu metadata `qc_no`, `file_id`, `open_url`, tên file và thời gian vào chính `InternalDocument` của card đang xử lý.
- Thư viện trong app chỉ hiển thị file đã upload thành công; `preview-ready`, file chỉ nằm trong outbox hoặc upload thất bại không được hiển thị như hồ sơ đã gửi.
- Lưu local storage ở giai đoạn hiện tại là metadata và link truy xuất, không nhân bản bytes PDF vào local storage; bytes phát hành phải do outbox/Drive quản lý.
- Không có nút lưu hồ sơ nội bộ. Chỉ response thành công của `uploadProductPdf` phát event upload và chuyển hồ sơ sang `sent`, sau đó metadata mới được lưu tự động.

## 13. UX thao tác lâu trong workspace

- Header và nhãn `QC WORKSPACE` cần được giữ trong viewport khi cuộn; layout phải dành sẵn không gian tự nhiên cho sticky element để tránh che nội dung.
- Sidebar desktop nên có vùng cuộn riêng; trên màn hình nhỏ chuyển sang layout không sidebar thay vì để sticky làm hẹp vùng form.
- Dùng `datalist` cho 5 người kiểm tra gần nhất là đủ nhanh nhưng vẫn cho phép nhập tên mới; không khóa danh sách người dùng.
- Dòng đo là các đơn vị scan riêng; margin/gap nhẹ giữa các dòng giúp giảm nhầm cột khi có nhiều mẫu.
