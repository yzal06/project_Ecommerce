/**
 * MintMart - Admin Management Logic
 */

let revenueChartInstance = null;
let categoryChartInstance = null;
let currentAdminTab = 'dashboard';
let cachedProducts = [];
let cachedCategories = [];
let currentOrderFilter = 'all';
let currentProductStatus = 'all';
let searchDebounceTimer = null;

// Mobile Sidebar Drawer Toggle
function toggleAdminSidebar(open) {
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('adminSidebarBackdrop');
    if (!sidebar) return;

    if (open === undefined) {
        open = !sidebar.classList.contains('open');
    }

    if (open) {
        sidebar.classList.add('open');
        if (backdrop) backdrop.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    } else {
        sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
});

// Check Admin Authentication & Enforce Access Restriction
function checkAdminAuth() {
    const user = getCurrentUser();
    const loginScreen = document.getElementById('adminLoginScreen');
    const mainLayout = document.getElementById('adminMainLayout');

    if (user && user.role === 'admin') {
        if (loginScreen) loginScreen.classList.add('hidden');
        if (mainLayout) mainLayout.classList.remove('hidden');
        const nameEl = document.getElementById('sidebarAdminName');
        if (nameEl) nameEl.textContent = user.name;
        initAdminDashboard();
    } else if (user && user.role !== 'admin') {
        // Hạn chế khách hàng hoặc người ngoài không có quyền truy cập vào Cổng Quản Trị
        if (loginScreen) loginScreen.classList.add('hidden');
        if (mainLayout) mainLayout.classList.add('hidden');
        showToast('error', 'Bạn không có quyền truy cập vào Cổng Quản Trị!');
        setTimeout(() => {
            window.location.replace('index.html');
        }, 1200);
    } else {
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (mainLayout) mainLayout.classList.add('hidden');
    }
}

let failedAdminLoginAttempts = 0;
let adminLockoutUntil = 0;

// Handle Admin Login with Protection
async function handleAdminLogin(e) {
    e.preventDefault();

    const now = Date.now();
    if (adminLockoutUntil && now < adminLockoutUntil) {
        const remainingMinutes = Math.ceil((adminLockoutUntil - now) / 60000);
        showToast('error', `Tài khoản tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau ${remainingMinutes} phút.`);
        return;
    }

    const email = (document.getElementById('adminEmailInput').value || '').trim();
    const password = document.getElementById('adminPasswordInput').value || '';

    try {
        const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (!res.user || res.user.role !== 'admin') {
            throw new Error('Tài khoản này không có quyền quản trị viên!');
        }

        failedAdminLoginAttempts = 0;
        adminLockoutUntil = 0;
        setAuth(res.token, res.user);
        showToast('success', `Chào mừng Quản trị viên ${res.user.name}!`);
        checkAdminAuth();
    } catch (err) {
        failedAdminLoginAttempts++;
        if (failedAdminLoginAttempts >= 5) {
            adminLockoutUntil = Date.now() + 5 * 60 * 1000;
            showToast('error', 'Bạn đã nhập sai 5 lần liên tiếp. Cổng quản trị bị tạm khóa 5 phút!');
        } else {
            showToast('error', err.message || 'Đăng nhập quản trị thất bại');
        }
    }
}

// OPEN / CLOSE CHANGE PASSWORD MODAL
function openChangePasswordModal() {
    const user = getAuthUser();
    if (user) {
        const nameInput = document.getElementById('adminNewNameInput');
        const emailInput = document.getElementById('adminNewEmailInput');
        if (nameInput) nameInput.value = user.name || '';
        if (emailInput) emailInput.value = user.email || '';
    }
    const currentPass = document.getElementById('adminCurrentPasswordInput');
    const newPass = document.getElementById('adminNewPasswordInput');
    const confirmPass = document.getElementById('adminConfirmPasswordInput');
    if (currentPass) currentPass.value = '';
    if (newPass) newPass.value = '';
    if (confirmPass) confirmPass.value = '';

    const modal = document.getElementById('adminChangePasswordModal');
    if (modal) modal.classList.remove('hidden');
}

function closeChangePasswordModal() {
    const modal = document.getElementById('adminChangePasswordModal');
    if (modal) modal.classList.add('hidden');
}

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const newName = document.getElementById('adminNewNameInput').value.trim();
    const newEmail = document.getElementById('adminNewEmailInput').value.trim();
    const currentPassword = document.getElementById('adminCurrentPasswordInput').value;
    const newPassword = document.getElementById('adminNewPasswordInput').value;
    const confirmPassword = document.getElementById('adminConfirmPasswordInput').value;

    if (newPassword && newPassword.length < 6) {
        showToast('error', 'Mật khẩu mới phải có tối thiểu 6 ký tự!');
        return;
    }

    if (newPassword && newPassword !== confirmPassword) {
        showToast('error', 'Mật khẩu mới và xác nhận mật khẩu không khớp!');
        return;
    }

    try {
        const res = await apiFetch('/api/auth/change-credentials', {
            method: 'PUT',
            body: JSON.stringify({
                newName,
                newEmail,
                currentPassword,
                newPassword: newPassword || undefined
            })
        });

        if (res.token && res.user) {
            setAuth(res.token, res.user);
        }

        const sidebarName = document.getElementById('sidebarAdminName');
        if (sidebarName && res.user) {
            sidebarName.textContent = res.user.name;
        }

        closeChangePasswordModal();
        showToast('success', 'Đã cập nhật thông tin tài khoản và mật khẩu thành công!');
        if (typeof currentAdminTab !== 'undefined' && currentAdminTab === 'users') {
            loadAdminUsers();
        }
    } catch (err) {
        showToast('error', err.message || 'Lỗi khi cập nhật tài khoản!');
    }
}

// Speaker Notification State
let speakerEnabled = localStorage.getItem('mintmart_speaker_enabled') !== 'false';
let lastKnownOrderIds = new Set();
let lastKnownOrderPaymentStatuses = new Map();
let isWatcherInitialized = false;
let watcherInterval = null;

// BẬT / TẮT LOA THÔNG BÁO BẠN CÓ ĐƠN HÀNG
function toggleSpeakerSound() {
    speakerEnabled = !speakerEnabled;
    localStorage.setItem('mintmart_speaker_enabled', speakerEnabled ? 'true' : 'false');
    updateSpeakerUI();
    if (speakerEnabled) {
        showToast('success', 'Đã bật loa thông báo đơn hàng!');
        playDingDongChime();
    } else {
        showToast('info', 'Đã tắt loa thông báo đơn hàng');
    }
}

function updateSpeakerUI() {
    const icon = document.getElementById('speakerIcon');
    const label = document.getElementById('speakerLabel');
    const btn = document.getElementById('speakerToggleBtn');
    if (!btn) return;

    if (speakerEnabled) {
        btn.className = 'flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition shadow-sm';
        if (icon) icon.className = 'fa-solid fa-volume-high text-emerald-600 animate-pulse';
        if (label) label.textContent = 'Loa: Bật';
    } else {
        btn.className = 'flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200 transition shadow-sm';
        if (icon) icon.className = 'fa-solid fa-volume-xmark text-slate-400';
        if (label) label.textContent = 'Loa: Tắt';
    }
}

// Âm thanh chuông báo đơn mới (Ding-dong chime Web Audio API)
function playDingDongChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Tone 1: 587.33Hz (D5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Tone 2: 880Hz (A5)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.12);
        gain2.gain.setValueAtTime(0.45, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.7);
    } catch (e) {
        console.warn('Web Audio error:', e);
    }
}

// Âm thanh chuông báo thanh toán thành công (Đồng bộ chuẩn chuông Ding-dong với đơn hàng mới)
function playPaymentSuccessChime() {
    playDingDongChime();
}

// Audio cache cho các file giọng nữ Việt Nam phát thanh chuẩn theo đường dẫn
const cachedFemaleAudios = {};

// Tìm kiếm giọng đọc nữ tiếng Việt từ Web Speech API
function getVietnameseFemaleVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    // 1. Google tiếng Việt (Giọng nữ Việt Nam tự nhiên chuẩn của Chrome)
    let v = voices.find(voice => voice.lang.includes('vi') && voice.name.toLowerCase().includes('google'));
    // 2. Microsoft HoaiMy (Giọng nữ Việt Nam chuẩn của Edge/Windows)
    if (!v) v = voices.find(voice => voice.name.includes('HoaiMy') || voice.name.includes('Hoài My'));
    // 3. Giọng nữ tiếng Việt bất kỳ
    if (!v) v = voices.find(voice => voice.lang.startsWith('vi') && (voice.name.toLowerCase().includes('female') || voice.name.toLowerCase().includes('nu')));
    // 4. Bất kỳ giọng tiếng Việt nào
    if (!v) v = voices.find(voice => voice.lang === 'vi-VN' || voice.lang.startsWith('vi'));
    return v;
}

// Khởi tạo giọng nói khi trình duyệt sẵn sàng
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        getVietnameseFemaleVoice();
    };
}

/**
 * Phát file audio giọng nữ Việt Nam chuẩn bản địa theo đường dẫn,
 * fallback sang Web Speech API nếu trình duyệt chặn autoplay hoặc chưa tải file.
 */
function playFemaleVoiceAudio(audioPath, fallbackText) {
    try {
        if (typeof Audio === 'undefined') {
            fallbackWebSpeechFemale(fallbackText);
            return;
        }
        // Dừng audio thông báo khác đang phát để tránh hai giọng nói chồng lên nhau
        Object.values(cachedFemaleAudios).forEach((existingAudio) => {
            if (existingAudio && !existingAudio.paused) {
                existingAudio.pause();
                existingAudio.currentTime = 0;
            }
        });
        if (!cachedFemaleAudios[audioPath]) {
            cachedFemaleAudios[audioPath] = new Audio(audioPath);
        }
        const audio = cachedFemaleAudios[audioPath];
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Đã phát thành công giọng nữ Việt Nam
            }).catch(() => {
                // Fallback nếu trình duyệt yêu cầu tương tác hoặc file chưa nạp
                fallbackWebSpeechFemale(fallbackText);
            });
            return;
        }
    } catch (err) {
        fallbackWebSpeechFemale(fallbackText);
    }
}

// Phát thanh giọng nữ Việt Nam: "Bạn có đơn hàng mới!"
function speakOrderAlert(text = 'Bạn có đơn hàng mới!') {
    playFemaleVoiceAudio('uploads/alert-order-vi.mp3', text);
}

// Fallback sử dụng Web Speech API lọc đúng giọng nữ tiếng Việt
function fallbackWebSpeechFemale(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        
        const femaleVoice = getVietnameseFemaleVoice();
        if (femaleVoice) {
            utterance.voice = femaleVoice;
        }
        
        // Điều chỉnh tần số và tốc độ thanh thoát chuẩn giọng nữ Việt Nam
        utterance.rate = 0.95;
        utterance.pitch = 1.25;
        window.speechSynthesis.speak(utterance);
    }
}

// Kích hoạt chuông + giọng nữ Việt Nam + banner thông báo đơn hàng mới
function triggerNewOrderAlert(order) {
    if (speakerEnabled) {
        playDingDongChime();
        setTimeout(() => {
            speakOrderAlert('Bạn có đơn hàng mới!');
        }, 350);
    }

    // Hiển thị banner góc phải
    const banner = document.getElementById('liveOrderAlertBanner');
    if (banner) {
        const custEl = document.getElementById('alertOrderCustomer');
        const amtEl = document.getElementById('alertOrderAmount');
        if (custEl && order) custEl.textContent = `${order.customer_name} (${order.order_code})`;
        if (amtEl && order) amtEl.textContent = formatCurrency(order.total_amount);
        banner.classList.remove('hidden');
    }
}

function dismissOrderAlert() {
    const banner = document.getElementById('liveOrderAlertBanner');
    if (banner) banner.classList.add('hidden');
}

// Phát thanh thông báo đơn hàng đã thanh toán thành công (giọng nữ Việt Nam chuẩn như đơn mới)
function speakPaymentAlert(text = 'Bạn có đơn hàng đã thanh toán thành công!') {
    playFemaleVoiceAudio('uploads/alert-payment-vi.mp3', text);
}

// Kích hoạt chuông Ding-dong + giọng nữ Việt Nam + banner thông báo thanh toán thành công (đồng bộ như có đơn mới)
function triggerPaymentSuccessAlert(order) {
    if (speakerEnabled) {
        playDingDongChime();
        setTimeout(() => {
            speakPaymentAlert('Bạn có đơn hàng đã thanh toán thành công!');
        }, 350);
    }

    // Hiển thị banner thanh toán thành công góc phải
    const banner = document.getElementById('livePaymentAlertBanner');
    if (banner) {
        const custEl = document.getElementById('alertPaymentCustomer');
        const amtEl = document.getElementById('alertPaymentAmount');
        if (custEl && order) {
            custEl.textContent = `${order.customer_name || 'Khách hàng'} (${order.order_code || ''})`;
        }
        if (amtEl && order) {
            amtEl.textContent = formatCurrency(order.total_amount || 0);
        }
        banner.classList.remove('hidden');
    }

    showToast('success', `💰 Đơn hàng ${order.order_code || ''} đã thanh toán thành công ${formatCurrency(order.total_amount || 0)}!`);
}

function dismissPaymentAlert() {
    const banner = document.getElementById('livePaymentAlertBanner');
    if (banner) banner.classList.add('hidden');
}

function testOrderSound() {
    playDingDongChime();
    setTimeout(() => {
        speakOrderAlert('Bạn có đơn hàng mới!');
    }, 350);
    showToast('info', '🔊 Đang phát thông báo giọng nữ Việt Nam: "Bạn có đơn hàng mới!"');
}

function testPaymentSound() {
    playDingDongChime();
    setTimeout(() => {
        speakPaymentAlert('Bạn có đơn hàng đã thanh toán thành công!');
    }, 350);
    showToast('success', '🔊 Đang phát thông báo giọng nữ Việt Nam: "Bạn có đơn hàng đã thanh toán thành công!"');
}

