# Hướng dẫn sử dụng Digital QC

## 1. Mục đích

Digital QC quản lý quy trình:

\`\`\`text
Nhập sản phẩm → Nhập kết quả kiểm tra → Thêm bản vẽ PDF
→ Tạo preview → Gửi hồ sơ lên Drive → In tem QR
\`\`\`

Mỗi sản phẩm có một hồ sơ QC riêng, một PDF đã ghép, một mã hồ sơ QC và một QR liên kết đến PDF.

## 2. Chuẩn bị

Người dùng cần:

- Tài khoản Google đã được thêm vào danh sách được phép.
- Quyền xem hoặc quyền phù hợp trên Shared Drive.
- URL Web App Apps Script có đuôi \`/exec\`.
- File bản vẽ định dạng PDF.
- WebView2 nếu chạy bản Windows Tauri.

Quản trị viên cần cấu hình OAuth, Shared Drive, \`ALLOWED_USERS\` và URL Apps Script. Xem thêm [apps-script/SETUP.md](../apps-script/SETUP.md).

## 3. Đăng nhập

1. Mở \`digital-qc.exe\`.
2. Chọn **Đăng nhập bằng Google**.
3. Chọn đúng tài khoản được cấp quyền.
4. Hoàn tất xác thực trên trình duyệt hệ thống.
5. Quay lại ứng dụng.

Ứng dụng không nhận hoặc lưu mật khẩu Google. Refresh token được lưu trong Windows Credential Manager.

Nếu modal vẫn treo, hãy kiểm tra đúng tài khoản, \`ALLOWED_USERS\`, OAuth Client ID và thử khởi động lại ứng dụng.

## 4. Cấu hình server upload

Chọn trạng thái server ở góc trên bên phải:

1. Dán URL Web App, ví dụ:
   \`\`\`text
   https://script.google.com/macros/s/DEPLOYMENT_ID/exec
   \`\`\`
2. Chọn **Kiểm tra kết nối**.
3. Chỉ lưu khi kiểm tra thành công.
4. Chọn **Lưu cấu hình**.

Không dùng URL \`/dev\` hoặc URL trang chỉnh sửa Apps Script. Nếu lỗi, kiểm tra deployment, quyền Shared Drive, \`ALLOWED_USERS\` và kết nối Internet.

## 5. Nhập thông tin sản phẩm

### 5.1. Nhập trên bảng

| Trường | Ý nghĩa | Bắt buộc |
|---|---|---|
| Mã dự án | Mã dự án hoặc công việc | Có |
| PO | Mã đơn đặt hàng | Có |
| Mã hàng | Part number | Có |
| Tên hàng | Tên sản phẩm | Không |
| Số lot | Số lô | Không |
| Nhà cung cấp | Mã hoặc tên NCC | Không |
| Số lượng | Số lượng nhập/kiểm tra | Có |
| Đơn vị tính | PCS, SET, EA... | Không |
| Số phiếu nhập kho | Mã phiếu nhập kho | Có |
| Ngày nhập kho | Ngày nhập | Không |

Các trường có dấu \`*\` phải hoàn tất trước khi tạo preview hoặc gửi hồ sơ.

### 5.2. Dán nhiều dòng từ Excel

Dữ liệu phải có 9 cột theo thứ tự:

\`\`\`text
Mã dự án | PO | Mã NCC | Mã hàng | Tên hàng | Số lượng | ĐVT | Số phiếu NK | Ngày NK
\`\`\`

Ví dụ:

\`\`\`text
SALES_AGV	N/A	KAI	HAE-088-3B1-00-MKAC	Bracket	1	PCS	NK-07-26-1074	2026-07-29
\`\`\`

Thao tác:

1. Chọn các dòng trong Excel.
2. Nhấn \`Ctrl+C\`.
3. Dán vào **Dán dữ liệu từ Excel**.
4. Chọn **Nạp danh sách**.
5. Kiểm tra lại các card sản phẩm.

Có thể dán cả dòng tiêu đề. Nếu lệch cột, hãy kiểm tra Excel đang phân cách bằng tab.

### 5.3. Card sản phẩm

Chọn card để chỉnh sửa thông tin, nhập kiểm tra, thêm PDF, tạo preview và gửi hồ sơ. Hồ sơ đã gửi sẽ không còn nằm trong danh sách card nhập liệu mà chuyển sang **Document Library**.

## 6. Thông tin kiểm tra

Nhập:

- **Mã hồ sơ QC**: mã duy nhất của hồ sơ; có nút làm mới để tạo mã mới.
- Ngày kiểm tra.
- Người kiểm tra.
- Cấp độ kiểm tra.
- Số lượng hàng lỗi.
- Thời hạn phản hồi.
- Nội dung lỗi hoặc ghi chú.

Kiểm tra mã hồ sơ QC trước khi gửi để bảo đảm đối chiếu được với sheet và file Drive.

## 7. Kết quả đo và tiêu chuẩn

Phần **Kết quả đo** có một hàng đầu là **Thông số chuẩn**, các hàng sau là mẫu đo.

### 7.1. Thông số chuẩn

Với mỗi cột V1 đến V7, nhập:

- Giá trị chuẩn.
- Sai số âm.
- Sai số dương.

Ví dụ chuẩn \`10.00\`, sai số âm \`0.10\`, sai số dương \`0.10\` tạo khoảng đạt \`9.90–10.10\`.

### 7.2. Mẫu đo

1. Nhập giá trị V1–V7.
2. Nhập ngoại quan nếu có.
3. Chọn **Thêm dòng đo** để thêm mẫu.
4. Xóa dòng thừa bằng nút xóa.

Ứng dụng tự đánh giá:

- **Đạt**: nằm trong khoảng chuẩn.
- **Không đạt**: nằm ngoài khoảng cho phép.
- **Chưa đủ dữ liệu**: thiếu chuẩn hoặc kết quả.

Nhập hàng chuẩn trước rồi mới nhập mẫu đo. Với thông số không áp dụng, để trống thay vì nhập số 0.

## 8. Thêm bản vẽ PDF

Trong **Bản vẽ tham chiếu**:

1. Kéo thả một hoặc nhiều PDF vào vùng upload, hoặc chọn **Duyệt file**.
2. Kiểm tra danh sách file.
3. Xóa file nhầm nếu cần.
4. Tạo preview.

Phiếu QC được ghép ở trước các trang bản vẽ. File upload chính là bộ bytes PDF đã preview.

## 9. Tạo và kiểm tra preview

Trước khi tạo preview, cần có đủ thông tin sản phẩm, thông tin kiểm tra và ít nhất một PDF.

Chọn **Tạo preview PDF**, sau đó kiểm tra:

- thông tin sản phẩm;
- mã hồ sơ QC;
- người kiểm tra;
- kết quả đo;
- trạng thái đạt/không đạt;
- số trang;
- bản vẽ sau phiếu QC.

Có thể chọn **Tải PDF** để lưu và kiểm tra độc lập trước khi upload.

## 10. Gửi hồ sơ lên Drive

1. Đăng nhập Google.
2. Kiểm tra server đã kết nối.
3. Đảm bảo preview đã tạo.
4. Chọn **Gửi hồ sơ**.
5. Chờ trạng thái thành công.

Sau upload, hệ thống lưu mã hồ sơ, mã file Drive, URL, thời gian gửi, payload QR và lịch sử in. Không đóng ứng dụng lúc đang upload. Tauri Outbox có thể giữ request để retry khi mạng trở lại.

## 11. Nội dung QR

QR là chuỗi 9 trường phân cách bằng dấu phẩy, không dùng JSON:

\`\`\`text
Mã dự án,Mã hàng,Số lượng,Mã NCC,Số phiếu NK,Ngày NK,Mã PO,Mã hồ sơ QC,Link PDF
\`\`\`

Ví dụ:

\`\`\`text
SALES_AGV,HAE-088-3B1-00-MKAC,1,KAI,NK-07-26-1074,2026-07-29,N/A,QC-260929-0001,https://drive.google.com/file/d/FILE_ID/view
\`\`\`

Lưu ý: ví dụ trên thể hiện 9 trường theo yêu cầu; nếu PO là \`N/A\` thì đó là trường thứ 7. Dữ liệu có dấu phẩy hoặc xuống dòng sẽ được làm sạch để không phá vỡ cấu trúc trường.

Người quét QR vẫn phải có quyền xem file trên Shared Drive. QR không làm file trở thành công khai.

## 12. Document Library

Hồ sơ upload thành công xuất hiện trong **Document Library**. Có thể tìm theo:

- mã hàng;
- PO;
- mã QC;
- document ID.

Thao tác:

- **Mở**: mở file PDF trên Drive.
- **In tem**: mở giao diện in tem.
- Xem trạng thái và thời gian upload.
- Xóa metadata khỏi thư viện local.

Xóa khỏi thư viện local không đồng nghĩa xóa file vật lý trên Shared Drive.

## 13. In tem QR

Chọn **In tem** trong Document Library.

### 13.1. Dòng máy in

- Windows: mở hộp thoại chọn máy in.
- Zebra: tem cuộn, thường dùng 100×50 mm.
- Brother QL: các khổ Brother như 62×29 mm.
- Godex: dùng driver Windows, cần calibration.
- Máy in văn phòng: giấy tem A4.

### 13.2. Kích thước tem

Có các khổ:

- A4 63,5×33,9 mm, 3 cột × 8 dòng;
- A4 91×60 mm, 2 cột × 4 dòng;
- 100×50 mm;
- 80×50 mm;
- 100×30 mm;
- 70×30 mm;
- 62×29 mm;
- 50×30 mm.

Preview giữ đúng tỷ lệ. QR và chữ tự điều chỉnh theo khổ; mã hàng dài sẽ tự giảm font để tránh mất ký tự.

### 13.3. In

1. Chọn form tem.
2. Nhập số bản in từ 1 đến 100.
3. Kiểm tra preview.
4. Chọn **Mở hộp thoại in**.
5. Chọn đúng máy in và paper size.
6. In thử một tem trước khi in hàng loạt.

Với máy tem cuộn, không chọn \`Fit to page\` nếu muốn giữ đúng kích thước. Hãy calibration máy trước khi in số lượng lớn.

## 14. Quy trình hằng ngày

1. Đăng nhập Google.
2. Kiểm tra server.
3. Nhập hoặc dán sản phẩm.
4. Kiểm tra mã hồ sơ QC.
5. Nhập thông số chuẩn.
6. Nhập mẫu đo.
7. Thêm bản vẽ PDF.
8. Tạo và kiểm tra preview.
9. Gửi hồ sơ.
10. Kiểm tra link trong Document Library.
11. In tem sau khi xác nhận file Drive mở được.

## 15. Xử lý lỗi

### Không đăng nhập được

Kiểm tra tài khoản, \`ALLOWED_USERS\`, OAuth Client ID, redirect URI và Internet. Nếu modal treo, khởi động lại ứng dụng.

### Server chưa cấu hình

Nhập lại URL Web App \`/exec\`, chọn kiểm tra kết nối rồi lưu.

### Không tạo được preview

Kiểm tra trường bắt buộc, đã chọn PDF và không còn lỗi validation.

### Upload thất bại

Kiểm tra quyền Shared Drive, kích thước PDF, URL Apps Script và mạng. Request có thể được retry qua Outbox.

### QR mở không được file

Cấp quyền xem Shared Drive cho tài khoản quét. File Restricted chỉ mở được với tài khoản có quyền.

### Tem sai tỷ lệ

Chọn đúng form tem, paper size, tắt \`Fit to page\`, in thử một tem và calibration lại máy.

## 16. Bảo mật và dữ liệu

- Upload luôn yêu cầu Google authentication.
- Backend kiểm tra email trong danh sách cho phép và vai trò.
- Shared Drive nên đặt quyền Restricted.
- Không chia sẻ URL Apps Script hoặc OAuth Secret.
- Không commit \`.env.local\`.
- QR chứa URL file nhưng quyền vẫn do Google Drive kiểm soát.
- Metadata upload được lưu local để hiển thị thư viện; PDF bytes không lưu vĩnh viễn trong local storage.

