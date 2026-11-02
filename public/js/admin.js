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

// Check Admin Authentication
function checkAdminAuth() {
    const user = getCurrentUser();
    const loginScreen = document.getElementById('adminLoginScreen');
    const mainLayout = document.getElementById('adminMainLayout');

    if (user && user.role === 'admin') {
        loginScreen.classList.add('hidden');
        mainLayout.classList.remove('hidden');
        document.getElementById('sidebarAdminName').textContent = user.name;
        initAdminDashboard();
    } else {
        loginScreen.classList.remove('hidden');
        mainLayout.classList.add('hidden');
    }
}

// Handle Admin Login
async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmailInput').value;
    const password = document.getElementById('adminPasswordInput').value;

    try {
        const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (res.user.role !== 'admin') {
            throw new Error('Tài khoản này không có quyền quản trị viên!');
        }

        setAuth(res.token, res.user);
        showToast('success', `Chào mừng Quản trị viên ${res.user.name}!`);
        checkAdminAuth();
    } catch (err) {
        showToast('error', err.message || 'Đăng nhập quản trị thất bại');
    }
}

// Speaker Notification State
let speakerEnabled = localStorage.getItem('mintmart_speaker_enabled') !== 'false';
let lastKnownOrderIds = new Set();
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

// Âm thanh chuông báo (Ding-dong chime Web Audio API)
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

// Giọng nói tiếng Việt phát thanh: "Bạn có đơn hàng mới!"
function speakOrderAlert(text = 'Bạn có đơn hàng mới!') {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        window.speechSynthesis.speak(utterance);
    }
}

