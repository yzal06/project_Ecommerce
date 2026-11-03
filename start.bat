@echo off
chcp 65001 >nul
echo ========================================================
echo  🌿 Đang khởi động hệ thống website bán hàng MintMart...
echo ========================================================
echo.
echo  Giao diện Khách hàng: http://localhost:3000
echo  Giao diện Quản trị viên (Admin): http://localhost:3000/admin
echo.
echo  Cấu hình bảo mật: Vui lòng xem và quản lý trong file .env
echo.
echo ========================================================
npm start
pause