// Tự động kiểm tra đơn hàng mới & thanh toán thành công trong nền
function startOrderNotificationWatcher() {
    if (isWatcherInitialized) return;
    isWatcherInitialized = true;

    // Load initial orders
    apiFetch('/api/orders').then(res => {
        const orders = res.orders || [];
        orders.forEach(o => {
            const key = o.id || o.order_code;
            lastKnownOrderIds.add(key);
            lastKnownOrderPaymentStatuses.set(key, o.payment_status || 'pending');
        });
    }).catch(() => {});

    // Poll every 6 seconds
    if (watcherInterval) clearInterval(watcherInterval);
    watcherInterval = setInterval(async () => {
        try {
            const res = await apiFetch('/api/orders');
            const orders = res.orders || [];
            let foundNew = false;
            let latestNewOrder = null;
            let newlyPaidOrder = null;

            for (const o of orders) {
                const key = o.id || o.order_code;
                const isPaid = o.payment_status === 'paid';
                const prevStatus = lastKnownOrderPaymentStatuses.get(key);

                if (!lastKnownOrderIds.has(key)) {
                    // New order
                    lastKnownOrderIds.add(key);
                    lastKnownOrderPaymentStatuses.set(key, o.payment_status || 'pending');
                    foundNew = true;
                    latestNewOrder = o;
                    if (isPaid) {
                        newlyPaidOrder = o;
                    }
                } else if (prevStatus !== 'paid' && isPaid) {
                    // Existing order changed to paid
                    lastKnownOrderPaymentStatuses.set(key, 'paid');
                    newlyPaidOrder = o;
                }
            }

            if (newlyPaidOrder) {
                triggerPaymentSuccessAlert(newlyPaidOrder);
                // Refresh views
                if (currentAdminTab === 'orders') loadAdminOrders();
                if (currentAdminTab === 'dashboard') loadDashboardStats();
                if (currentAdminTab === 'marketplace') loadMarketplaceRevenueTables();
            } else if (foundNew && latestNewOrder) {
                triggerNewOrderAlert(latestNewOrder);
                // Refresh views
                if (currentAdminTab === 'orders') loadAdminOrders();
                if (currentAdminTab === 'dashboard') loadDashboardStats();
                if (currentAdminTab === 'marketplace') loadMarketplaceRevenueTables();
            }
        } catch (e) {}
    }, 6000);

    // Also listen to storage events (Cross-tab instant sync)
    window.addEventListener('storage', (e) => {
        if (e.key === 'mintmart_last_paid_order') {
            try {
                const paidOrder = JSON.parse(e.newValue || '{}');
                if (paidOrder && (paidOrder.id || paidOrder.order_code)) {
                    const key = paidOrder.id || paidOrder.order_code;
                    const prevStatus = lastKnownOrderPaymentStatuses.get(key);
                    if (prevStatus !== 'paid') {
                        lastKnownOrderIds.add(key);
                        lastKnownOrderPaymentStatuses.set(key, 'paid');
                        triggerPaymentSuccessAlert(paidOrder);
                        if (currentAdminTab === 'orders') loadAdminOrders();
                        if (currentAdminTab === 'dashboard') loadDashboardStats();
                        if (currentAdminTab === 'marketplace') loadMarketplaceRevenueTables();
                    }
                }
            } catch (err) {}
        }

        if (e.key === 'mintmart_mock_orders_v2') {
            try {
                const orders = JSON.parse(e.newValue || '[]');
                if (orders.length > 0) {
                    const latest = orders[0];
                    const key = latest.id || latest.order_code;
                    const isPaid = latest.payment_status === 'paid';
                    const prevStatus = lastKnownOrderPaymentStatuses.get(key);

                    if (!lastKnownOrderIds.has(key)) {
                        lastKnownOrderIds.add(key);
                        lastKnownOrderPaymentStatuses.set(key, latest.payment_status || 'pending');
                        if (isPaid) {
                            triggerPaymentSuccessAlert(latest);
                        } else {
                            triggerNewOrderAlert(latest);
                        }
                        if (currentAdminTab === 'orders') loadAdminOrders();
                        if (currentAdminTab === 'dashboard') loadDashboardStats();
                    } else if (prevStatus !== 'paid' && isPaid) {
                        lastKnownOrderPaymentStatuses.set(key, 'paid');
                        triggerPaymentSuccessAlert(latest);
                        if (currentAdminTab === 'orders') loadAdminOrders();
                        if (currentAdminTab === 'dashboard') loadDashboardStats();
                    }
                }
            } catch (err) {}
        }
        if (e.key === 'mintmart_web_analytics_delta_v2' || e.key === 'mintmart_web_analytics_v2') {
            if (currentAdminTab === 'dashboard' && typeof loadCustomerWebReport === 'function') {
                loadCustomerWebReport();
            }
        }
    });
}

// Handle Admin Logout
function handleAdminLogout() {
    clearAuth();
    if (watcherInterval) clearInterval(watcherInterval);
    showToast('info', 'Đã đăng xuất khỏi cổng quản trị');
    checkAdminAuth();
}

// Initialize Admin Portal
async function initAdminDashboard() {
    updateSpeakerUI();
    await loadAdminCategories();
    switchAdminTab('dashboard');
    startOrderNotificationWatcher();
}

// Switch Tabs
function switchAdminTab(tabName) {
    currentAdminTab = tabName;
    toggleAdminSidebar(false); // Auto close mobile drawer when selecting tab

    // Reset sidebar link classes & mobile bottom nav
    const tabs = ['dashboard', 'products', 'categories', 'orders', 'users', 'marketplace'];
    tabs.forEach(t => {
        const navEl = document.getElementById(`navTab-${t}`);
        const contentEl = document.getElementById(`tabContent-${t}`);
        const mobEl = document.getElementById(`mobileNav-${t}`);
        if (navEl) navEl.classList.remove('active');
        if (contentEl) contentEl.classList.add('hidden');
        if (mobEl) mobEl.classList.remove('active');
    });

    const activeNav = document.getElementById(`navTab-${tabName}`);
    const activeContent = document.getElementById(`tabContent-${tabName}`);
    const activeMob = document.getElementById(`mobileNav-${tabName}`);
    if (activeNav) activeNav.classList.add('active');
    if (activeContent) activeContent.classList.remove('hidden');
    if (activeMob) activeMob.classList.add('active');

    // Title & Breadcrumb
    const pageTitle = document.getElementById('adminPageTitle');
    const breadcrumb = document.getElementById('adminBreadcrumb');

    const titles = {
        dashboard: 'Bảng Điều Khiển Tổng Quan',
        products: 'Quản Lý Mặt Hàng & Sản Phẩm',
        categories: 'Quản Lý Danh Mục Mặt Hàng',
        orders: 'Quản Lý Đơn Hàng & Vận Chuyển',
        users: 'Quản Lý Tài Khoản & Phân Quyền',
        marketplace: 'Đồng Bộ Tồn Kho Đa Kênh (Shopee & Lazada)'
    };

    if (pageTitle) pageTitle.textContent = titles[tabName] || 'Quản Trị';
    if (breadcrumb) breadcrumb.textContent = `MintMart > Quản Trị > ${titles[tabName]}`;

    // Load data specific to tab
    if (tabName === 'dashboard') {
        loadDashboardStats();
    } else if (tabName === 'products') {
        loadAdminProducts();
    } else if (tabName === 'categories') {
        renderAdminCategories();
    } else if (tabName === 'orders') {
        loadAdminOrders();
    } else if (tabName === 'users') {
        loadAdminUsers();
    } else if (tabName === 'marketplace') {
        loadMarketplaceTab();
    }
}

