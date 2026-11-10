# 🌿 MintMart - Website Thương Mại Điện Tử Hiện Đại (Xanh Bạc Hà & Nền Trắng)

> [!IMPORTANT]
> **Nhánh Quản Trị Viên (`admin`)**: Đây là nhánh chuyên biệt chứa toàn bộ hệ thống **Cổng Quản Trị Viên (Admin Portal)**, công cụ quản lý đơn hàng, danh mục, sản phẩm, phân quyền người dùng và đồng bộ kho hàng đa kênh Shopee & Lazada.
> Nhánh `main` được giữ độc lập và cô lập chỉ dành cho **Cửa Hàng Khách Hàng (Customer Storefront)** để ngăn ngừa rò rỉ quyền hạn và rủi ro bị khai thác (anti-exploit).

Hệ thống website bán hàng trực tuyến hoàn chỉnh với thiết kế màu chủ đạo xanh bạc hà (Mint Green `#10B981`) kết hợp nền trắng thanh lịch, tham khảo phong cách từ các nền tảng thương mại điện tử hàng đầu (Shopee, Tiki, Apple, Shopify).

Hệ thống được tách biệt thành **2 trang web riêng biệt**:
1. **Giao diện Người sử dụng (Customer Storefront)**: Dành cho khách mua hàng trải nghiệm lướt web, tìm kiếm, lọc theo giá/danh mục, flash sale, giỏ hàng slide-out và đặt hàng.
2. **Giao diện Quản trị viên (Admin Portal)**: Dành cho người quản lý hệ thống phân quyền (Role-Based Access Control), thêm mới/chỉnh sửa/xóa mặt hàng (hỗ trợ upload ảnh từ máy tính hoặc link URL), quản lý danh mục, xử lý đơn hàng và thống kê doanh thu với biểu đồ tương tác.

Dữ liệu được **đồng bộ trực tiếp tức thì qua cơ sở dữ liệu SQLite & Đám Mây (Cloud Storage)**: 
* Khi quản trị viên thêm mới, chỉnh sửa hoặc gỡ mặt hàng, hệ thống tự động lưu vào SQLite local và **ngay lập tức đẩy snapshot lên Đám Mây đa thiết bị (Cloud Storage)**.
* Mọi thiết bị khác (điện thoại di động, máy tính khác) đều tự động nhận dữ liệu mới theo chu kỳ 30 giây hoặc ngay khi thao tác.

Đặc biệt, hệ thống tích hợp **API Đồng bộ đa kênh (Omnichannel) với Shopee & Lazada**:
* **Ràng buộc kiểm tra tồn kho liên sàn**: Khách không thể đặt vượt quá số lượng hàng có sẵn trong kho.
* **Tự động khấu trừ kho thời gian thực**: Ngay khi khách đặt hàng trên website, hệ thống tự động gọi API khấu trừ số lượng sản phẩm tương ứng trong kho trên cả 2 sàn Shopee và Lazada.
* **Ghi nhật ký đồng bộ chi tiết**: Quản trị viên có thể theo dõi từng giao dịch trừ kho của Shopee và Lazada ngay tại tab *"Đồng Bộ Shopee & Lazada"*.

---

## 🚀 Hướng Dẫn Khởi Động Nhanh

### Cách 1: Khởi động qua Terminal
Chạy lệnh sau tại thư mục dự án `d:\Project_E-commerce`:
```bash
npm start
```

### Cách 2: Double-click file `start.bat`
Chỉ cần nhấp đúp vào file `start.bat` trong thư mục dự án để tự động mở máy chủ.