// Kích hoạt chuông + giọng nói + banner thông báo
function triggerNewOrderAlert(order) {
    if (speakerEnabled) {
        playDingDongChime();
        setTimeout(() => {
            const customer = order ? order.customer_name : '';
            const msg = customer ? `Bạn có đơn hàng mới từ ${customer}!` : 'Bạn có đơn hàng mới!';
            speakOrderAlert(msg);
        }, 300);
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

function testOrderSound() {
    playDingDongChime();
    setTimeout(() => {
        speakOrderAlert('Kiểm tra loa thông báo: Bạn có đơn hàng mới!');
    }, 300);
    showToast('info', '🔊 Đang phát thông báo qua loa: "Bạn có đơn hàng mới!"');
}

// Tự động kiểm tra đơn hàng mới trong nền
function startOrderNotificationWatcher() {
    if (isWatcherInitialized) return;
    isWatcherInitialized = true;

    // Load initial orders
    apiFetch('/api/orders').then(res => {
        const orders = res.orders || [];
        orders.forEach(o => lastKnownOrderIds.add(o.id || o.order_code));
    }).catch(() => {});

    // Poll every 6 seconds
    if (watcherInterval) clearInterval(watcherInterval);
    watcherInterval = setInterval(async () => {
        try {
            const res = await apiFetch('/api/orders');
            const orders = res.orders || [];
            let foundNew = false;
            let latestOrder = null;

            for (const o of orders) {
                const key = o.id || o.order_code;
                if (!lastKnownOrderIds.has(key)) {
                    lastKnownOrderIds.add(key);
                    foundNew = true;
                    latestOrder = o;
                }
            }

            if (foundNew && latestOrder) {
                triggerNewOrderAlert(latestOrder);
                // Refresh views
                if (currentAdminTab === 'orders') loadAdminOrders();
                if (currentAdminTab === 'dashboard') loadDashboardStats();
                if (currentAdminTab === 'marketplace') loadMarketplaceRevenueTables();
            }
        } catch (e) {}
    }, 6000);

    // Also listen to storage events
    window.addEventListener('storage', (e) => {
        if (e.key === 'mintmart_mock_orders_v2') {
            try {
                const orders = JSON.parse(e.newValue || '[]');
                if (orders.length > 0) {
                    const latest = orders[0];
                    const key = latest.id || latest.order_code;
                    if (!lastKnownOrderIds.has(key)) {
                        lastKnownOrderIds.add(key);
                        triggerNewOrderAlert(latest);
                        if (currentAdminTab === 'orders') loadAdminOrders();
                    }
                }
            } catch (err) {}
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

        // Badges in sidebar
        const sbProd = document.getElementById('sidebarProductCount');
        if (sbProd) sbProd.textContent = s.totalProducts;
        const sbOrd = document.getElementById('sidebarOrderCount');
        if (sbOrd) sbOrd.textContent = s.totalOrders;

        // Render Recent Orders in Dashboard
        const recentOrdersBody = document.getElementById('dashboardRecentOrdersBody');
        if (recentOrdersBody) {
            if (s.recentOrders.length === 0) {
                recentOrdersBody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400">Chưa có đơn hàng nào</td></tr>`;
            } else {
                recentOrdersBody.innerHTML = s.recentOrders.map(o => `
                    <tr class="hover:bg-slate-50">
                        <td class="py-2.5 px-3 font-bold text-emerald-700">${o.order_code}</td>
                        <td class="py-2.5 px-3">
                            <div class="font-bold text-slate-700">${o.customer_name}</div>
                            <div class="text-[10px] text-slate-400">${o.customer_phone}</div>
                        </td>
                        <td class="py-2.5 px-3 font-bold text-slate-800">${formatCurrency(o.total_amount)}</td>
                        <td class="py-2.5 px-3">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(o.status)}">
                                ${getStatusText(o.status)}
                            </span>
                        </td>
                        <td class="py-2.5 px-3 text-right">
                            <button onclick="viewOrderDetail(${o.id})" class="text-emerald-600 hover:text-emerald-800 font-bold">
                                Chi tiết
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

        // Init / Update Revenue Trend Chart
        initRevenueChart();

        // Init / Update Category Chart
        initCategoryChart(s.salesByCategory);

    } catch (err) {
        console.error('Lỗi tải thống kê dashboard:', err);
    }
}

// Chart.js Revenue Line Chart
function initRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const data = [1420000, 2150000, 1890000, 3400000, 2750000, 4800000, 5200000];

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Doanh thu (VNĐ)',
                data: data,
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#10B981',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    ticks: {
                        callback: (val) => (val / 1000000) + ' Tr',
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
            showToast('success', 'Đã cập nhật thông tin mặt hàng thành công!');
        } else {
            // Create
            await apiFetch('/api/products', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('success', 'Đã thêm mặt hàng mới thành công vào cửa hàng!');
        }

        closeProductModal();
        loadAdminProducts();
        loadDashboardStats(); // refresh counts
    } catch (err) {
        showToast('error', err.message || 'Lỗi khi lưu sản phẩm');
    }
}

// Delete Product
function deleteProduct(id, name) {
    Swal.fire({
        title: 'Xóa vĩnh viễn mặt hàng?',
        html: `Bạn có chắc muốn xóa <strong>"${name}"</strong> khỏi cơ sở dữ liệu? Thao tác này không thể hoàn tác.<br><span class="text-xs text-rose-500 mt-1 block">Mẹo: Nếu chỉ muốn ẩn sản phẩm khỏi web, hãy dùng nút "Gỡ bán".</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'Đồng ý xóa vĩnh viễn',
        cancelButtonText: 'Hủy'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
                showToast('success', 'Đã xóa mặt hàng thành công!');
                loadAdminProducts();
                loadDashboardStats();
            } catch (err) {
                showToast('error', err.message || 'Lỗi khi xóa sản phẩm');
            }
        }
    });
}

// Delete Product
function deleteProduct(id, name) {
    Swal.fire({
        title: 'Xóa mặt hàng này?',
        html: `Bạn có chắc muốn xóa <strong>"${name}"</strong> khỏi cửa hàng? Thao tác này không thể hoàn tác.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'Đồng ý xóa',
        cancelButtonText: 'Hủy'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
                showToast('success', 'Đã xóa mặt hàng thành công!');
                loadAdminProducts();
                loadDashboardStats();
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
            <td class="py-2.5 px-3">
                <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    <i class="fa-solid ${c.icon || 'fa-tag'}"></i>
                </div>
            </td>
            <td class="py-2.5 px-3 font-bold text-slate-800">${c.name}</td>
            <td class="py-2.5 px-3 text-slate-400 font-mono text-[11px]">${c.slug}</td>
            <td class="py-2.5 px-3">
                <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    ${c.product_count || 0} sản phẩm
                </span>
            </td>
            <td class="py-2.5 px-3 text-right">
                <button onclick="deleteCategory(${c.id}, '${safeName}')" class="px-2.5 py-1 text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg transition inline-flex items-center" title="Xóa danh mục này">
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

function filterOrdersByStatus(status) {
    currentOrderFilter = status;

    // Update pill buttons
    const pills = document.querySelectorAll('.order-pill');
    pills.forEach(p => {
        p.className = 'order-pill px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200';
    });

    event.target.className = 'order-pill active px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold';
    loadAdminOrders();
}

function renderAdminOrdersTable(orders) {
    const tbody = document.getElementById('adminOrdersTableBody');
    if (!tbody) return;

    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400">Không có đơn hàng nào trong mục này</td></tr>`;
        return;
    }

    tbody.innerHTML = orders.map(o => `
        <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4 font-black text-emerald-700">${o.order_code}</td>
            <td class="py-3 px-3">
                <div class="font-bold text-slate-800">${o.customer_name}</div>
                <div class="text-[10px] text-slate-400 truncate max-w-xs">${o.shipping_address}</div>
            </td>
            <td class="py-3 px-3 text-slate-600 font-medium">${o.customer_phone}</td>
            <td class="py-3 px-3 font-extrabold text-slate-800">${formatCurrency(o.total_amount)}</td>
            <td class="py-3 px-3">
                <div class="flex flex-col gap-1 items-start">
                    <span class="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        ${o.payment_method || 'COD'}
                    </span>
                    ${o.payment_status === 'paid'
                        ? `<button onclick="toggleOrderPaymentStatus(${o.id}, 'pending')" class="text-[9px] font-black bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-1.5 py-0.5 rounded-full flex items-center transition" title="Bấm để đổi sang Chờ thanh toán"><i class="fa-solid fa-check mr-1 text-emerald-600"></i>Đã TT</button>`
                        : `<button onclick="toggleOrderPaymentStatus(${o.id}, 'paid')" class="text-[9px] font-black bg-amber-100 text-amber-800 hover:bg-amber-200 px-1.5 py-0.5 rounded-full flex items-center transition" title="Bấm để xác nhận Đã thanh toán"><i class="fa-regular fa-clock mr-1 text-amber-600"></i>Chờ TT</button>`
                    }
                </div>
            </td>
            <td class="py-3 px-3">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(o.status)}">
                    ${getStatusText(o.status)}
                </span>
            </td>
            <td class="py-3 px-3 text-slate-400 text-[11px]">${formatDate(o.created_at)}</td>
            <td class="py-3 px-4 text-right">
                <button onclick="viewOrderDetail(${o.id})" class="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition">
                    Xử lý
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

                <!-- Customer Details -->
                <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5">
                    <div class="font-bold text-slate-700">Thông tin người nhận:</div>
                    <div class="text-slate-600">Họ và tên: <strong>${order.customer_name}</strong></div>
                    <div class="text-slate-600">Số điện thoại: <strong>${order.customer_phone}</strong></div>
                    ${order.customer_email ? `<div class="text-slate-600">Email: ${order.customer_email}</div>` : ''}
                    <div class="text-slate-600">Địa chỉ giao: <strong>${order.shipping_address}</strong></div>
                    <div class="text-slate-600">Phương thức: <strong>${order.payment_method}</strong></div>
                    ${order.note ? `<div class="text-amber-700 italic bg-amber-50 p-2 rounded-lg mt-1">Ghi chú: "${order.note}"</div>` : ''}
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