// Load Categories
async function loadAdminCategories() {
    try {
        const res = await apiFetch('/api/categories');
        cachedCategories = res.categories || [];

        // Category filter in products toolbar
        const catFilter = document.getElementById('adminProductCatFilter');
        if (catFilter) {
            catFilter.innerHTML = `<option value="all">Tất cả danh mục</option>` +
                cachedCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        // Category select in modal
        const prodCatSelect = document.getElementById('prodCategory');
        if (prodCatSelect) {
            prodCatSelect.innerHTML = cachedCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
    } catch (e) {
        console.error('Lỗi tải danh mục admin:', e);
    }
}

/* ========================================================
   DASHBOARD OVERVIEW
   ======================================================== */

async function loadDashboardStats() {
    try {
        const res = await apiFetch('/api/stats/dashboard');
        const s = res.stats;

        // KPI stats
        document.getElementById('statTotalRevenue').textContent = formatCurrency(s.totalRevenue);
        document.getElementById('statTotalOrders').textContent = s.totalOrders;
        document.getElementById('statTotalProducts').textContent = s.totalProducts;
        document.getElementById('statTotalCustomers').textContent = s.totalCustomers;

        // Subtitles dynamically updated based on real values
        const revSub = document.getElementById('statRevenueSubtitle');
        if (revSub) {
            if (s.totalRevenue > 0) {
                revSub.innerHTML = `<i class="fa-solid fa-arrow-trend-up mr-1"></i> Doanh thu thực tế tích lũy`;
                revSub.className = "text-[11px] text-emerald-600 font-bold flex items-center mt-1";
            } else {
                revSub.innerHTML = `<i class="fa-solid fa-coins mr-1"></i> Bắt đầu từ 0 ₫`;
                revSub.className = "text-[11px] text-slate-400 font-medium flex items-center mt-1";
            }
        }

        const ordSub = document.getElementById('statOrdersSubtitle');
        if (ordSub) {
            if (s.totalOrders > 0) {
                ordSub.innerHTML = `<i class="fa-solid fa-check-circle mr-1"></i> ${s.totalOrders} đơn hàng thực tế`;
                ordSub.className = "text-[11px] text-emerald-600 font-bold flex items-center mt-1";
            } else {
                ordSub.innerHTML = `<i class="fa-solid fa-cart-shopping mr-1"></i> Chưa có đơn hàng phát sinh`;
                ordSub.className = "text-[11px] text-slate-400 font-medium flex items-center mt-1";
            }
        }

        const custSub = document.getElementById('statCustomersSubtitle');
        if (custSub) {
            if (s.totalCustomers > 0) {
                custSub.innerHTML = `<i class="fa-solid fa-user-plus mr-1"></i> ${s.totalCustomers} khách hàng thành viên`;
                custSub.className = "text-[11px] text-emerald-600 font-bold flex items-center mt-1";
            } else {
                custSub.innerHTML = `<i class="fa-solid fa-users mr-1"></i> Chưa có khách hàng đăng ký`;
                custSub.className = "text-[11px] text-slate-400 font-medium flex items-center mt-1";
            }
        }

        // Badges in sidebar
        const sbProd = document.getElementById('sidebarProductCount');
        if (sbProd) sbProd.textContent = s.totalProducts;
        const sbOrd = document.getElementById('sidebarOrderCount');
        if (sbOrd) sbOrd.textContent = s.totalOrders;

        // Render Recent Orders in Dashboard
        const recentOrdersBody = document.getElementById('dashboardRecentOrdersBody');
        if (recentOrdersBody) {
            if (s.recentOrders.length === 0) {
                recentOrdersBody.innerHTML = `<tr><td colspan="7" class="py-4 text-center text-slate-400">Chưa có đơn hàng nào</td></tr>`;
            } else {
                recentOrdersBody.innerHTML = s.recentOrders.map(o => `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="py-2.5 px-3 font-bold text-emerald-700 whitespace-nowrap">${o.order_code}</td>
                        <td class="py-2.5 px-3">
                            <div class="font-bold text-slate-700">${o.customer_name}</div>
                            <div class="text-[10px] text-emerald-600 font-semibold flex items-center">
                                <i class="fa-solid fa-phone text-[9px] mr-1"></i>${o.customer_phone}
                            </div>
                        </td>
                        <td class="py-2.5 px-3">
                            <div class="text-slate-600 text-[11px] truncate max-w-[170px] flex items-center" title="${o.shipping_address || ''}">
                                <i class="fa-solid fa-location-dot text-rose-500 mr-1 text-[10px] shrink-0"></i>
                                <span>${o.shipping_address || '<span class="text-slate-300 italic">Chưa có</span>'}</span>
                            </div>
                        </td>
                        <td class="py-2.5 px-3">
                            ${o.note && o.note.trim() ? `
                                <div class="text-amber-800 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 truncate max-w-[130px]" title="${o.note}">
                                    <i class="fa-solid fa-note-sticky text-amber-500 mr-1 text-[9px]"></i>${o.note}
                                </div>
                            ` : `<span class="text-slate-300 text-[10px] italic">Không</span>`}
                        </td>
                        <td class="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">${formatCurrency(o.total_amount)}</td>
                        <td class="py-2.5 px-3 whitespace-nowrap">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(o.status)}">
                                ${getStatusText(o.status)}
                            </span>
                        </td>
                        <td class="py-2.5 px-3 text-right whitespace-nowrap">
                            <button onclick="viewOrderDetail(${o.id})" class="text-emerald-600 hover:text-emerald-800 font-bold text-xs flex items-center ml-auto">
                                <i class="fa-solid fa-eye mr-1 text-[10px]"></i> Chi tiết
                            </button>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // Render Low Stock alert
        const lowStockList = document.getElementById('dashboardLowStockList');
        if (lowStockList) {
            if (s.lowStockProducts.length === 0) {
                lowStockList.innerHTML = `<div class="text-xs text-slate-400 text-center py-4">Kho hàng dồi dào, không có mặt hàng thiếu hụt.</div>`;
            } else {
                lowStockList.innerHTML = s.lowStockProducts.map(p => `
                    <div class="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100">
                        <div class="flex items-center space-x-2.5 min-w-0">
                            <img src="${p.image_url}" alt="${p.name}" class="w-8 h-8 rounded-lg object-cover bg-white">
                            <div class="min-w-0">
                                <div class="font-bold text-slate-700 text-xs truncate max-w-[150px]">${p.name}</div>
                                <div class="text-[10px] text-slate-400">${formatCurrency(p.price)}</div>
                            </div>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-black ${p.stock <= 5 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}">
                            Còn ${p.stock}
                        </span>
                    </div>
                `).join('');
            }
        }

        // Render Customer Website Views & Revenue Report
        if (s.customerWebReport) {
            renderCustomerWebReport(s.customerWebReport);
        } else {
            await loadCustomerWebReport();
        }

        // Init / Update 2 Separate 7-Day Marketplace Tables & Charts
        await load7DayMarketplaceRevenue(s.marketplace7Days);

        // Init / Update Category Chart
        initCategoryChart(s.salesByCategory);

    } catch (err) {
        console.error('Lỗi tải thống kê dashboard:', err);
    }
}

// Global instances for charts & Customer Web report state
let shopee7DayChartInstance = null;
let lazada7DayChartInstance = null;
let webCustomer7DayChartInstance = null;
let currentWebReportMode = 'daily';
let cachedCustomerWebReport = null;

function escapeAdminHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function formatGrowthBadgeHtml(growth) {
    const text = String(growth || '0%');
    const colorClass = text.startsWith('+')
        ? 'text-emerald-600'
        : (text.startsWith('-') ? 'text-rose-500' : 'text-slate-400');
    const iconHtml = text.startsWith('+')
        ? '<i class="fa-solid fa-arrow-up text-[9px] mr-0.5"></i>'
        : (text.startsWith('-') ? '<i class="fa-solid fa-arrow-down text-[9px] mr-0.5"></i>' : '');
    return `<span class="inline-flex items-center whitespace-nowrap text-[11px] font-bold ${colorClass}">${iconHtml}${escapeAdminHtml(text)}</span>`;
}

function switchCustomerWebTableMode(mode) {
    currentWebReportMode = mode === 'products' ? 'products' : 'daily';
    const isDaily = currentWebReportMode === 'daily';

    const btnDaily = document.getElementById('btnWebModeDaily');
    const btnProducts = document.getElementById('btnWebModeProducts');
    const dailyWrap = document.getElementById('webCustomerDailyTableWrap');
    const productsWrap = document.getElementById('webCustomerProductsTableWrap');

    const activeCls = 'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-sm transition-all whitespace-nowrap';
    const inactiveCls = 'px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition-all whitespace-nowrap';

    if (btnDaily) btnDaily.className = isDaily ? activeCls : inactiveCls;
    if (btnProducts) btnProducts.className = isDaily ? inactiveCls : activeCls;
    if (dailyWrap) dailyWrap.classList.toggle('hidden', !isDaily);
    if (productsWrap) productsWrap.classList.toggle('hidden', isDaily);
}

function renderCustomerWebChart(daily) {
    const canvas = document.getElementById('webCustomer7DayChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const rows = Array.isArray(daily) ? daily : [];
    const labels = rows.map(d => d.dayLabel || d.dateKey || '');
    const visitsData = rows.map(d => Number(d.page_views) || 0);
    const productViewsData = rows.map(d => Number(d.product_views) || 0);
    const revenueData = rows.map(d => Number(d.revenue) || 0);

    if (webCustomer7DayChartInstance) {
        webCustomer7DayChartInstance.destroy();
    }

    webCustomer7DayChartInstance = new Chart(canvas, {
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Doanh thu Web (VNĐ)',
                    data: revenueData,
                    backgroundColor: 'rgba(16, 185, 129, 0.25)',
                    borderColor: '#10B981',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    yAxisID: 'y1',
                    order: 2
                },
                {
                    type: 'line',
                    label: 'Lượt truy cập Web',
                    data: visitsData,
                    borderColor: '#047857',
                    backgroundColor: 'rgba(4, 120, 87, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    pointBackgroundColor: '#047857',
                    pointRadius: 3.5,
                    yAxisID: 'y',
                    order: 1
                },
                {
                    type: 'line',
                    label: 'Lượt xem SP',
                    data: productViewsData,
                    borderColor: '#0EA5E9',
                    backgroundColor: 'rgba(14, 165, 233, 0.08)',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    tension: 0.35,
                    pointBackgroundColor: '#0EA5E9',
                    pointRadius: 3,
                    yAxisID: 'y',
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, padding: 10, font: { size: 11, weight: 'bold' } }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const label = ctx.dataset.label || '';
                            const val = ctx.parsed.y || 0;
                            if (ctx.dataset.yAxisID === 'y1') {
                                return `${label}: ${formatCurrency(val)}`;
                            }
                            return `${label}: ${val.toLocaleString('vi-VN')} lượt`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: { size: 10 },
                        callback: (val) => `${val} lượt`
                    },
                    grid: { color: '#ECFDF5' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    suggestedMax: 100000,
                    grid: { drawOnChartArea: false },
                    ticks: {
                        precision: 0,
                        font: { size: 10 },
                        callback: (val) => {
                            if (val === 0) return '0 ₫';
                            if (val >= 1000000) return `${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)} Tr`;
                            if (val >= 1000) return `${Math.round(val / 1000)} k`;
                            return `${Math.round(val)} ₫`;
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } }
                }
            }
        }
    });
}

function renderCustomerWebReport(report) {
    if (!report || !report.summary) return;
    cachedCustomerWebReport = report;

    const sum = report.summary;
    const daily = Array.isArray(report.daily) ? report.daily : [];
    const products = Array.isArray(report.products) ? report.products : [];

    // 4 ô tóm tắt trên cùng
    setElementText('webSummaryTotalVisits', `${(Number(sum.all_time_page_views) || 0).toLocaleString('vi-VN')} lượt`);
    setElementText('webSummaryTodayVisits', `Hôm nay: ${(Number(sum.today_page_views) || 0).toLocaleString('vi-VN')} lượt`);
    setElementText('webSummaryProductViews', `${(Number(sum.all_time_product_views) || 0).toLocaleString('vi-VN')} lượt`);
    setElementText('webSummary7DayProductViews', `7 ngày: ${(Number(sum.days7_product_views) || 0).toLocaleString('vi-VN')} lượt`);
    setElementText('webSummaryTotalOrders', `${(Number(sum.all_time_orders) || 0).toLocaleString('vi-VN')} đơn`);
    setElementText('webSummaryConversion', `Tỷ lệ chốt: ${sum.conversion_rate || '0'}%`);
    setElementText('webSummaryTotalRevenue', formatCurrency(sum.all_time_revenue || 0));
    setElementText('webSummary7DayRevenue', `7 ngày: ${formatCurrency(sum.days7_revenue || 0)}`);

    // Biểu đồ 7 ngày
    renderCustomerWebChart(daily);

    // Chế độ 1: Bảng 7 ngày
    const dailyTbody = document.getElementById('webCustomer7DayTableBody');
    if (dailyTbody) {
        dailyTbody.innerHTML = daily.map(d => `
            <tr class="${d.is_today ? 'bg-emerald-50/40' : ''} hover:bg-emerald-50/30 transition">
                <td class="py-2.5 px-3 whitespace-nowrap">
                    <div class="flex items-center gap-1.5 whitespace-nowrap">
                        <span class="font-bold text-slate-800 whitespace-nowrap">${escapeAdminHtml(d.dayLabel)}</span>
                        ${d.is_today ? '<span class="inline-block whitespace-nowrap bg-emerald-100 text-emerald-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded">Hôm nay</span>' : ''}
                    </div>
                    <span class="text-[10px] text-slate-400 block whitespace-nowrap">${escapeAdminHtml(d.date)}</span>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="inline-block whitespace-nowrap bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold text-[11px]">${(Number(d.page_views) || 0).toLocaleString('vi-VN')} lượt</span>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="inline-block whitespace-nowrap bg-teal-100 text-teal-800 px-2.5 py-0.5 rounded-full font-bold text-[11px]">${(Number(d.product_views) || 0).toLocaleString('vi-VN')} lượt</span>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="font-bold text-slate-800 whitespace-nowrap">${Number(d.orders) || 0} đơn</span>
                    <span class="text-[10px] text-slate-400 block whitespace-nowrap">${Number(d.units) || 0} sp</span>
                </td>
                <td class="py-2.5 px-3 text-right whitespace-nowrap">
                    <strong class="font-black text-emerald-600 text-xs whitespace-nowrap">${formatCurrency(d.revenue || 0)}</strong>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    ${formatGrowthBadgeHtml(d.growth)}
                </td>
            </tr>
        `).join('');
    }

    setElementText('web7DayFooterVisits', `${(Number(sum.days7_page_views) || 0).toLocaleString('vi-VN')} lượt`);
    setElementText('web7DayFooterProductViews', `${(Number(sum.days7_product_views) || 0).toLocaleString('vi-VN')} lượt`);
    setElementText('web7DayFooterOrders', `${Number(sum.days7_orders) || 0} đơn / ${Number(sum.days7_units) || 0} sp`);
    setElementText('web7DayFooterRevenue', formatCurrency(sum.days7_revenue || 0));

    const growthFooter = document.getElementById('web7DayFooterGrowth');
    if (growthFooter) {
        if ((Number(sum.days7_revenue) || 0) > 0) {
            growthFooter.innerHTML = '<i class="fa-solid fa-arrow-trend-up mr-1"></i> Hoạt động tốt';
            growthFooter.className = 'py-3 px-3 text-center text-emerald-600 font-bold whitespace-nowrap';
        } else {
            growthFooter.textContent = '0%';
            growthFooter.className = 'py-3 px-3 text-center text-slate-400 font-bold whitespace-nowrap';
        }
    }

    // Chế độ 2: Bảng theo sản phẩm
    const prodTbody = document.getElementById('webCustomerProductsTableBody');
    let totalProdViews = 0;
    let totalProdSold = 0;
    let totalProdRev = 0;

    if (prodTbody) {
        if (products.length === 0) {
            prodTbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400">Chưa có dữ liệu sản phẩm để thống kê.</td></tr>';
        } else {
            prodTbody.innerHTML = products.map(p => {
                const views = Number(p.view_count) || 0;
                const sold = Number(p.sold_count) || 0;
                const rev = Number(p.revenue) || 0;
                const stock = Number(p.stock) || 0;
                totalProdViews += views;
                totalProdSold += sold;
                totalProdRev += rev;

                const stockBadge = !p.is_active
                    ? '<span class="inline-block whitespace-nowrap bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold">Tạm ẩn</span>'
                    : (stock <= 0
                        ? '<span class="inline-block whitespace-nowrap bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full text-[10px] font-bold">Hết hàng</span>'
                        : `<span class="inline-block whitespace-nowrap bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">${stock} sp</span>`);

                return `
                    <tr class="hover:bg-emerald-50/30 transition">
                        <td class="py-2.5 px-3 whitespace-nowrap">
                            <div class="flex items-center space-x-2.5">
                                <img src="${escapeAdminHtml(p.image_url || 'https://placehold.co/40x40?text=MM')}" onerror="this.src='https://placehold.co/40x40?text=MM'" class="w-9 h-9 rounded-lg object-cover border border-slate-100 shrink-0" alt="">
                                <div class="min-w-0">
                                    <p class="font-bold text-slate-800 truncate max-w-[180px] sm:max-w-[220px]">${escapeAdminHtml(p.name)}</p>
                                    <span class="text-[10px] text-slate-400">${escapeAdminHtml(p.category_name || 'Khác')}</span>
                                </div>
                            </div>
                        </td>
                        <td class="py-2.5 px-3 text-right font-semibold text-slate-700 whitespace-nowrap">${formatCurrency(p.price || 0)}</td>
                        <td class="py-2.5 px-3 text-center whitespace-nowrap">
                            <span class="inline-block whitespace-nowrap bg-teal-100 text-teal-800 px-2.5 py-0.5 rounded-full font-bold text-[11px]">${views.toLocaleString('vi-VN')} lượt</span>
                        </td>
                        <td class="py-2.5 px-3 text-center whitespace-nowrap">
                            <span class="inline-block whitespace-nowrap bg-sky-100 text-sky-800 px-2.5 py-0.5 rounded-full font-bold text-[11px]">${sold.toLocaleString('vi-VN')} sp</span>
                        </td>
                        <td class="py-2.5 px-3 text-right whitespace-nowrap">
                            <strong class="font-black text-emerald-600 text-xs whitespace-nowrap">${formatCurrency(rev)}</strong>
                        </td>
                        <td class="py-2.5 px-3 text-center whitespace-nowrap">${stockBadge}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    setElementText('webProductsFooterViews', `${totalProdViews.toLocaleString('vi-VN')} lượt`);
    setElementText('webProductsFooterSold', `${totalProdSold.toLocaleString('vi-VN')} sp`);
    setElementText('webProductsFooterRevenue', formatCurrency(totalProdRev));
}

async function loadCustomerWebReport() {
    try {
        const res = await apiFetch('/api/stats/customer-web');
        if (res && res.success) {
            renderCustomerWebReport(res);
        }
    } catch (err) {
        console.error('Lỗi tải báo cáo trang web khách hàng:', err);
    }
}

async function refreshCustomerWebReport() {
    const btn = document.getElementById('btnRefreshWebReport');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-rotate fa-spin mr-1.5"></i>Đang tải...';
    }
    try {
        if (typeof isStaticOrGitHubPages === 'function' && isStaticOrGitHubPages() && typeof syncFromCloud === 'function') {
            await syncFromCloud(true);
        }
        await loadDashboardStats();
        if (typeof showToast === 'function') {
            showToast('success', 'Đã cập nhật số lần xem & doanh thu trang web khách hàng!');
        }
    } catch (err) {
        console.error('Lỗi làm mới báo cáo web khách hàng:', err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate mr-1.5"></i>Làm mới';
        }
    }
}

// LOAD VÀ RENDER 2 BẢNG DOANH THU 7 NGÀY GẦN NHẤT RIÊNG BIỆT CHO SHOPEE & LAZADA
async function load7DayMarketplaceRevenue(initialData = null) {
    let data = initialData;
    if (!data) {
        try {
            data = await apiFetch('/api/marketplace/revenue-7days');
        } catch (err) {
            console.error('Không thể tải doanh thu 7 ngày 2 sàn:', err);
            return;
        }
    }

    if (!data || !data.shopee || !data.lazada) return;

    const days = data.days || [];
    const shp = data.shopee;
    const laz = data.lazada;

    // 1. Render Shopee Table & KPIs
    const shpTotalEl = document.getElementById('shopee7DayTotal');
    const shpOrdersEl = document.getElementById('shopee7DayTotalOrders');
    const shpUnitsEl = document.getElementById('shopee7DayTotalUnits');
    const shpFooterEl = document.getElementById('shopee7DayTotalRevFooter');
    const shpTableBody = document.getElementById('shopee7DayTableBody');

    if (shpTotalEl) shpTotalEl.textContent = formatCurrency(shp.total_revenue);
    if (shpOrdersEl) shpOrdersEl.textContent = `${shp.total_orders} đơn`;
    if (shpUnitsEl) shpUnitsEl.textContent = `${shp.total_units} sp`;
    if (shpFooterEl) shpFooterEl.textContent = formatCurrency(shp.total_revenue);

    const shpGrowthFooter = document.getElementById('shopee7DayGrowthFooter');
    if (shpGrowthFooter) {
        if (shp.total_revenue > 0) {
            shpGrowthFooter.innerHTML = `<i class="fa-solid fa-arrow-trend-up mr-1"></i> Tăng trưởng thực tế`;
            shpGrowthFooter.className = "py-2.5 px-3 text-center text-emerald-600 font-bold whitespace-nowrap";
        } else {
            shpGrowthFooter.textContent = '0%';
            shpGrowthFooter.className = "py-2.5 px-3 text-center text-slate-400 font-bold whitespace-nowrap";
        }
    }

    if (shpTableBody && shp.daily) {
        shpTableBody.innerHTML = shp.daily.map(d => `
            <tr class="hover:bg-orange-50/40 transition">
                <td class="py-2.5 px-3 whitespace-nowrap">
                    <span class="font-bold text-slate-800 whitespace-nowrap">${d.dayLabel}</span>
                    <span class="text-[10px] text-slate-400 block whitespace-nowrap">${d.date}</span>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="font-bold text-slate-800 whitespace-nowrap">${d.orders}</span>
                    ${d.real_synced_orders > 0 ? `<span class="text-[9px] text-orange-600 font-bold block whitespace-nowrap">(+${d.real_synced_orders} web)</span>` : ''}
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="inline-block whitespace-nowrap bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-bold text-[10px]">${d.units} sp</span>
                </td>
                <td class="py-2.5 px-3 text-right whitespace-nowrap">
                    <strong class="font-black text-orange-600 text-xs whitespace-nowrap">${formatCurrency(d.revenue)}</strong>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="inline-flex items-center whitespace-nowrap text-[11px] font-bold ${d.growth.startsWith('+') ? 'text-emerald-600' : (d.growth.startsWith('-') ? 'text-rose-500' : 'text-slate-400')}">
                        ${d.growth.startsWith('+') ? '<i class="fa-solid fa-arrow-up text-[9px] mr-0.5"></i>' : (d.growth.startsWith('-') ? '<i class="fa-solid fa-arrow-down text-[9px] mr-0.5"></i>' : '')}${d.growth}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    // 2. Render Lazada Table & KPIs
    const lazTotalEl = document.getElementById('lazada7DayTotal');
    const lazOrdersEl = document.getElementById('lazada7DayTotalOrders');
    const lazUnitsEl = document.getElementById('lazada7DayTotalUnits');
    const lazFooterEl = document.getElementById('lazada7DayTotalRevFooter');
    const lazTableBody = document.getElementById('lazada7DayTableBody');

    if (lazTotalEl) lazTotalEl.textContent = formatCurrency(laz.total_revenue);
    if (lazOrdersEl) lazOrdersEl.textContent = `${laz.total_orders} đơn`;
    if (lazUnitsEl) lazUnitsEl.textContent = `${laz.total_units} sp`;
    if (lazFooterEl) lazFooterEl.textContent = formatCurrency(laz.total_revenue);

    if (lazTableBody && laz.daily) {
        lazTableBody.innerHTML = laz.daily.map(d => `
            <tr class="hover:bg-indigo-50/40 transition">
                <td class="py-2.5 px-3 whitespace-nowrap">
                    <span class="font-bold text-slate-800 whitespace-nowrap">${d.dayLabel}</span>
                    <span class="text-[10px] text-slate-400 block whitespace-nowrap">${d.date}</span>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="font-bold text-slate-800 whitespace-nowrap">${d.orders}</span>
                    ${d.real_synced_orders > 0 ? `<span class="text-[9px] text-indigo-600 font-bold block whitespace-nowrap">(+${d.real_synced_orders} web)</span>` : ''}
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="inline-block whitespace-nowrap bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold text-[10px]">${d.units} sp</span>
                </td>
                <td class="py-2.5 px-3 text-right whitespace-nowrap">
                    <strong class="font-black text-indigo-600 text-xs whitespace-nowrap">${formatCurrency(d.revenue)}</strong>
                </td>
                <td class="py-2.5 px-3 text-center whitespace-nowrap">
                    <span class="inline-flex items-center whitespace-nowrap text-[11px] font-bold ${d.growth.startsWith('+') ? 'text-emerald-600' : (d.growth.startsWith('-') ? 'text-rose-500' : 'text-slate-400')}">
                        ${d.growth.startsWith('+') ? '<i class="fa-solid fa-arrow-up text-[9px] mr-0.5"></i>' : (d.growth.startsWith('-') ? '<i class="fa-solid fa-arrow-down text-[9px] mr-0.5"></i>' : '')}${d.growth}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    // 3. Render Mini Trend Charts & Comparison Chart
    if (typeof Chart !== 'undefined') {
        const shpRevs = (shp.daily || []).map(d => d.revenue);
        const lazRevs = (laz.daily || []).map(d => d.revenue);

        const formatChartTick = (val) => {
            if (val === 0) return '0 ₫';
            if (val >= 1000000) return (val / 1000000) + ' Tr';
            if (val >= 1000) return (val / 1000) + ' k';
            return val + ' ₫';
        };

        // Mini Shopee Chart
        const shpCanvas = document.getElementById('shopee7DayChart');
        if (shpCanvas) {
            if (shopee7DayChartInstance) shopee7DayChartInstance.destroy();
            shopee7DayChartInstance = new Chart(shpCanvas, {
                type: 'line',
                data: {
                    labels: days,
                    datasets: [{
                        label: 'Shopee (VNĐ)',
                        data: shpRevs,
                        borderColor: '#EA580C',
                        backgroundColor: 'rgba(234, 88, 12, 0.1)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#EA580C',
                        pointRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            ticks: { callback: formatChartTick, font: { size: 9 } },
                            grid: { color: '#FFF7ED' }
                        },
                        x: { grid: { display: false }, font: { size: 9 } }
                    }
                }
            });
        }

        // Mini Lazada Chart
        const lazCanvas = document.getElementById('lazada7DayChart');
        if (lazCanvas) {
            if (lazada7DayChartInstance) lazada7DayChartInstance.destroy();
            lazada7DayChartInstance = new Chart(lazCanvas, {
                type: 'line',
                data: {
                    labels: days,
                    datasets: [{
                        label: 'Lazada (VNĐ)',
                        data: lazRevs,
                        borderColor: '#6366F1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#6366F1',
                        pointRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: {
                            ticks: { callback: formatChartTick, font: { size: 9 } },
                            grid: { color: '#EEF2FF' }
                        },
                        x: { grid: { display: false }, font: { size: 9 } }
                    }
                }
            });
        }

        // Comparison Chart
        initRevenueComparisonChart(days, shpRevs, lazRevs);
    }
}

function initRevenueComparisonChart(labels, shpData, lazData) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    const formatCompTick = (val) => {
        if (val === 0) return '0 ₫';
        if (val >= 1000000) return (val / 1000000) + ' Tr';
        if (val >= 1000) return (val / 1000) + ' k';
        return val + ' ₫';
    };

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Doanh thu Shopee',
                    data: shpData,
                    borderColor: '#F97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.12)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.35,
                    pointBackgroundColor: '#F97316',
                    pointRadius: 4
                },
                {
                    label: 'Doanh thu Lazada (Tạm ẩn)',
                    data: lazData,
                    borderColor: '#6366F1',
                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.35,
                    pointBackgroundColor: '#6366F1',
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { font: { size: 11, weight: 'bold' } }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: formatCompTick,
                        font: { size: 10 }
                    },
                    grid: { color: '#F1F5F9' }
                },
                x: {
                    grid: { display: false },
                    font: { size: 10 }
                }
            }
        }
    });
}

