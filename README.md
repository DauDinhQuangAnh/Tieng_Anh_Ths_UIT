# 🎓 App Ôn Thi Tiếng Anh Đầu Vào Thạc Sĩ — ĐH Khoa Học Tự Nhiên (ĐHQG-HCM) 2026

Ứng dụng được xây dựng 100% dựa trên 2 tài liệu chính thức:
1. `Cấu trúc đề thi tiếng Anh.docx` (Quy chế & Thang điểm 100 của Trường ĐH KHTN, ĐHQG-HCM).
2. `AV Ôn tập vào 2026 Dot 2.pdf` (Trọn bộ 79 trang đề cương ôn tập Đợt 2 - 2026).

---

## 📦 Kho dữ liệu đã tích hợp đầy đủ (910+ Câu hỏi & Giải chi tiết)
- **10 Đề Thi Thử Hoàn Chỉnh (`Practice Tests 1 – 10` — 700 câu):**
  - **Paper 1 (Reading & Vocabulary - 20 điểm):** 100 câu Từ vựng + 20 Bài đọc hiểu (kèm bản dịch tiếng Việt và phát âm AI).
  - **Paper 2 (Grammar, Cloze & Writing - 40 điểm):** 150 câu Ngữ pháp + 10 Bài đục lỗ (Cloze Test, 100 câu) + 50 câu Viết lại câu tự luận (Sentence Transformation).
  - **Paper 3 (Listening Comprehension - 20 điểm):** 200 câu nghe hiểu (Short conversations, Long conversations, Short talks) được tái tạo kịch bản hội thoại chuẩn PET/TOEFL và tích hợp bộ phát âm AI (Text-to-Speech) điều chỉnh tốc độ `0.8x / 1.0x / 1.2x` + bật/tắt Transcript.
  - **Paper 4 (Speaking - 20 điểm):** Bài mẫu **Self-introduction (5đ)** + **10 Chủ đề Speaking (15đ)** theo từng đề.
- **20 Chuyên Đề Viết Lại Câu (`Writing Practice 1 – 20C` — 116 câu tự luận, trang 71–79):**
  - Tổng hợp công thức đóng khung, ví dụ mẫu, chấm điểm tự luận tự động (nhận diện linh hoạt viết tắt và nhiều đáp án đúng).
- **3 Bộ Ngữ Pháp Tuyển Sinh Sau Đại Học (`Grammar Practice 1 – 3` — 94 câu, trang 65–70):**
  - Giải thích chi tiết từng bẫy ngữ pháp (Mệnh đề quan hệ rút gọn, Đảo ngữ, Phân từ, Liên từ...).

---

## 🚀 Cách sử dụng ngay trên Máy tính & Điện thoại Android

### Cách 1: Chạy ngay & Cài lên Điện thoại Android qua Wi-Fi (Khuyên dùng - Không cần cài Android Studio)
1. Nhấp đúp vào file **`Chay_App_Ngay.bat`** (hoặc mở trực tiếp file **`index.html`** bằng Chrome/Edge).
2. Trên máy tính: Ứng dụng tự mở tại `http://localhost:8088` (Bấm nút **📱 Chế độ Mobile** ở góc trên bên phải nếu muốn xem khung điện thoại Android).
3. Trên điện thoại Android (bắt cùng mạng Wi-Fi với máy tính):
   - Mở trình duyệt **Chrome** trên Android, nhập địa chỉ IP hiển thị trên cửa sổ đen (ví dụ `http://192.168.1.x:8088`).
   - Bấm menu `⋮` của Chrome ➔ Chọn **"Thêm vào màn hình chính" (Add to Home screen / Install App)**.
   - App sẽ xuất hiện ngoài màn hình chính điện thoại Android và **chạy Offline 100%** như một ứng dụng gốc!

### Cách 2: Biên dịch file cài đặt `.apk` từ mã nguồn Flutter (`flutter_app/`)
Thư mục `flutter_app/` chứa đầy đủ mã nguồn Flutter (kết nối `FlutterTts` và `WebViewController`):
- **Nếu máy có cài Flutter SDK:**
  ```bash
  cd flutter_app
  flutter create --platforms=android --org vn.edu.hcmus .
  flutter pub get
  flutter build apk --release
  ```
- **Nếu không muốn cài đặt nặng máy (10GB Android SDK):**
  Đẩy thư mục này lên GitHub, file cấu hình tự động `.github/workflows/build-apk.yml` sẽ tự động biên dịch và xuất ra file `HCMUS-Master-English-2026-APK.zip` (`app-release.apk`) trên đám mây!
