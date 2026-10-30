@echo off
chcp 65001 >nul
echo ========================================================
echo  🌿 Đang khởi động hệ thống website bán hàng MintMart...
echo ========================================================
echo.
echo  Giao diện Khách hàng: http://localhost:3000
echo  Giao diện Quản trị viên (Admin): http://localhost:3000/admin
echo.
echo  Tài khoản Quản Trị mặc định:
echo  - Email: admin@mintmart.vn
echo  - Mật khẩu: admin123
echo.
echo ========================================================
npm start
pause