// Chart.js Category Doughnut
function initCategoryChart(categoryData = []) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    const labels = categoryData.map(c => c.name);
    const counts = categoryData.map(c => c.product_count || 1);

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts.length ? counts : [4, 3, 2, 2, 2, 1],
                backgroundColor: [
                    '#10B981', '#14B8A6', '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899'
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 10, font: { size: 9 } }
                }
            },
            cutout: '68%'
        }
    });
}

/* ========================================================
   PRODUCT MANAGEMENT (CRUD + Status Filter + Discount + Mobile)
   ======================================================== */

// Filter Products by Status (Tất cả, Đang mở bán, Đã gỡ bán)
function filterProductsByStatus(status) {
    currentProductStatus = status;

    // Update status pills active class
    const pills = ['all', 'active', 'inactive'];
    pills.forEach(s => {
        const el = document.getElementById(`statusPill-${s}`);
        if (!el) return;
        if (s === status) {
            el.className = s === 'inactive'
                ? 'prod-status-pill active px-3.5 py-1.5 rounded-xl bg-rose-600 text-white shadow-sm flex items-center whitespace-nowrap'
                : 'prod-status-pill active px-3.5 py-1.5 rounded-xl bg-slate-900 text-white shadow-sm flex items-center whitespace-nowrap';
        } else {
            el.className = s === 'inactive'
                ? 'prod-status-pill px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-rose-700 flex items-center whitespace-nowrap border border-transparent hover:border-rose-200'
                : 'prod-status-pill px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center whitespace-nowrap';
        }
    });

    renderCurrentProductList();
}