Sau khi khởi động, mở trình duyệt và truy cập:
* 🛒 **Trang Bán Hàng (Người dùng)**: [http://localhost:3000](http://localhost:3000)
* 🛡️ **Trang Quản Trị (Admin Portal)**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## ⚙️ Cấu Hình Môi Trường (.env) & Quản Trị

Dự án sử dụng file `.env` để quản lý bảo mật biến môi trường (API Shopee, Lazada, VietQR, JWT Secret và tài khoản Admin). File `.env` đã được cấu hình loại trừ trong `.gitignore` để tránh rò rỉ dữ liệu khi đẩy lên GitHub/Public.

1. Sao chép file `.env.example` thành `.env` (nếu tải mới về):
   ```bash
   cp .env.example .env
   ```
2. Cấu hình các tham số API và mật khẩu trong file `.env`.
3. Quản trị viên có thể đổi email và mật khẩu trực tiếp trong giao diện Quản Trị (`/admin` -> Nút **"Đổi Mật Khẩu"**).

---

## 🌟 Các Tính Năng Nổi Bật

### 1. Giao Diện Người Dùng (Customer Storefront - `http://localhost:3000`)
- **Tone màu chủ đạo**: Xanh bạc hà tươi mát (Mint Green gradient), nền trắng tinh tế, phong cách hiện đại.
- **Top Announcement Bar**: Thông báo miễn phí vận chuyển, hotline 1900 6868, nút chuyển nhanh sang Cổng Quản Trị (Admin).
- **Thanh tìm kiếm thông minh**: Lọc tức thì theo từ khóa và danh mục sản phẩm.
- **Flash Sale Săn Deal**: Đồng hồ đếm ngược thời gian thực (Giờ : Phút : Giây) và thanh tiến độ đã bán hấp dẫn.
- **Bộ lọc sản phẩm đa chiều**:
  - Lọc theo từng danh mục (Công nghệ, Thời trang, Gia dụng, Sức khỏe, Sách...).
  - Lọc theo khoảng giá (Dưới 300k, 300k - 1tr, 1tr - 2tr, Trên 2tr).
  - Sắp xếp: Mới nhất, Bán chạy nhất, Giá tăng dần, Giá giảm dần.
- **Thẻ sản phẩm chuẩn thương mại điện tử**: Huy hiệu giảm giá (`-25%`), nhãn `HOT`, `MỚI`, đánh giá sao, số lượng đã bán, nút xem nhanh modal.
- **Xem nhanh chi tiết (Quick View Modal)**: Xem ảnh phóng to, thông số kỹ thuật, mô tả, chọn số lượng và thêm vào giỏ.
- **Giỏ hàng trượt mượt mà (Cart Drawer)**: Tự động tính tổng tiền, miễn phí vận chuyển cho đơn từ 299k, tăng giảm số lượng tức thời.
- **Đặt hàng & Thanh toán (Checkout)**: Hỗ trợ thanh toán khi nhận hàng (COD) và Chuyển khoản qua mã QR ngân hàng.
- **Đăng ký / Đăng nhập thành viên**: Tích hợp xác thực bảo mật qua JWT Token.

### 2. Giao Diện Quản Trị Viên (Admin Portal - `http://localhost:3000/admin`)
- **Bảo mật phân quyền (RBAC)**: Chỉ tài khoản có vai trò `admin` mới được truy cập và thao tác.
- **Bảng điều khiển (Dashboard)**:
  - 4 Thẻ KPI: Doanh thu thực tế, Tổng đơn hàng, Số mặt hàng trong kho, Khách hàng thành viên.
  - Biểu đồ đường Doanh thu 7 ngày gần nhất (Chart.js).
  - Biểu đồ tròn Tỷ trọng sản phẩm theo danh mục (Chart.js).
  - Bảng đơn hàng mới nhận & Danh sách cảnh báo sản phẩm sắp hết hàng (<15 món).
- **Quản lý Mặt Hàng (Products Management)**:
  - **Thêm sản phẩm mới**: Nhập tên, danh mục, giá bán, giá gốc, số lượng tồn kho, nhãn (HOT, MỚI, SALE), mô tả chi tiết.
  - **Hỗ trợ ảnh kép**: Tải ảnh trực tiếp từ máy tính lên máy chủ (qua thư mục `/uploads`) HOẶC dán link ảnh trực tuyến (Unsplash, CDN).
  - **Chỉnh sửa / Xóa sản phẩm**: Thao tác trực quan với popup xác nhận an toàn.
  - **Bật / Tắt trạng thái bán**: Công tắc switch cho phép ẩn hoặc hiển thị sản phẩm trên web bán hàng trong tích tắc.
- **Quản lý Danh Mục (Categories)**: Thêm mới danh mục hàng hóa kèm icon FontAwesome.
- **Quản lý Đơn Hàng (Orders)**: Lọc đơn theo trạng thái (Chờ xử lý, Đang giao, Đã hoàn thành, Đã hủy) và cập nhật tiến độ giao hàng.
- **Quản lý Phân Quyền (Users)**: Xem danh sách thành viên, chuyển đổi phân quyền giữa Khách hàng và Quản trị viên.

---

## 📁 Cấu Trúc Mã Nguồn

```
d:\Project_E-commerce\
├── server.js              # Máy chủ Express & RESTful API hoàn chỉnh
├── database.js            # Cấu hình SQLite, schema bảng & dữ liệu mẫu ban đầu
├── package.json           # Danh sách thư viện (express, cors, multer, bcryptjs, jsonwebtoken, sqlite3)
├── start.bat              # File chạy nhanh máy chủ cho Windows
├── ecommerce.db           # File cơ sở dữ liệu SQLite (tự động tạo & lưu trữ dữ liệu bền vững)
├── uploads/               # Thư mục chứa hình ảnh sản phẩm được tải lên từ máy tính
├── public/                # Thư mục giao diện tĩnh
│   ├── index.html         # Trang Cửa hàng người dùng (Customer Storefront)
│   ├── admin.html         # Trang Quản trị viên (Admin Portal)
│   ├── css/
│   │   ├── style.css      # CSS hiệu ứng & màu xanh bạc hà cho storefront
│   │   └── admin.css      # CSS bảng điều khiển & biểu đồ cho trang admin
│   └── js/
│       ├── api.js         # Thư viện dùng chung (kết nối API, xác thực token, giỏ hàng, định dạng tiền VNĐ)
│       ├── store.js       # Logic giao diện người dùng (lọc, tìm kiếm, giỏ hàng, đặt hàng)
│       └── admin.js       # Logic giao diện quản trị (thống kê, thêm/sửa/xóa sản phẩm, duyệt đơn)
└── Main/
    └── Index.html         # Trang chuyển hướng tự động sang máy chủ
```

---

## 🛠️ Nền Tảng Công Nghệ Sử Dụng
- **Backend**: Node.js & Express.js
- **Database**: SQLite3 (Nhẹ, không cần cài server rời, ACID bền vững)
- **Authentication**: JWT (JSON Web Tokens) & Mật khẩu mã hóa Bcrypt
- **File Upload**: Multer (Tải ảnh từ máy tính)
- **Frontend**: HTML5, CSS3, Tailwind CSS (Mint Theme), FontAwesome 6, SweetAlert2, Chart.js