async function loadAdminProducts() {
    try {
        const cat = document.getElementById('adminProductCatFilter')?.value || 'all';
        const search = document.getElementById('adminProductSearch')?.value || '';

        let url = `/api/products?adminView=1`;
        if (cat !== 'all') url += `&category_id=${cat}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const res = await apiFetch(url);
        cachedProducts = res.products || [];

        // Update counts
        const countAll = cachedProducts.length;
        const countActive = cachedProducts.filter(p => p.is_active === 1).length;
        const countInactive = cachedProducts.filter(p => !p.is_active || p.is_active === 0).length;

        const countAllEl = document.getElementById('countStatusAll');
        const countActiveEl = document.getElementById('countStatusActive');
        const countInactiveEl = document.getElementById('countStatusInactive');
        const sidebarProdCount = document.getElementById('sidebarProductCount');

        if (countAllEl) countAllEl.textContent = countAll;
        if (countActiveEl) countActiveEl.textContent = countActive;
        if (countInactiveEl) countInactiveEl.textContent = countInactive;
        if (sidebarProdCount) sidebarProdCount.textContent = countAll;

        renderCurrentProductList();
    } catch (e) {
        showToast('error', 'Lỗi tải danh sách sản phẩm');
    }
}

function renderCurrentProductList() {
    let filtered = [...cachedProducts];

    if (currentProductStatus === 'active') {
        filtered = filtered.filter(p => p.is_active === 1);
    } else if (currentProductStatus === 'inactive') {
        filtered = filtered.filter(p => !p.is_active || p.is_active === 0);
    }

    renderAdminProductsTable(filtered);
    renderAdminProductsMobileCards(filtered);
}

function debounceProductSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        loadAdminProducts();
    }, 300);
}

// Render Desktop Table
function renderAdminProductsTable(products) {
    const tbody = document.getElementById('adminProductsTableBody');
    if (!tbody) return;

    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400">
            <i class="fa-solid fa-box-open text-3xl mb-2 text-slate-300 block"></i>
            Không có mặt hàng nào phù hợp với bộ lọc này
        </td></tr>`;
        return;
    }

    tbody.innerHTML = products.map(p => {
        const webStockBadge = p.stock > 20
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">' + p.stock + ' sp</span>'
            : p.stock > 0
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Sắp hết (' + p.stock + ')</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Hết hàng</span>';

        const shopeeStockVal = p.shopee_stock !== null && p.shopee_stock !== undefined ? p.shopee_stock : p.stock;
        const lazadaStockVal = p.lazada_stock !== null && p.lazada_stock !== undefined ? p.lazada_stock : p.stock;

        // Discount percent calculation
        const discountPercent = p.original_price && p.original_price > p.price
            ? Math.round(((p.original_price - p.price) / p.original_price) * 100)
            : 0;

        // Status Badge
        const statusBadge = p.is_active === 1
            ? `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                 <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span> Đang mở bán
               </span>`
            : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                 <i class="fa-solid fa-circle-pause mr-1 text-[10px]"></i> Đã gỡ bán
               </span>`;

        const safeName = p.name.replace(/'/g, "\\'");

        // Unlist / Re-list Button
        const unlistButton = p.is_active === 1
            ? `<button onclick="toggleProductListing(${p.id}, 1, '${safeName}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs transition mr-1" title="Gỡ mặt hàng khỏi website bán hàng">
                 <i class="fa-solid fa-ban mr-1"></i> Gỡ bán
               </button>`
            : `<button onclick="toggleProductListing(${p.id}, 0, '${safeName}')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition mr-1" title="Đăng bán lại lên website">
                 <i class="fa-solid fa-circle-check mr-1"></i> Mở bán
               </button>`;

        return `
            <tr class="hover:bg-slate-50 transition ${p.is_active === 0 ? 'bg-slate-50/70 opacity-80' : ''}">
                <td class="py-3 px-4">
                    <div class="flex items-center space-x-3">
                        <img src="${p.image_url}" alt="${p.name}" class="w-11 h-11 rounded-xl object-cover border border-slate-200 bg-white shadow-sm flex-shrink-0">
                        <div class="max-w-xs">
                            <div class="font-bold text-slate-800 text-xs truncate hover:text-emerald-600 cursor-pointer" onclick="openProductModal(${p.id})">${p.name}</div>
                            <div class="text-[10px] text-slate-400 mt-0.5">ID: #${p.id} ${p.badge ? `• <span class="text-emerald-600 font-bold">${p.badge}</span>` : ''}</div>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-3">
                    <span class="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">${p.category_name || 'Khác'}</span>
                </td>
                <td class="py-3 px-3">
                    <div class="font-extrabold text-slate-800 text-xs">${formatCurrency(p.price)}</div>
                    ${p.original_price && p.original_price > p.price ? `
                        <div class="flex items-center space-x-1 mt-0.5">
                            <span class="text-[10px] text-slate-400 line-through">${formatCurrency(p.original_price)}</span>
                            <span class="text-[9px] font-black bg-rose-100 text-rose-700 px-1 py-0.2 rounded">-${discountPercent}%</span>
                        </div>
                    ` : ''}
                </td>
                <td class="py-3 px-3">${webStockBadge}</td>
                <td class="py-3 px-3">
                    <div class="flex items-center space-x-1.5">
                        <span class="px-2 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-700 border border-orange-200">${shopeeStockVal}</span>
                        <span class="text-[9px] text-slate-400 font-mono hidden xl:inline">${p.shopee_item_id || 'SHP'}</span>
                    </div>
                </td>
                <td class="py-3 px-3">
                    <div class="flex items-center space-x-1.5">
                        <span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200">${lazadaStockVal}</span>
                        <span class="text-[9px] text-slate-400 font-mono hidden xl:inline">${p.lazada_item_id || 'LAZ'}</span>
                    </div>
                </td>
                <td class="py-3 px-3">
                    ${statusBadge}
                </td>
                <td class="py-3 px-4 text-right whitespace-nowrap">
                    ${unlistButton}
                    <button onclick="openProductModal(${p.id})" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg mr-1 transition" title="Chỉnh sửa chi tiết">
                        <i class="fa-regular fa-pen-to-square"></i>
                    </button>
                    <button onclick="deleteProduct(${p.id}, '${safeName}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Xóa vĩnh viễn">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Render Mobile Cards View (Optimized for Smartphone Screens)
function renderAdminProductsMobileCards(products) {
    const container = document.getElementById('adminProductsMobileContainer');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = `
            <div class="py-10 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200 p-6">
                <i class="fa-solid fa-box-open text-3xl mb-2 text-slate-300 block"></i>
                <div class="font-bold text-sm text-slate-600">Không có mặt hàng nào</div>
                <p class="text-xs text-slate-400 mt-1">Chưa có sản phẩm phù hợp với bộ lọc hiện tại.</p>
                <button onclick="openProductModal()" class="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md">
                    + Thêm sản phẩm mới ngay
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = products.map(p => {
        const safeName = p.name.replace(/'/g, "\\'");
        const discountPercent = p.original_price && p.original_price > p.price
            ? Math.round(((p.original_price - p.price) / p.original_price) * 100)
            : 0;

        const isUnlisted = !p.is_active || p.is_active === 0;

        return `
            <div class="admin-product-card ${isUnlisted ? 'bg-slate-50/80 border-dashed border-rose-200' : ''}">
                <!-- Top Row: Thumbnail + Info -->
                <div class="flex items-start space-x-3 mb-3">
                    <img src="${p.image_url}" alt="${p.name}" class="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-white shadow-sm flex-shrink-0">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-1 mb-0.5">
                            <span class="text-[10px] font-bold text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded">${p.category_name || 'Khác'}</span>
                            ${isUnlisted
                                ? `<span class="text-[10px] font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full flex items-center"><i class="fa-solid fa-circle-pause mr-1"></i>Đã gỡ bán</span>`
                                : `<span class="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center"><i class="fa-solid fa-circle-check mr-1"></i>Đang bán</span>`
                            }
                        </div>
                        <h4 class="font-bold text-xs text-slate-800 line-clamp-2 leading-snug" onclick="openProductModal(${p.id})">${p.name}</h4>
                        <div class="flex items-baseline space-x-1.5 mt-1.5">
                            <span class="font-black text-emerald-600 text-sm">${formatCurrency(p.price)}</span>
                            ${p.original_price && p.original_price > p.price ? `
                                <span class="text-[10px] text-slate-400 line-through">${formatCurrency(p.original_price)}</span>
                                <span class="text-[9px] font-black bg-rose-500 text-white px-1.5 py-0.2 rounded-full">-${discountPercent}%</span>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Middle Row: Inventory Chips -->
                <div class="grid grid-cols-3 gap-2 py-2 border-t border-b border-slate-100 text-[10px] mb-3">
                    <div class="bg-slate-50 p-1.5 rounded-lg text-center">
                        <span class="text-slate-400 block font-medium">Kho Web</span>
                        <strong class="text-slate-700 text-xs">${p.stock} sp</strong>
                    </div>
                    <div class="bg-orange-50 p-1.5 rounded-lg text-center">
                        <span class="text-orange-600 block font-medium"><i class="fa-solid fa-bag-shopping mr-0.5"></i>Shopee</span>
                        <strong class="text-orange-700 text-xs">${p.shopee_stock !== null && p.shopee_stock !== undefined ? p.shopee_stock : p.stock}</strong>
                    </div>
                    <div class="bg-blue-50 p-1.5 rounded-lg text-center">
                        <span class="text-blue-600 block font-medium"><i class="fa-solid fa-heart mr-0.5"></i>Lazada</span>
                        <strong class="text-blue-700 text-xs">${p.lazada_stock !== null && p.lazada_stock !== undefined ? p.lazada_stock : p.stock}</strong>
                    </div>
                </div>

                <!-- Bottom Row: Mobile Action Buttons (Easy Touch) -->
                <div class="grid grid-cols-3 gap-2 pt-0.5">
                    <!-- Sửa -->
                    <button onclick="openProductModal(${p.id})" class="py-2 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs flex items-center justify-center transition">
                        <i class="fa-regular fa-pen-to-square mr-1"></i> Sửa
                    </button>

                    <!-- Gỡ Bán / Đăng Bán Lại -->
                    ${isUnlisted
                        ? `<button onclick="toggleProductListing(${p.id}, 0, '${safeName}')" class="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center transition shadow-sm">
                             <i class="fa-solid fa-circle-check mr-1"></i> Mở bán
                           </button>`
                        : `<button onclick="toggleProductListing(${p.id}, 1, '${safeName}')" class="py-2 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center transition border border-rose-200">
                             <i class="fa-solid fa-ban mr-1"></i> Gỡ bán
                           </button>`
                    }

                    <!-- Xóa -->
                    <button onclick="deleteProduct(${p.id}, '${safeName}')" class="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs flex items-center justify-center transition">
                        <i class="fa-regular fa-trash-can mr-1"></i> Xóa
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// TOGGLE PRODUCT LISTING (MỤC GỠ SẢN PHẨM KHỎI WEBSITE BÁN HÀNG)
function toggleProductListing(id, currentIsActive, name) {
    if (currentIsActive === 1) {
        // GỠ SẢN PHẨM
        Swal.fire({
            title: 'Gỡ mặt hàng khỏi website?',
            html: `Bạn có chắc muốn <strong>gỡ mặt hàng "${name}"</strong> khỏi website bán hàng?<br><span class="text-xs text-slate-500 mt-1 block">Khách hàng sẽ không nhìn thấy và không thể đặt mua mặt hàng này nữa. Dữ liệu và tồn kho vẫn được lưu giữ an toàn.</span>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#E11D48',
            cancelButtonColor: '#64748B',
            confirmButtonText: 'Đồng ý gỡ sản phẩm',
            cancelButtonText: 'Giữ lại',
            customClass: { popup: 'rounded-3xl' }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const res = await apiFetch(`/api/products/${id}/toggle-active`, {
                        method: 'PATCH',
                        body: JSON.stringify({ is_active: 0 })
                    });
                    showToast('success', res.message || 'Đã gỡ sản phẩm khỏi website thành công!');
                    loadAdminProducts();
                    loadDashboardStats();
                } catch (err) {
                    showToast('error', err.message || 'Lỗi khi gỡ sản phẩm');
                }
            }
        });
    } else {
        // MỞ BÁN LẠI SẢN PHẨM
        Swal.fire({
            title: 'Mở bán lại mặt hàng này?',
            html: `Bạn muốn đăng mở bán lại mặt hàng <strong>"${name}"</strong> lên website?<br><span class="text-xs text-slate-500 mt-1 block">Sản phẩm sẽ lập tức hiển thị cho khách hàng xem và đặt mua.</span>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10B981',
            cancelButtonColor: '#64748B',
            confirmButtonText: 'Mở bán ngay',
            cancelButtonText: 'Hủy',
            customClass: { popup: 'rounded-3xl' }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const res = await apiFetch(`/api/products/${id}/toggle-active`, {
                        method: 'PATCH',
                        body: JSON.stringify({ is_active: 1 })
                    });
                    showToast('success', res.message || 'Đã mở bán lại sản phẩm thành công!');
                    loadAdminProducts();
                    loadDashboardStats();
                } catch (err) {
                    showToast('error', err.message || 'Lỗi khi mở bán sản phẩm');
                }
            }
        });
    }
}

// SMART DISCOUNT CALCULATOR (Mục Giảm Giá Thông Minh)
function calculateDiscount(source) {
    const origInput = document.getElementById('prodOriginalPrice');
    const discInput = document.getElementById('prodDiscountPercent');
    const priceInput = document.getElementById('prodPrice');
    const savingsBadge = document.getElementById('discountSavingsBadge');

    const originalPrice = Number(origInput?.value) || 0;
    let discountPercent = Number(discInput?.value) || 0;
    let salePrice = Number(priceInput?.value) || 0;

    if (source === 'original' || source === 'percent') {
        if (originalPrice > 0 && discountPercent > 0) {
            salePrice = Math.max(0, Math.round((originalPrice * (1 - discountPercent / 100)) / 1000) * 1000);
            if (priceInput) priceInput.value = salePrice;
        }
    } else if (source === 'sale') {
        if (originalPrice > 0 && salePrice > 0 && originalPrice > salePrice) {
            discountPercent = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
            if (discInput) discInput.value = discountPercent;
        } else if (originalPrice <= salePrice) {
            if (discInput) discInput.value = 0;
            discountPercent = 0;
        }
    }

    // Update savings badge & auto badge name
    if (originalPrice > salePrice && salePrice > 0) {
        const savedAmount = originalPrice - salePrice;
        if (savingsBadge) {
            savingsBadge.textContent = `Tiết kiệm: ${formatCurrency(savedAmount)} (-${discountPercent}%)`;
            savingsBadge.classList.remove('hidden');
        }
        // Auto set badge if badge field is empty or contains old discount
        const badgeInput = document.getElementById('prodBadge');
        if (badgeInput && (!badgeInput.value || badgeInput.value.startsWith('GIẢM '))) {
            badgeInput.value = `GIẢM ${discountPercent}%`;
        }
    } else {
        if (savingsBadge) savingsBadge.classList.add('hidden');
    }
}

// Quick Discount Buttons (10%, 20%, 30%, 50%)
function applyQuickDiscount(pct) {
    const discInput = document.getElementById('prodDiscountPercent');
    const origInput = document.getElementById('prodOriginalPrice');
    const priceInput = document.getElementById('prodPrice');

    if (discInput) discInput.value = pct;

    // If original price is not filled yet, take current price as base
    if ((!origInput.value || Number(origInput.value) <= 0) && Number(priceInput.value) > 0) {
        const currentP = Number(priceInput.value);
        origInput.value = Math.round((currentP / (1 - pct / 100)) / 1000) * 1000;
    }

    calculateDiscount('percent');
}

// Active Radio Handler
function handleActiveRadioChange(val) {
    const hiddenInput = document.getElementById('prodIsActiveValue');
    if (hiddenInput) hiddenInput.value = val;
}

// Open Add / Edit Product Modal
async function openProductModal(productId = null) {
    const modal = document.getElementById('productModal');
    const titleEl = document.getElementById('productModalTitle');
    const form = document.getElementById('productForm');

    // Make sure categories are available in dropdown
    await loadAdminCategories();

    if (productId) {
        // Edit Mode
        titleEl.textContent = 'Chỉnh Sửa Mặt Hàng #' + productId;
        document.getElementById('editProductId').value = productId;

        let p = cachedProducts.find(item => item.id === productId);
        if (!p) {
            try {
                const res = await apiFetch(`/api/products/${productId}`);
                p = res.product;
            } catch (err) {
                console.error('Không tìm thấy thông tin sản phẩm:', err);
            }
        }
        if (p) {
            document.getElementById('prodName').value = p.name || '';
            document.getElementById('prodCategory').value = p.category_id || '';
            document.getElementById('prodPrice').value = p.price || '';
            document.getElementById('prodOriginalPrice').value = p.original_price || '';
            document.getElementById('prodStock').value = p.stock !== undefined ? p.stock : 50;
            document.getElementById('prodBadge').value = p.badge || '';
            document.getElementById('prodImageUrl').value = p.image_url || '';
            document.getElementById('prodDescription').value = p.description || '';
            document.getElementById('imagePreview').src = p.image_url;

            // Status Radio
            const isActive = p.is_active === 1;
            const radioTrue = document.getElementById('radioActiveTrue');
            const radioFalse = document.getElementById('radioActiveFalse');
            if (radioTrue && radioFalse) {
                radioTrue.checked = isActive;
                radioFalse.checked = !isActive;
            }
            document.getElementById('prodIsActiveValue').value = isActive ? 1 : 0;

            // Discount calculation trigger
            if (p.original_price && p.original_price > p.price) {
                const pct = Math.round(((p.original_price - p.price) / p.original_price) * 100);
                document.getElementById('prodDiscountPercent').value = pct;
                calculateDiscount('sale');
            } else {
                document.getElementById('prodDiscountPercent').value = '';
                document.getElementById('discountSavingsBadge').classList.add('hidden');
            }

            // Shopee & Lazada fields
            document.getElementById('prodShopeeItemId').value = p.shopee_item_id || `SHP-${p.id * 1234}`;
            document.getElementById('prodShopeeStock').value = p.shopee_stock !== null && p.shopee_stock !== undefined ? p.shopee_stock : p.stock;
            document.getElementById('prodLazadaItemId').value = p.lazada_item_id || `LAZ-${p.id * 4321}`;
            document.getElementById('prodLazadaStock').value = p.lazada_stock !== null && p.lazada_stock !== undefined ? p.lazada_stock : p.stock;
        }
    } else {
        // Add Mode
        titleEl.textContent = 'Thêm Mặt Hàng Mới Vào Cửa Hàng';
        document.getElementById('editProductId').value = '';
        form.reset();
        document.getElementById('prodStock').value = 50;
        document.getElementById('prodShopeeStock').value = 50;
        document.getElementById('prodLazadaStock').value = 50;
        document.getElementById('prodShopeeItemId').value = 'SHP-' + Date.now().toString().slice(-6);
        document.getElementById('prodLazadaItemId').value = 'LAZ-' + Date.now().toString().slice(-6);
        document.getElementById('radioActiveTrue').checked = true;
        document.getElementById('prodIsActiveValue').value = 1;
        document.getElementById('prodDiscountPercent').value = '';
        document.getElementById('discountSavingsBadge').classList.add('hidden');
        document.getElementById('imagePreview').src = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&auto=format&fit=crop&q=80';
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeProductModal() {
    document.getElementById('productModal').classList.add('hidden');
    document.body.style.overflow = '';
}

// Sticky button trigger
function triggerProductFormSubmit() {
    const form = document.getElementById('productForm');
    if (form) {
        if (form.reportValidity()) {
            form.requestSubmit();
        }
    }
}

// Live Image URL preview
function updateImagePreview(url) {
    const preview = document.getElementById('imagePreview');
    if (preview && url) {
        preview.src = url;
    }
}

// File Upload directly from phone camera or computer
async function handleImageFileSelect(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];

        // Preview locally right away
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('imagePreview').src = e.target.result;
        };
        reader.readAsDataURL(file);

        // Upload to server
        const formData = new FormData();
        formData.append('image', file);

        try {
            showToast('info', 'Đang tải ảnh lên máy chủ...');
            const res = await apiFetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            document.getElementById('prodImageUrl').value = res.url;
            showToast('success', 'Đã tải ảnh lên thành công!');
        } catch (err) {
            showToast('error', err.message || 'Lỗi khi tải ảnh lên');
        }
    }
}

// Save Product (Add or Edit)
async function handleSaveProduct(e) {
    e.preventDefault();

    const id = document.getElementById('editProductId').value;
    const name = document.getElementById('prodName').value;
    const category_id = document.getElementById('prodCategory').value;
    const price = document.getElementById('prodPrice').value;
    const original_price = document.getElementById('prodOriginalPrice').value;
    const stock = document.getElementById('prodStock').value;
    const badge = document.getElementById('prodBadge').value;
    const image_url = document.getElementById('prodImageUrl').value;
    const description = document.getElementById('prodDescription').value;
    const is_active = Number(document.getElementById('prodIsActiveValue')?.value) || 1;

    const shopee_item_id = document.getElementById('prodShopeeItemId')?.value;
    const shopee_stock = document.getElementById('prodShopeeStock')?.value;
    const lazada_item_id = document.getElementById('prodLazadaItemId')?.value;
    const lazada_stock = document.getElementById('prodLazadaStock')?.value;

    const payload = {
        name,
        category_id,
        price,
        original_price: original_price || null,
        stock,
        badge,
        image_url: image_url || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&auto=format&fit=crop&q=80',
        description,
        is_active,
        shopee_item_id,
        shopee_stock: shopee_stock !== undefined ? Number(shopee_stock) : stock,
        lazada_item_id,
        lazada_stock: lazada_stock !== undefined ? Number(lazada_stock) : stock,
        auto_sync_marketplace: 1
    };

    try {
        if (id) {
            // Update
            await apiFetch(`/api/products/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('success', 'Đã cập nhật thông tin mặt hàng thành công (Đã lưu lên Đám Mây)!');
        } else {
            // Create
            await apiFetch('/api/products', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('success', 'Đã thêm mặt hàng mới thành công vào cửa hàng (Đã lưu lên Đám Mây)!');
        }

        // Tự động kích hoạt đồng bộ lên Đám Mây ngay lập tức
        if (typeof window.syncToCloud === 'function') {
            window.syncToCloud().catch(() => {});
        }
        if (typeof window.resetCloudCountdown === 'function') {
            window.resetCloudCountdown(30);
        }

        closeProductModal();
        loadAdminProducts();
        loadDashboardStats(); // refresh counts
    } catch (err) {
        showToast('error', err.message || 'Lỗi khi lưu sản phẩm');
    }
}

// Delete Product (Vĩnh viễn & Đồng bộ lên Đám mây)
function deleteProduct(id, name) {
    Swal.fire({
        title: 'Xóa vĩnh viễn mặt hàng?',
        html: `Bạn có chắc muốn xóa <strong>"${name}"</strong> khỏi hệ thống? Thao tác này sẽ đồng bộ lên Đám Mây và xóa vĩnh viễn trên mọi thiết bị.<br><span class="text-xs text-rose-500 mt-1 block">Mẹo: Nếu chỉ muốn ẩn sản phẩm khỏi web, hãy dùng nút "Gỡ bán".</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'Đồng ý xóa vĩnh viễn',
        cancelButtonText: 'Hủy'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                if (typeof window.recordDeletedProductId === 'function') {
                    window.recordDeletedProductId(id);
                }
                await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
                if (typeof window.syncToCloud === 'function') {
                    await window.syncToCloud();
                }
                showToast('success', 'Đã xóa mặt hàng thành công và đồng bộ vĩnh viễn lên Đám Mây!');
                await loadAdminProducts();
                if (typeof loadDashboardStats === 'function') loadDashboardStats();
            } catch (err) {
                showToast('error', err.message || 'Lỗi khi xóa sản phẩm');
            }
        }
    });
}

/* ========================================================
   CATEGORY MANAGEMENT
   ======================================================== */

function renderAdminCategories() {
    const tbody = document.getElementById('adminCategoriesTableBody');
    if (!tbody) return;

    if (cachedCategories.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400">Chưa có danh mục nào</td></tr>`;
        return;
    }

    tbody.innerHTML = cachedCategories.map(c => {
        const safeName = (c.name || '').replace(/'/g, "\\'");
        return `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-3 whitespace-nowrap">
                <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <i class="fa-solid ${c.icon || 'fa-tag'}"></i>
                </div>
            </td>
            <td class="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">${c.name}</td>
            <td class="py-2.5 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">${c.slug}</td>
            <td class="py-2.5 px-3 whitespace-nowrap">
                <span class="inline-block whitespace-nowrap bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    ${c.product_count || 0} sản phẩm
                </span>
            </td>
            <td class="py-2.5 px-3 text-right whitespace-nowrap">
                <button onclick="deleteCategory(${c.id}, '${safeName}')" class="px-2.5 py-1 text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg transition inline-flex items-center whitespace-nowrap" title="Xóa danh mục này">
                    <i class="fa-regular fa-trash-can mr-1"></i> Xóa
                </button>
            </td>
        </tr>
        `;
    }).join('');
}

// XÓA DANH MỤC (ĐỒNG BỘ VỚI WEBSITE KHÁCH HÀNG)
function deleteCategory(id, name) {
    Swal.fire({
        title: 'Xóa danh mục sản phẩm?',
        html: `Bạn có chắc muốn xóa danh mục <strong>"${name}"</strong>?<br><span class="text-xs text-slate-500 mt-2 block">Thao tác này sẽ đồng bộ ngay lập tức với trang web khách hàng. Các sản phẩm thuộc danh mục này sẽ được chuyển sang mục "Khác".</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'Đồng ý xóa danh mục',
        cancelButtonText: 'Hủy'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
                showToast('success', res.message || `Đã xóa danh mục "${name}" thành công!`);
                await loadAdminCategories();
                renderAdminCategories();
                loadAdminProducts();
                loadDashboardStats();
            } catch (err) {
                showToast('error', err.message || 'Lỗi khi xóa danh mục');
            }
        }
    });
}

async function handleAddCategory(e) {
    e.preventDefault();
    const name = document.getElementById('newCatName').value;
    const icon = document.getElementById('newCatIcon').value;
    const description = document.getElementById('newCatDesc').value;

    try {
        await apiFetch('/api/categories', {
            method: 'POST',
            body: JSON.stringify({ name, icon, description })
        });

        document.getElementById('addCategoryForm').reset();
        showToast('success', 'Tạo danh mục mới thành công!');
        await loadAdminCategories();
        renderAdminCategories();
    } catch (err) {
        showToast('error', err.message || 'Lỗi khi tạo danh mục');
    }
}

/* ========================================================
   ORDER MANAGEMENT
   ======================================================== */

async function loadAdminOrders() {
    try {
        let url = `/api/orders`;
        if (currentOrderFilter !== 'all') {
            url += `?status=${currentOrderFilter}`;
        }

        const res = await apiFetch(url);
        renderAdminOrdersTable(res.orders || []);
    } catch (e) {
        showToast('error', 'Lỗi tải danh sách đơn hàng');
    }
}

function filterOrdersByStatus(status, btnEl) {
    currentOrderFilter = status;

    // Update pill buttons
    const pills = document.querySelectorAll('.order-pill');
    pills.forEach(p => {
        p.className = 'order-pill px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 whitespace-nowrap shrink-0';
    });

    const targetBtn = btnEl || (typeof event !== 'undefined' && event ? (event.currentTarget || event.target) : null);
    if (targetBtn) {
        targetBtn.className = 'order-pill active px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold whitespace-nowrap shrink-0';
    }
    loadAdminOrders();
}

function renderAdminOrdersTable(orders) {
    const tbody = document.getElementById('adminOrdersTableBody');
    const mobileContainer = document.getElementById('adminOrdersMobileContainer');

    if (mobileContainer) {
        if (orders.length === 0) {
            mobileContainer.innerHTML = `
                <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs shadow-sm">
                    <i class="fa-solid fa-box-open text-2xl text-slate-300 mb-2 block"></i>
                    Không có đơn hàng nào trong mục này
                </div>
            `;
        } else {
            mobileContainer.innerHTML = orders.map(o => `
                <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2.5 text-xs">
                    <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="font-black text-emerald-700 whitespace-nowrap">${escapeAdminHtml(o.order_code)}</span>
                            <span class="text-[10px] text-slate-400 whitespace-nowrap">${formatDate(o.created_at)}</span>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 ${getStatusBadgeClass(o.status)}">
                            ${getStatusText(o.status)}
                        </span>
                    </div>
                    <div class="space-y-1">
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-bold text-slate-800 truncate">
                                <i class="fa-solid fa-user text-slate-400 mr-1.5 text-[11px]"></i>${escapeAdminHtml(o.customer_name)}
                            </span>
                            <a href="tel:${escapeAdminHtml(o.customer_phone)}" class="text-[11px] text-emerald-600 font-bold whitespace-nowrap shrink-0">
                                <i class="fa-solid fa-phone text-[10px] mr-1"></i>${escapeAdminHtml(o.customer_phone)}
                            </a>
                        </div>
                        <div class="text-slate-600 text-[11px] flex items-start gap-1.5">
                            <i class="fa-solid fa-location-dot text-rose-500 mt-0.5 shrink-0 text-[11px]"></i>
                            <span>${escapeAdminHtml(o.shipping_address || 'Chưa có địa chỉ')}</span>
                        </div>
                        ${o.note && o.note.trim() ? `
                            <div class="bg-amber-50/90 border border-amber-200 text-amber-900 text-[11px] p-2 rounded-xl flex items-start gap-1.5">
                                <i class="fa-solid fa-note-sticky text-amber-500 mt-0.5 shrink-0"></i>
                                <span class="italic font-medium">${escapeAdminHtml(o.note)}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <strong class="font-black text-slate-800 text-sm whitespace-nowrap">${formatCurrency(o.total_amount)}</strong>
                            <span class="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded whitespace-nowrap">${escapeAdminHtml(o.payment_method || 'COD')}</span>
                            ${o.payment_status === 'paid'
                                ? `<button onclick="toggleOrderPaymentStatus(${o.id}, 'pending')" class="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full inline-flex items-center whitespace-nowrap"><i class="fa-solid fa-check mr-1 text-emerald-600"></i>Đã TT</button>`
                                : `<button onclick="toggleOrderPaymentStatus(${o.id}, 'paid')" class="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full inline-flex items-center whitespace-nowrap"><i class="fa-regular fa-clock mr-1 text-amber-600"></i>Chờ TT</button>`
                            }
                        </div>
                        <button onclick="viewOrderDetail(${o.id})" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs transition border border-emerald-200/60 shadow-sm inline-flex items-center whitespace-nowrap shrink-0">
                            <i class="fa-solid fa-eye mr-1 text-[11px]"></i> Chi tiết
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    if (!tbody) return;

    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-400">Không có đơn hàng nào trong mục này</td></tr>`;
        return;
    }

    tbody.innerHTML = orders.map(o => `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-3 font-black text-emerald-700 whitespace-nowrap">${o.order_code}</td>
            <td class="py-3 px-3">
                <div class="font-bold text-slate-800 flex items-center whitespace-nowrap">
                    <i class="fa-solid fa-user text-slate-400 mr-1.5 text-[11px]"></i>${o.customer_name}
                </div>
                <div class="text-[11px] text-emerald-600 font-bold mt-0.5 flex items-center whitespace-nowrap">
                    <i class="fa-solid fa-phone text-[10px] mr-1 text-emerald-500"></i>
                    <a href="tel:${o.customer_phone}" class="hover:underline">${o.customer_phone}</a>
                </div>
                ${o.customer_email ? `<div class="text-[10px] text-slate-400 truncate max-w-[150px]"><i class="fa-regular fa-envelope text-[9px] mr-1"></i>${o.customer_email}</div>` : ''}
            </td>
            <td class="py-3 px-3">
                <div class="text-slate-700 leading-relaxed text-xs max-w-xs flex items-start space-x-1.5">
                    <i class="fa-solid fa-location-dot text-rose-500 mt-0.5 shrink-0 text-xs"></i>
                    <span class="font-medium">${o.shipping_address || '<span class="text-slate-300 italic">Chưa có địa chỉ</span>'}</span>
                </div>
            </td>
            <td class="py-3 px-3">
                ${o.note && o.note.trim() ? `
                    <div class="bg-amber-50/90 border border-amber-200 text-amber-900 text-xs p-2 rounded-xl flex items-start space-x-1.5 max-w-xs shadow-sm">
                        <i class="fa-solid fa-note-sticky text-amber-500 mt-0.5 shrink-0 text-xs"></i>
                        <span class="italic font-medium leading-tight">${o.note}</span>
                    </div>
                ` : `
                    <span class="text-slate-400 text-[11px] italic flex items-center whitespace-nowrap">
                        <i class="fa-regular fa-comment-dots mr-1 text-slate-300"></i> Không có ghi chú
                    </span>
                `}
            </td>
            <td class="py-3 px-3 font-extrabold text-slate-800 whitespace-nowrap">${formatCurrency(o.total_amount)}</td>
            <td class="py-3 px-3 whitespace-nowrap">
                <div class="flex flex-col gap-1 items-start">
                    <span class="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded whitespace-nowrap">
                        ${o.payment_method || 'COD'}
                    </span>
                    ${o.payment_status === 'paid'
                        ? `<button onclick="toggleOrderPaymentStatus(${o.id}, 'pending')" class="text-[9px] font-black bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-1.5 py-0.5 rounded-full flex items-center transition whitespace-nowrap" title="Bấm để đổi sang Chờ thanh toán"><i class="fa-solid fa-check mr-1 text-emerald-600"></i>Đã TT</button>`
                        : `<button onclick="toggleOrderPaymentStatus(${o.id}, 'paid')" class="text-[9px] font-black bg-amber-100 text-amber-800 hover:bg-amber-200 px-1.5 py-0.5 rounded-full flex items-center transition whitespace-nowrap" title="Bấm để xác nhận Đã thanh toán"><i class="fa-regular fa-clock mr-1 text-amber-600"></i>Chờ TT</button>`
                    }
                </div>
            </td>
            <td class="py-3 px-3 whitespace-nowrap">
                <span class="inline-block whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(o.status)}">
                    ${getStatusText(o.status)}
                </span>
            </td>
            <td class="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">${formatDate(o.created_at)}</td>
            <td class="py-3 px-3 text-right whitespace-nowrap">
                <button onclick="viewOrderDetail(${o.id})" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition border border-emerald-200/60 shadow-sm flex items-center ml-auto whitespace-nowrap">
                    <i class="fa-solid fa-eye mr-1 text-[11px]"></i> Chi tiết
                </button>
            </td>
        </tr>
    `).join('');
}

// CẬP NHẬT TRẠNG THÁI THANH TOÁN (ADMIN)
async function toggleOrderPaymentStatus(orderId, newStatus) {
    try {
        await apiFetch(`/api/orders/${orderId}/payment`, {
            method: 'PUT',
            body: JSON.stringify({ payment_status: newStatus })
        });
        lastKnownOrderPaymentStatuses.set(orderId, newStatus);
        showToast('success', `Đã cập nhật trạng thái: ${newStatus === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}`);
        loadAdminOrders();
        loadDashboardStats();
    } catch (err) {
        showToast('error', err.message || 'Lỗi cập nhật thanh toán');
    }
}

// View Order Detail & Update Status
async function viewOrderDetail(orderId) {
    try {
        const res = await apiFetch('/api/orders');
        const order = res.orders.find(o => o.id === orderId);
        if (!order) return;

        const content = document.getElementById('orderDetailContent');
        content.innerHTML = `
            <div class="space-y-4 text-xs">
                <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                        <span class="text-xs text-slate-400">Chi tiết đơn hàng:</span>
                        <h3 class="font-black text-slate-800 text-base text-emerald-600">${order.order_code}</h3>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusBadgeClass(order.status)}">
                        ${getStatusText(order.status)}
                    </span>
                </div>

                <!-- Customer Details Card -->
                <div class="bg-gradient-to-br from-slate-50 via-emerald-50/20 to-slate-50 p-4 rounded-2xl border border-emerald-100/80 space-y-3">
                    <div class="font-extrabold text-xs uppercase tracking-wider text-emerald-800 flex items-center border-b border-emerald-100 pb-2">
                        <i class="fa-solid fa-id-card text-emerald-600 mr-2 text-sm"></i> Thông tin khách hàng & Giao hàng
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <span class="text-slate-400 block text-[10px] font-bold uppercase">Họ và tên khách hàng:</span>
                            <strong class="text-slate-800 text-sm font-bold flex items-center mt-0.5">
                                <i class="fa-solid fa-user text-slate-400 mr-1.5 text-xs"></i>${order.customer_name}
                            </strong>
                        </div>
                        <div>
                            <span class="text-slate-400 block text-[10px] font-bold uppercase">Số điện thoại nhận hàng:</span>
                            <strong class="text-emerald-700 text-sm font-black flex items-center mt-0.5">
                                <i class="fa-solid fa-phone text-emerald-500 mr-1.5 text-xs"></i>
                                <a href="tel:${order.customer_phone}" class="hover:underline">${order.customer_phone}</a>
                            </strong>
                        </div>
                    </div>
                    ${order.customer_email ? `
                        <div class="text-xs">
                            <span class="text-slate-400 block text-[10px] font-bold uppercase">Email khách hàng:</span>
                            <span class="text-slate-700 font-medium">${order.customer_email}</span>
                        </div>
                    ` : ''}
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Địa chỉ nhận hàng chi tiết:</span>
                        <div class="bg-white p-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 mt-1 flex items-start space-x-2 shadow-sm">
                            <i class="fa-solid fa-location-dot text-rose-500 mt-0.5 shrink-0 text-sm"></i>
                            <span class="leading-relaxed">${order.shipping_address || 'Chưa cung cấp địa chỉ giao hàng'}</span>
                        </div>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] font-bold uppercase">Ghi chú đơn hàng của khách:</span>
                        ${order.note && order.note.trim() ? `
                            <div class="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-xl text-xs mt-1 flex items-start space-x-2 shadow-sm">
                                <i class="fa-solid fa-note-sticky text-amber-500 mt-0.5 shrink-0 text-sm"></i>
                                <span class="italic font-medium leading-relaxed">${order.note}</span>
                            </div>
                        ` : `
                            <div class="bg-white border border-slate-100 p-2 rounded-xl text-slate-400 italic text-xs mt-1">
                                (Khách hàng không để lại ghi chú)
                            </div>
                        `}
                    </div>
                    <div class="text-xs pt-1 flex items-center justify-between">
                        <div>
                            <span class="text-slate-400 text-[10px] font-bold uppercase mr-1">Phương thức thanh toán:</span>
                            <strong class="text-slate-700">${order.payment_method || 'COD'}</strong>
                        </div>
                        <div>
                            <span class="text-slate-400 text-[10px] font-bold uppercase mr-1">Trạng thái thanh toán:</span>
                            <span class="font-bold ${order.payment_status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}">
                                ${order.payment_status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Items List -->
                <div>
                    <div class="font-bold text-slate-700 mb-2">Danh sách mặt hàng đã đặt:</div>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                        ${(order.items || []).map(item => `
                            <div class="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100">
                                <div>
                                    <div class="font-bold text-slate-800">${item.product_name}</div>
                                    <div class="text-slate-400 text-[10px]">${formatCurrency(item.price)} x ${item.quantity}</div>
                                </div>
                                <div class="font-extrabold text-emerald-600">${formatCurrency(item.total)}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="flex justify-between items-center text-sm font-black text-slate-800 pt-3 border-t border-slate-200 mt-3">
                        <span>Tổng tiền thanh toán:</span>
                        <span class="text-emerald-600 text-base">${formatCurrency(order.total_amount)}</span>
                    </div>
                </div>

                <!-- Update Status Form -->
                <div class="pt-3 border-t border-slate-100">
                    <label class="block font-bold text-slate-700 mb-1.5">Cập nhật trạng thái đơn hàng:</label>
                    <div class="flex space-x-2">
                        <select id="updateOrderStatusSelect" class="flex-1 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-bold text-xs bg-white">
                            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Chờ xử lý</option>
                            <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Đã xác nhận</option>
                            <option value="shipping" ${order.status === 'shipping' ? 'selected' : ''}>Đang giao hàng</option>
                            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Đã hoàn thành</option>
                            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Đã hủy</option>
                        </select>
                        <button onclick="submitUpdateOrderStatus(${order.id})" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition">
                            Lưu trạng thái
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('adminOrderDetailModal').classList.remove('hidden');
    } catch (e) {
        showToast('error', 'Lỗi khi mở chi tiết đơn hàng');
    }
}

function closeOrderDetailModal() {
    document.getElementById('adminOrderDetailModal').classList.add('hidden');
}

async function submitUpdateOrderStatus(orderId) {
    const status = document.getElementById('updateOrderStatusSelect').value;
    try {
        await apiFetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        showToast('success', 'Đã cập nhật trạng thái đơn hàng!');
        closeOrderDetailModal();
        loadAdminOrders();
        loadDashboardStats();
    } catch (err) {
        showToast('error', err.message || 'Lỗi cập nhật');
    }
}

/* ========================================================
   USER MANAGEMENT & ROLES
   ======================================================== */

async function loadAdminUsers() {
    try {
        const res = await apiFetch('/api/users');
        const users = res.users || [];
        const tbody = document.getElementById('adminUsersTableBody');
        if (!tbody) return;

        tbody.innerHTML = users.map(u => `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-slate-800">${u.name}</td>
                <td class="py-3 px-3 font-mono text-slate-600">${u.email}</td>
                <td class="py-3 px-3 text-slate-500">${u.phone || 'Chưa cập nhật'}</td>
                <td class="py-3 px-3 text-slate-500 truncate max-w-xs">${u.address || 'Chưa cập nhật'}</td>
                <td class="py-3 px-3">
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${u.role === 'admin' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-700'}">
                        ${u.role === 'admin' ? '🛡️ Quản Trị Viên (Admin)' : '👤 Khách Hàng (Customer)'}
                    </span>
                </td>
                <td class="py-3 px-4 text-right">
                    <select onchange="changeUserRole(${u.id}, this.value)" class="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none font-semibold">
                        <option value="customer" ${u.role === 'customer' ? 'selected' : ''}>Khách Hàng</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Quản Trị Viên (Admin)</option>
                    </select>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        showToast('error', 'Lỗi tải danh sách người dùng');
    }
}

async function changeUserRole(userId, newRole) {
    try {
        await apiFetch(`/api/users/${userId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role: newRole })
        });
        showToast('success', `Đã cập nhật vai trò thành công!`);
        loadAdminUsers();
    } catch (e) {
        showToast('error', 'Lỗi cập nhật vai trò');
    }
}

/* ========================================================
   STATUS HELPERS
   ======================================================== */

function getStatusBadgeClass(status) {
    switch (status) {
        case 'pending': return 'badge-pending';
        case 'confirmed': return 'badge-confirmed';
        case 'shipping': return 'badge-shipping';
        case 'completed': return 'badge-completed';
        case 'cancelled': return 'badge-cancelled';
        default: return 'bg-slate-100 text-slate-700';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'pending': return 'Chờ xử lý';
        case 'confirmed': return 'Đã xác nhận';
        case 'shipping': return 'Đang giao hàng';
        case 'completed': return 'Đã hoàn thành';
        case 'cancelled': return 'Đã hủy';
        default: return status;
    }
}

/* ========================================================
   MARKETPLACE INTEGRATION TAB (SHOPEE & LAZADA)
   ======================================================== */

async function loadMarketplaceTab() {
    try {
        const res = await apiFetch('/api/marketplace/settings');
        const s = res.settings;

        if (s) {
            const shopeePartner = document.getElementById('shopeePartnerId');
            if (shopeePartner) shopeePartner.value = s.shopee_partner_id || '';
            const shopeeShop = document.getElementById('shopeeShopId');
            if (shopeeShop) shopeeShop.value = s.shopee_shop_id || '';
            const lazadaApp = document.getElementById('lazadaAppKey');
            if (lazadaApp) lazadaApp.value = s.lazada_app_key || '';
            const lazadaSeller = document.getElementById('lazadaSellerId');
            if (lazadaSeller) lazadaSeller.value = s.lazada_seller_id || '';

            // Cập nhật giao diện trạng thái tạm ẩn API Lazada
            const badge = document.getElementById('lazadaStatusBadge');
            const toggleBtn = document.getElementById('lazadaToggleBtn');
            const statusEl = document.getElementById('lazadaTestStatus');

            if (s.lazada_hidden) {
                if (badge) badge.innerHTML = `<i class="fa-solid fa-eye-slash mr-1"></i> Tạm Ẩn API`;
                if (badge) badge.className = 'bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center';
                if (toggleBtn) toggleBtn.innerHTML = `<i class="fa-solid fa-rotate mr-1"></i> Bật lại`;
                if (statusEl) statusEl.textContent = 'Đang tạm ngưng kết nối API';
            } else {
                if (badge) badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span> Đang Kết Nối`;
                if (badge) badge.className = 'bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center';
                if (toggleBtn) toggleBtn.innerHTML = `<i class="fa-solid fa-eye-slash mr-1"></i> Tạm ẩn`;
                if (statusEl) statusEl.textContent = 'Đã kích hoạt';
            }
        }

        await loadMarketplaceRevenueTables();
        await loadMarketplaceLogs();
    } catch (e) {
        showToast('error', 'Lỗi tải cấu hình sàn');
    }
}

// BÁO CÁO DOANH THU & SỐ LƯỢNG ĐẶT HÀNG 2 SÀN SHOPEE & LAZADA
async function loadMarketplaceRevenueTables() {
    try {
        const res = await apiFetch('/api/marketplace/revenue-report');
        if (!res) return;

        const shopee = res.shopee || {};
        const lazada = res.lazada || {};

        // 1. Cập nhật thống kê Shopee
        const shpRevEl = document.getElementById('mktShopeeTotalRevenue');
        const shpUnitEl = document.getElementById('mktShopeeTotalUnits');
        const shpActiveEl = document.getElementById('mktShopeeActiveItems');
        const shpBadgeRev = document.getElementById('shopeeTableRevenueBadge');
        const shpBadgeOrders = document.getElementById('shopeeTableOrdersBadge');

        if (shpRevEl) shpRevEl.textContent = formatCurrency(shopee.total_revenue || 0);
        if (shpUnitEl) shpUnitEl.textContent = `${shopee.total_units_sold || 0} sản phẩm đã đặt`;
        if (shpActiveEl) shpActiveEl.textContent = `${(shopee.items || []).length} sản phẩm`;
        if (shpBadgeRev) shpBadgeRev.textContent = formatCurrency(shopee.total_revenue || 0);
        if (shpBadgeOrders) shpBadgeOrders.textContent = `${shopee.total_units_sold || 0} sp`;

        const shpTable = document.getElementById('shopeeRevenueTableBody');
        if (shpTable) {
            if (!shopee.items || shopee.items.length === 0) {
                shpTable.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">Chưa có sản phẩm liên kết Shopee</td></tr>`;
            } else {
                shpTable.innerHTML = shopee.items.map(item => `
                    <tr class="hover:bg-orange-50/40 transition">
                        <td class="py-3 px-4 flex items-center space-x-2.5">
                            <img src="${item.image_url}" class="w-9 h-9 rounded-lg object-cover border border-slate-200 bg-white shadow-sm flex-shrink-0">
                            <div class="font-bold text-slate-800 truncate max-w-xs">${item.name}</div>
                        </td>
                        <td class="py-3 px-3 font-mono text-slate-500 text-[11px]">${item.shopee_item_id}</td>
                        <td class="py-3 px-3 font-semibold text-slate-700">${formatCurrency(item.price)}</td>
                        <td class="py-3 px-3">
                            <span class="px-2 py-0.5 rounded text-xs font-black bg-orange-100 text-orange-800 border border-orange-200">
                                ${item.order_quantity} sp đã đặt
                            </span>
                        </td>
                        <td class="py-3 px-3 font-black text-orange-600">${formatCurrency(item.revenue)}</td>
                        <td class="py-3 px-3 font-bold text-slate-700">${item.shopee_stock} sp</td>
                        <td class="py-3 px-4 text-right">
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <i class="fa-solid fa-circle-check mr-1 text-emerald-600"></i> ${item.status}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // 2. Cập nhật thống kê Lazada (Tạm Ẩn API)
        const lazRevEl = document.getElementById('mktLazadaTotalRevenue');
        const lazUnitEl = document.getElementById('mktLazadaTotalUnits');
        const lazBadgeRev = document.getElementById('lazadaTableRevenueBadge');
        const lazBadgeOrders = document.getElementById('lazadaTableOrdersBadge');

        if (lazRevEl) lazRevEl.textContent = formatCurrency(lazada.total_revenue || 0);
        if (lazUnitEl) lazUnitEl.textContent = `${lazada.total_units_sold || 0} sản phẩm đã đặt`;
        if (lazBadgeRev) lazBadgeRev.textContent = formatCurrency(lazada.total_revenue || 0);
        if (lazBadgeOrders) lazBadgeOrders.textContent = `${lazada.total_units_sold || 0} sp`;

        const lazTable = document.getElementById('lazadaRevenueTableBody');
        if (lazTable) {
            if (!lazada.items || lazada.items.length === 0) {
                lazTable.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">Chưa có sản phẩm liên kết Lazada</td></tr>`;
            } else {
                lazTable.innerHTML = lazada.items.map(item => `
                    <tr class="hover:bg-blue-50/40 transition">
                        <td class="py-3 px-4 flex items-center space-x-2.5">
                            <img src="${item.image_url}" class="w-9 h-9 rounded-lg object-cover border border-slate-200 bg-white shadow-sm flex-shrink-0">
                            <div class="font-bold text-slate-800 truncate max-w-xs">${item.name}</div>
                        </td>
                        <td class="py-3 px-3 font-mono text-slate-500 text-[11px]">${item.lazada_item_id}</td>
                        <td class="py-3 px-3 font-semibold text-slate-700">${formatCurrency(item.price)}</td>
                        <td class="py-3 px-3">
                            <span class="px-2 py-0.5 rounded text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">
                                ${item.order_quantity} sp đã đặt
                            </span>
                        </td>
                        <td class="py-3 px-3 font-black text-blue-600">${formatCurrency(item.revenue)}</td>
                        <td class="py-3 px-3 font-bold text-slate-700">${item.lazada_stock} sp</td>
                        <td class="py-3 px-4 text-right">
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <i class="fa-solid fa-eye-slash mr-1 text-amber-600"></i> ${item.status}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }
        }

    } catch (err) {
        console.error('Lỗi tải bảng báo cáo doanh thu 2 sàn:', err);
    }
}

// TẠM ẨN / MỞ LẠI API LAZADA
async function toggleLazadaApiHide() {
    try {
        const res = await apiFetch('/api/marketplace/lazada/toggle-hide', { method: 'PATCH' });
        showToast('success', res.message || 'Đã cập nhật trạng thái tạm ẩn API Lazada!');
        await loadMarketplaceTab();
    } catch (err) {
        showToast('error', err.message || 'Lỗi khi cập nhật trạng thái tạm ẩn');
    }
}

async function loadMarketplaceLogs() {
    try {
        const res = await apiFetch('/api/marketplace/logs');
        const logs = res.logs || [];
        const tbody = document.getElementById('marketplaceLogsTableBody');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">Chưa có nhật ký đồng bộ kho nào</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(l => {
            const isShopee = l.platform.toLowerCase().includes('shopee');
            const platformBadge = isShopee
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-orange-100 text-orange-700 border border-orange-200"><i class="fa-solid fa-bag-shopping mr-1"></i>Shopee</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200"><i class="fa-solid fa-heart mr-1"></i>Lazada</span>';

            return `
                <tr class="hover:bg-slate-50 transition">
                    <td class="py-3 px-4 text-slate-400 font-mono text-[11px]">${formatDate(l.created_at)}</td>
                    <td class="py-3 px-3">
                        <span class="font-bold text-slate-700">${l.order_code || 'N/A'}</span>
                        <div class="text-[10px] text-slate-400">${l.action}</div>
                    </td>
                    <td class="py-3 px-3 font-semibold text-slate-800">${l.product_name || ('SP #' + l.product_id)}</td>
                    <td class="py-3 px-3">${platformBadge}</td>
                    <td class="py-3 px-3">
                        <span class="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">-${l.quantity_deducted} sp</span>
                    </td>
                    <td class="py-3 px-3 font-extrabold text-slate-700">${l.remaining_stock} sp</td>
                    <td class="py-3 px-4 text-right">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <i class="fa-solid fa-circle-check mr-1 text-emerald-600"></i> Thành công
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Lỗi tải nhật ký sàn:', e);
    }
}

async function testMarketplaceApi(platform) {
    try {
        showToast('info', `Đang kiểm tra kết nối API ${platform.toUpperCase()}...`);
        const res = await apiFetch('/api/marketplace/test-connection', {
            method: 'POST',
            body: JSON.stringify({ platform })
        });

        const statusEl = document.getElementById(`${platform}TestStatus`);
        if (statusEl) {
            statusEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-check mr-1"></i>Độ trễ: ${res.result.latency_ms}ms</span>`;
        }

        Swal.fire({
            icon: 'success',
            title: `Kết Nối API ${res.result.platform} Thành Công!`,
            html: `
                <div class="text-left text-xs space-y-1.5 mt-2">
                    <p>Gian hàng: <strong>${res.result.shop_name || res.result.seller_name}</strong></p>
                    <p>Phiên bản API: <strong>${res.result.api_version}</strong></p>
                    <p>Thời gian phản hồi máy chủ: <strong>${res.result.latency_ms}ms</strong></p>
                    <p class="text-emerald-700 font-bold pt-2 border-t">${res.result.message}</p>
                </div>
            `,
            confirmButtonColor: '#10B981'
        });
    } catch (err) {
        showToast('error', err.message || 'Lỗi kiểm tra kết nối API');
    }
}

async function triggerSyncAllMarketplaces() {
    Swal.fire({
        title: 'Đồng bộ toàn bộ kho sang Shopee & Lazada?',
        text: 'Hệ thống sẽ cập nhật số lượng tồn kho trên cả sàn Shopee và Lazada bằng số lượng kho website hiện tại.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Đồng ý đồng bộ',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#10B981'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                showToast('info', 'Đang đồng bộ kho 2 sàn...');
                const res = await apiFetch('/api/marketplace/sync-all', { method: 'POST' });
                showToast('success', res.message);
                loadMarketplaceLogs();
                loadAdminProducts();
            } catch (e) {
                showToast('error', 'Lỗi đồng bộ kho');
            }
        }
    });
}

/* ========================================================
   HỆ THỐNG ĐỒNG BỘ ĐÁM MÂY & SAO LƯU DỰ PHÒNG LIÊN MÁY TÍNH
   ======================================================== */

async function handleManualCloudSync() {
    const icon = document.getElementById('cloudSyncIcon');
    const label = document.getElementById('cloudSyncLabel');
    const badge = document.getElementById('cloudSyncCountdownBadge');

    if (icon) icon.className = 'fa-solid fa-arrows-rotate fa-spin text-sky-600';
    if (label) label.textContent = 'Đang đồng bộ...';
    if (badge) badge.textContent = 'Đồng bộ';

    try {
        showToast('info', 'Đang đẩy dữ liệu lên Đám Mây và đồng bộ 2 chiều...');
        if (typeof window.run30sCloudCycle === 'function') {
            await window.run30sCloudCycle();
        } else {
            if (typeof window.syncToCloud === 'function') await window.syncToCloud();
            if (typeof window.syncFromCloud === 'function') await window.syncFromCloud(true);
        }

        if (typeof window.resetCloudCountdown === 'function') {
            window.resetCloudCountdown(30);
        }

        await loadAdminProducts();
        await loadAdminCategories();
        renderAdminCategories();
        if (typeof loadDashboardStats === 'function') loadDashboardStats();

        updateCloudSyncUI('Đám mây: Đã lưu');
        showToast('success', 'Đã cập nhật lên đám mây thành công! Mọi thay đổi từ các máy tính khác đã được đồng bộ.');
    } catch (err) {
        console.error('Lỗi đồng bộ đám mây:', err);
        updateCloudSyncUI('Đám mây: Lỗi kết nối');
        showToast('error', 'Không thể kết nối máy chủ đám mây. Vui lòng kiểm tra mạng!');
    }
}

function updateCloudSyncUI(text) {
    const icon = document.getElementById('cloudSyncIcon');
    const label = document.getElementById('cloudSyncLabel');
    if (icon) icon.className = 'fa-solid fa-cloud text-sky-600';
    if (label) {
        const lastSync = localStorage.getItem('mintmart_last_cloud_sync');
        if (lastSync) {
            const timeStr = new Date(lastSync).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            label.textContent = `${text} (${timeStr})`;
        } else {
            label.textContent = text;
        }
    }
}

async function handleConfigureCloudUrl() {
    const currentUrl = typeof getCloudStorageUrl === 'function' ? getCloudStorageUrl() : DEFAULT_CLOUD_URL;
    const { value: newUrl, isDenied } = await Swal.fire({
        title: 'Cài Đặt Máy Chủ Đám Mây (Cloud Sync)',
        html: `
            <div class="text-left text-xs space-y-2 text-slate-600 mb-3">
                <p>Hệ thống tự động cập nhật 2 chiều lên Cloud <strong>mỗi 30 giây</strong> để đảm bảo mọi thiết bị (PC, điện thoại) luôn có dữ liệu mới nhất.</p>
                <div class="text-[11px] text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 space-y-1">
                    <p><i class="fa-solid fa-circle-check mr-1 text-emerald-600"></i> Máy chủ mặc định: <strong>api.npoint.io</strong> (Hỗ trợ CORS 100%).</p>
                    <p><i class="fa-solid fa-shield-halved mr-1 text-emerald-600"></i> Chu kỳ cập nhật: <strong>Tự động 30 giây / lần</strong>.</p>
                </div>
            </div>
            <input id="swalCloudUrlInput" class="swal2-input text-xs" placeholder="URL Cloud Storage" value="${currentUrl}">
        `,
        showCancelButton: true,
        confirmButtonText: 'Lưu Cài Đặt',
        cancelButtonText: 'Đóng',
        confirmButtonColor: '#10B981',
        showDenyButton: true,
        denyButtonText: 'Khôi Phục Mặc Định',
        denyButtonColor: '#64748B',
        preConfirm: () => {
            const input = document.getElementById('swalCloudUrlInput');
            return input ? input.value.trim() : null;
        }
    });

    if (isDenied) {
        localStorage.removeItem('mintmart_cloud_storage_url');
        showToast('info', 'Đã đặt lại URL đám mây về mặc định!');
        if (typeof window.run30sCloudCycle === 'function') window.run30sCloudCycle();
        return;
    }

    if (newUrl !== undefined && newUrl !== null) {
        if (newUrl === '') {
            localStorage.removeItem('mintmart_cloud_storage_url');
            showToast('info', 'Đã đặt lại URL đám mây về mặc định!');
        } else {
            localStorage.setItem('mintmart_cloud_storage_url', newUrl);
            showToast('success', 'Đã lưu cấu hình máy chủ đám mây mới!');
        }
        if (typeof window.run30sCloudCycle === 'function') {
            window.run30sCloudCycle();
        }
    }
}

async function handleExportBackup() {
    try {
        const res = await apiFetch('/api/cloud-sync/export');
        const data = res.data || {
            exported_at: new Date().toISOString(),
            products: JSON.parse(localStorage.getItem('mintmart_mock_products_v2') || '[]'),
            categories: JSON.parse(localStorage.getItem('mintmart_mock_categories_v2') || '[]')
        };

        const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchor = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        downloadAnchor.setAttribute("href", jsonString);
        downloadAnchor.setAttribute("download", `mintmart_backup_${dateStr}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        showToast('success', 'Đã tải file sao lưu dữ liệu JSON về máy thành công!');
    } catch (e) {
        showToast('error', 'Lỗi khi xuất file sao lưu: ' + e.message);
    }
}

async function handleImportBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            const parsed = JSON.parse(content);
            const products = parsed.products || (Array.isArray(parsed) ? parsed : null);

            if (!products || !Array.isArray(products) || products.length === 0) {
                throw new Error('File JSON không chứa danh sách sản phẩm hợp lệ!');
            }

            Swal.fire({
                title: 'Xác nhận nạp dữ liệu?',
                html: `File sao lưu chứa <strong>${products.length} sản phẩm</strong>.<br>Hệ thống sẽ cập nhật và đồng bộ tự động lên Đám Mây cho mọi máy tính khác.`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#10B981',
                cancelButtonColor: '#64748B',
                confirmButtonText: 'Đồng ý nạp & Đồng bộ',
                cancelButtonText: 'Hủy'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    await apiFetch('/api/cloud-sync/import', {
                        method: 'POST',
                        body: JSON.stringify(parsed)
                    });

                    await loadAdminProducts();
                    await loadAdminCategories();
                    renderAdminCategories();
                    if (typeof loadDashboardStats === 'function') loadDashboardStats();

                    showToast('success', `Đã nạp thành công ${products.length} sản phẩm và đồng bộ lên đám mây!`);
                }
            });
        } catch (err) {
            Swal.fire('Lỗi nhập dữ liệu', err.message, 'error');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

// Lắng nghe sự kiện đồng bộ từ đám mây (Cloud Sync Listener)
window.addEventListener('mintmart-cloud-synced', (e) => {
    console.log('[Admin UI] Nhận được cập nhật dữ liệu từ Đám mây, đang làm mới bảng...');
    updateCloudSyncUI('Đám mây: Đã đồng bộ');
    if (typeof loadAdminProducts === 'function') loadAdminProducts();
    if (typeof loadAdminCategories === 'function') {
        loadAdminCategories().then(() => {
            if (typeof renderAdminCategories === 'function') renderAdminCategories();
        });
    }
    if (typeof loadDashboardStats === 'function') loadDashboardStats();
});

window.addEventListener('mintmart-cloud-saved', (e) => {
    updateCloudSyncUI('Đám mây: Đã lưu');
});

// Lắng nghe nhịp đếm ngược 30s (Countdown Ticker)
window.addEventListener('mintmart-cloud-tick', (e) => {
    const badge = document.getElementById('cloudSyncCountdownBadge');
    if (badge) {
        badge.textContent = `${e.detail.countdown}s`;
    }
});

// Bắt đầu chu kỳ đồng bộ 30s
window.addEventListener('mintmart-cloud-sync-start', () => {
    const icon = document.getElementById('cloudSyncIcon');
    const label = document.getElementById('cloudSyncLabel');
    const badge = document.getElementById('cloudSyncCountdownBadge');
    if (icon) icon.className = 'fa-solid fa-arrows-rotate fa-spin text-sky-600';
    if (label) label.textContent = 'Đang đồng bộ...';
    if (badge) {
        badge.textContent = 'Lưu...';
        badge.className = 'px-1.5 py-0.5 text-[10px] font-mono font-black bg-amber-200 text-amber-800 rounded-md';
    }
});

// Hoàn tất chu kỳ đồng bộ 30s
window.addEventListener('mintmart-cloud-cycle-complete', (e) => {
    const icon = document.getElementById('cloudSyncIcon');
    const label = document.getElementById('cloudSyncLabel');
    const badge = document.getElementById('cloudSyncCountdownBadge');
    if (icon) icon.className = 'fa-solid fa-cloud text-sky-600';
    if (badge) {
        badge.className = 'px-1.5 py-0.5 text-[10px] font-mono font-black bg-sky-200 text-sky-800 rounded-md';
    }
    updateCloudSyncUI('Đám mây: Đã lưu');
});

// Cập nhật trạng thái đám mây khi khởi tạo admin
document.addEventListener('DOMContentLoaded', () => {
    updateCloudSyncUI('Đám mây: Tự động 30s');
});

