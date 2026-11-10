/**
 * MintMart - Shared API & Utilities
 * Hỗ trợ Dual-Mode: Tự động kết nối Express + SQLite Backend khi chạy local,
 * hoặc kích hoạt Client-side Mock Database khi chạy trên GitHub Pages / Static Hosting.
 */

const API_BASE = ''; // Same origin
let _mintmartBackendAvailable = null;

function getApiBase() {
    try {
        const custom = localStorage.getItem('mintmart_backend_url') || localStorage.getItem('mintmart_api_base');
        if (custom && custom.trim()) {
            return custom.trim().replace(/\/+$/, '');
        }
    } catch (e) {}
    return API_BASE;
}

// Storage keys
const TOKEN_KEY = 'mintmart_token';
const USER_KEY = 'mintmart_user';
const CART_KEY = 'mintmart_cart';
const MOCK_PRODUCTS_KEY = 'mintmart_mock_products_v2';
const MOCK_CATEGORIES_KEY = 'mintmart_mock_categories_v2';
const MOCK_DELETED_PRODUCTS_KEY = 'mintmart_deleted_products_v2';
const MOCK_DELETED_CATEGORIES_KEY = 'mintmart_deleted_categories_v2';
const MOCK_ORDERS_KEY = 'mintmart_mock_orders_v2';
const MOCK_LOGS_KEY = 'mintmart_mock_logs_v2';
const MOCK_USERS_KEY = 'mintmart_mock_users_v2';

function getMockUsers() {
    try {
        const stored = localStorage.getItem(MOCK_USERS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            const demoEmails = ['khachhang@gmail.com', 'maitran@gmail.com', 'longle@gmail.com'];
            const cleaned = parsed.filter(u => u && (u.role === 'admin' || !demoEmails.includes((u.email || '').toLowerCase().trim())));
            if (cleaned.length !== parsed.length) {
                localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(cleaned));
            }
            return cleaned;
        }
    } catch (e) {}
    const adminEmail = (localStorage.getItem('mock_admin_email') || 'admin@mintmart.vn').toLowerCase().trim();
    const adminName = localStorage.getItem('mock_admin_name') || 'Quản Trị Viên (Admin)';
    const initUsers = [
        { id: 1, name: adminName, email: adminEmail, phone: '0901234567', address: '124 Hoàng Quốc Việt, Cầu Giấy, Hà Nội', role: 'admin', created_at: '2026-10-01' }
    ];
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(initUsers));
    return initUsers;
}

// Danh sách sản phẩm đã bị xóa vĩnh viễn (Tombstones - Ngăn sản phẩm cũ hồi sinh)
function getDeletedProductIds() {
    try {
        const stored = localStorage.getItem(MOCK_DELETED_PRODUCTS_KEY);
        const list = stored ? JSON.parse(stored) : [];
        // Mặc định luôn ghi nhớ các ID sản phẩm demo/test đã xóa vĩnh viễn (id: 13, 14)
        if (!list.includes(13)) list.push(13);
        if (!list.includes(14)) list.push(14);
        return list;
    } catch (e) {
        return [13, 14];
    }
}

function recordDeletedProductId(id) {
    try {
        const list = getDeletedProductIds();
        const numId = Number(id);
        if (!list.includes(numId)) {
            list.push(numId);
            localStorage.setItem(MOCK_DELETED_PRODUCTS_KEY, JSON.stringify(list));
        }
        return list;
    } catch (e) {
        return [13, 14];
    }
}

// Cấu hình Đồng Bộ Đám Mây Đa Thiết Bị (Cross-Device Cloud Sync)
// Đảm bảo khi Admin sửa/thêm/xóa sản phẩm trên máy tính, tất cả các máy khác (điện thoại, máy tính khác)
// và sang ngày hôm sau dữ liệu vẫn được lưu trữ vĩnh viễn, không bị mất và không quay về demo data!
const CLOUD_STORAGE_URL_KEY = 'mintmart_cloud_storage_url';
const DEFAULT_CLOUD_URL = 'https://api.npoint.io/5d9be062d0b238760026';
const STATIC_FALLBACK_URL = 'data/cloud-store.json';

function getCloudStorageUrl() {
    try {
        const stored = localStorage.getItem(CLOUD_STORAGE_URL_KEY);
        // Tự động chuyển đổi sang máy chủ npoint có CORS 100% nếu máy còn lưu cache url cũ
        if (stored && !stored.includes('extendsclass.com')) {
            return stored;
        }
        localStorage.setItem(CLOUD_STORAGE_URL_KEY, DEFAULT_CLOUD_URL);
        return DEFAULT_CLOUD_URL;
    } catch (e) {
        return DEFAULT_CLOUD_URL;
    }
}

// 1. Initial Seed Data for Static / GitHub Pages Mode (12 sản phẩm chuẩn chính hãng)
const SEED_CATEGORIES = [
    { id: 1, name: 'Công nghệ & Điện tử', slug: 'cong-nghe-dien-tu', icon: 'fa-laptop', description: 'Điện thoại, laptop, tai nghe và phụ kiện chính hãng', product_count: 4 },
    { id: 2, name: 'Thời trang & Phụ kiện', slug: 'thoi-trang', icon: 'fa-shirt', description: 'Trang phục thời trang nam nữ, túi xách, đồng hồ', product_count: 2 },
    { id: 3, name: 'Nhà cửa & Đời sống', slug: 'nha-cua-doi-song', icon: 'fa-couch', description: 'Nội thất, đèn ngủ, thiết bị gia dụng tiện ích', product_count: 2 },
    { id: 4, name: 'Làm đẹp & Sức khỏe', slug: 'lam-dep-suc-khoe', icon: 'fa-spa', description: 'Mỹ phẩm hữu cơ, kem dưỡng da, nước hoa tự nhiên', product_count: 1 },
    { id: 5, name: 'Đồ gia dụng thông minh', slug: 'do-gia-dung', icon: 'fa-blender', description: 'Nồi chiên không dầu, robot hút bụi, máy xay sinh tố', product_count: 2 },
    { id: 6, name: 'Sách & Văn phòng phẩm', slug: 'sach-van-phong', icon: 'fa-book-open', description: 'Sách kỹ năng, kinh doanh, sổ tay cao cấp', product_count: 1 }
];

const SEED_PRODUCTS = [
    {
        id: 1,
        name: 'Tai nghe Bluetooth Không Dây Mint Sound Pro',
        slug: 'tai-nghe-bluetooth-mint-sound-pro',
        category_id: 1,
        category_name: 'Công nghệ & Điện tử',
        price: 890000,
        original_price: 1290000,
        stock: 40,
        image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
        badge: 'HOT',
        rating: 4.9,
        sold_count: 0,
        description: 'Tai nghe chống ồn chủ động cao cấp, âm bass mạnh mẽ, pin trâu 36 giờ, màu xanh bạc hà thanh lịch.',
        is_active: 1,
        shopee_item_id: 'SHP-10001234',
        shopee_stock: 40,
        lazada_item_id: 'LAZ-20004321',
        lazada_stock: 40,
        auto_sync_marketplace: 1
    },
    {
        id: 2,
        name: 'Đồng Hồ Thông Minh Mint FitTrack V2 Chống Nước',
        slug: 'dong-ho-thong-minh-mint-fittrack-v2',
        category_id: 1,
        category_name: 'Công nghệ & Điện tử',
        price: 1450000,
        original_price: 1950000,
        stock: 30,
        image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
        badge: 'GIẢM 25%',
        rating: 4.8,
        sold_count: 0,
        description: 'Đo nhịp tim, nồng độ oxy SpO2, theo dõi giấc ngủ và 100 chế độ tập luyện. Màn hình AMOLED 1.4 inch sắc nét.',
        is_active: 1,
        shopee_item_id: 'SHP-10002468',
        shopee_stock: 30,
        lazada_item_id: 'LAZ-20008642',
        lazada_stock: 30,
        auto_sync_marketplace: 1
    },
    {
        id: 3,
        name: 'Bàn Phím Cơ Không Dây Mint Matcha Keycaps RGB',
        slug: 'ban-phim-co-khong-day-mint-matcha',
        category_id: 1,
        category_name: 'Công nghệ & Điện tử',
        price: 1250000,
        original_price: 1550000,
        stock: 22,
        image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
        badge: 'BÁN CHẠY',
        rating: 5.0,
        sold_count: 0,
        description: 'Layout 75%, switch gõ êm ái, kết nối 3 chế độ (Bluetooth 5.1 / 2.4GHz / Type-C), pin dùng 4 tuần.',
        is_active: 1,
        shopee_item_id: 'SHP-10003702',
        shopee_stock: 22,
        lazada_item_id: 'LAZ-20012963',
        lazada_stock: 22,
        auto_sync_marketplace: 1
    },
    {
        id: 4,
        name: 'Áo Hoodie Unisex Organic Cotton Màu Xanh Bạc Hà',
        slug: 'ao-hoodie-unisex-mint-organic',
        category_id: 2,
        category_name: 'Thời trang & Phụ kiện',
        price: 390000,
        original_price: 520000,
        stock: 60,
        image_url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80',
        badge: 'MỚI',
        rating: 4.7,
        sold_count: 0,
        description: 'Chất liệu nỉ cotton 100% tự nhiên mềm mịn, thoáng mát, form rộng hiện đại chuẩn Hàn Quốc.',
        is_active: 1,
        shopee_item_id: 'SHP-10004936',
        shopee_stock: 60,
        lazada_item_id: 'LAZ-20017284',
        lazada_stock: 60,
        auto_sync_marketplace: 1
    },
    {
        id: 5,
        name: 'Balo Du Lịch Chống Thấm Nước Mint Urban Minimalist',
        slug: 'balo-du-lich-mint-urban',
        category_id: 2,
        category_name: 'Thời trang & Phụ kiện',
        price: 480000,
        original_price: 650000,
        stock: 35,
        image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80',
        badge: 'GIẢM 26%',
        rating: 4.8,
        sold_count: 0,
        description: 'Chứa vừa laptop 15.6 inch, thiết kế ngăn thông minh, đệm lưng êm ái chống gù lưng, vải Oxford kháng nước.',
        is_active: 1,
        shopee_item_id: 'SHP-10006170',
        shopee_stock: 35,
        lazada_item_id: 'LAZ-20021605',
        lazada_stock: 35,
        auto_sync_marketplace: 1
    },
    {
        id: 6,
        name: 'Đèn Bàn LED Đọc Sách Bảo Vệ Mắt Cảm Ứng Mint Light',
        slug: 'den-ban-led-mint-light',
        category_id: 3,
        category_name: 'Nhà cửa & Đời sống',
        price: 320000,
        original_price: 450000,
        stock: 50,
        image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80',
        badge: 'HOT',
        rating: 4.9,
        sold_count: 0,
        description: 'Không ánh sáng xanh gây hại, tùy chỉnh 3 dải màu và 5 cấp độ sáng cảm ứng, tích hợp sạc pin tiện lợi.',
        is_active: 1,
        shopee_item_id: 'SHP-10007404',
        shopee_stock: 50,
        lazada_item_id: 'LAZ-20025926',
        lazada_stock: 50,
        auto_sync_marketplace: 1
    },
    {
        id: 7,
        name: 'Bình Giữ Nhiệt Inox 316 Cao Cấp 800ml Màu Mint',
        slug: 'binh-giu-nhiet-inox-mint-800ml',
        category_id: 3,
        category_name: 'Nhà cửa & Đời sống',
        price: 245000,
        original_price: 350000,
        stock: 80,
        image_url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80',
        badge: 'BEST SELLER',
        rating: 4.9,
        sold_count: 0,
        description: 'Giữ nóng 12 tiếng, giữ lạnh 24 tiếng. Lõi Inox 316 y tế an toàn cho sức khỏe, có quai xách thể thao.',
        is_active: 1,
        shopee_item_id: 'SHP-10008638',
        shopee_stock: 80,
        lazada_item_id: 'LAZ-20030247',
        lazada_stock: 80,
        auto_sync_marketplace: 1
    },
    {
        id: 8,
        name: 'Bộ Serum Tinh Chất Trà Xanh & Rau Má Làm Dịu Da Mint Herbal',
        slug: 'bo-serum-tra-xanh-rau-ma-mint-herbal',
        category_id: 4,
        category_name: 'Làm đẹp & Sức khỏe',
        price: 380000,
        original_price: 490000,
        stock: 40,
        image_url: 'https://images.unsplash.com/photo-1608248597359-2e0618012678?w=800&auto=format&fit=crop&q=80',
        badge: 'THIÊN NHIÊN',
        rating: 4.8,
        sold_count: 0,
        description: 'Chiết xuất 100% thảo mộc organic xanh mát, kiểm soát dầu thừa, se khít lỗ chân lông và phục hồi da nhạy cảm.',
        is_active: 1,
        shopee_item_id: 'SHP-10009872',
        shopee_stock: 40,
        lazada_item_id: 'LAZ-20034568',
        lazada_stock: 40,
        auto_sync_marketplace: 1
    },
    {
        id: 9,
        name: 'Nồi Chiên Không Dầu Điện Tử 6.5L Mint AirFryer Master',
        slug: 'noi-chien-khong-dau-mint-airfryer-6-5l',
        category_id: 5,
        category_name: 'Đồ gia dụng thông minh',
        price: 1690000,
        original_price: 2200000,
        stock: 15,
        image_url: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=800&auto=format&fit=crop&q=80',
        badge: 'GIẢM 23%',
        rating: 4.9,
        sold_count: 0,
        description: 'Công nghệ đốt nhiệt Rapid Air tuần hoàn 360 độ, giảm 85% chất béo, mặt kính quan sát tiện lợi.',
        is_active: 1,
        shopee_item_id: 'SHP-10011106',
        shopee_stock: 15,
        lazada_item_id: 'LAZ-20038889',
        lazada_stock: 15,
        auto_sync_marketplace: 1
    },
    {
        id: 10,
        name: 'Máy Xay Sinh Tố Cầm Tay Mini Tiện Dụng Mint Blend',
        slug: 'may-xay-sinh-to-cam-tay-mint-blend',
        category_id: 5,
        category_name: 'Đồ gia dụng thông minh',
        price: 295000,
        original_price: 420000,
        stock: 65,
        image_url: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&auto=format&fit=crop&q=80',
        badge: 'HOT',
        rating: 4.6,
        sold_count: 0,
        description: 'Lưỡi dao thép 6 cánh sắc bén, sạc qua cổng Type-C, nhỏ gọn mang đi làm hoặc tập gym mọi lúc mọi nơi.',
        is_active: 1,
        shopee_item_id: 'SHP-10012340',
        shopee_stock: 65,
        lazada_item_id: 'LAZ-20043210',
        lazada_stock: 65,
        auto_sync_marketplace: 1
    },
    {
        id: 11,
        name: 'Sổ Tay Bìa Da Khắc Laser Màu Xanh Bạc Hà Mint Journal',
        slug: 'so-tay-bia-da-mint-journal',
        category_id: 6,
        category_name: 'Sách & Văn phòng phẩm',
        price: 135000,
        original_price: 180000,
        stock: 100,
        image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
        badge: 'MỚI',
        rating: 4.9,
        sold_count: 0,
        description: 'Giấy ford định lượng 100gsm chống thấm mực cao cấp, bìa da PU chống nước, ruy băng đánh dấu trang.',
        is_active: 1,
        shopee_item_id: 'SHP-10013574',
        shopee_stock: 100,
        lazada_item_id: 'LAZ-20047531',
        lazada_stock: 100,
        auto_sync_marketplace: 1
    },
    {
        id: 12,
        name: 'Loa Bluetooth Kháng Nước Mini Mint BassGo',
        slug: 'loa-bluetooth-mint-bassgo',
        category_id: 1,
        category_name: 'Công nghệ & Điện tử',
        price: 520000,
        original_price: 690000,
        stock: 28,
        image_url: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80',
        badge: 'HOT',
        rating: 4.8,
        sold_count: 0,
        description: 'Âm thanh 360 độ sống động, chống nước chuẩn IPX7, pin nghe nhạc liên tục 15 giờ.',
        is_active: 1,
        shopee_item_id: 'SHP-10014808',
        shopee_stock: 28,
        lazada_item_id: 'LAZ-20051852',
        lazada_stock: 28,
        auto_sync_marketplace: 1
    }
];

const SEED_ORDERS = [];

// Helper to access LocalStorage Mock DB
function getMockProducts() {
    const deletedIds = getDeletedProductIds();
    let prods = [];
    try {
        const stored = localStorage.getItem(MOCK_PRODUCTS_KEY);
        if (stored) {
            prods = JSON.parse(stored);
        } else {
            prods = [...SEED_PRODUCTS];
        }
    } catch (e) {
        prods = [...SEED_PRODUCTS];
    }

    // Lọc bỏ vĩnh viễn các sản phẩm đã xóa hoặc có thuộc tính is_deleted / deleted
    const cleanProds = prods.filter(p => p && !deletedIds.includes(Number(p.id)) && !p.is_deleted && p.deleted !== true);
    localStorage.setItem(MOCK_PRODUCTS_KEY, JSON.stringify(cleanProds));
    return cleanProds;
}

function saveMockProducts(prods) {
    const deletedIds = getDeletedProductIds();
    const cleanProds = prods.filter(p => p && !deletedIds.includes(Number(p.id)) && !p.is_deleted && p.deleted !== true);
    localStorage.setItem(MOCK_PRODUCTS_KEY, JSON.stringify(cleanProds));
    // Tự động đồng bộ lên Đám Mây để các máy khác cập nhật ngay lập tức
    syncToCloud({ products: cleanProds });
    if (typeof resetCloudCountdown === 'function') resetCloudCountdown(30);
}

// ========================================================
// HỆ THỐNG ĐỒNG BỘ ĐÁM MÂY (CROSS-DEVICE CLOUD SYNC)
// ========================================================
let isSyncingFromCloud = false;
let isSyncingToCloud = false;
let pendingCloudSyncTimeout = null;
let cloudSyncCountdown = 30;
let cloudCountdownInterval = null;

async function syncFromCloud(force = false) {
    if (isSyncingFromCloud) return null;
    isSyncingFromCloud = true;

    try {
        const cloudUrl = getCloudStorageUrl();
        let data = null;

        // 1. Thử tải dữ liệu từ máy chủ đám mây chính
        if (cloudUrl) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);
                const res = await fetch(cloudUrl, {
                    method: 'GET',
                    cache: 'no-cache',
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    data = await res.json();
                } else {
                    console.warn('[Cloud Sync] Máy chủ trả về mã:', res.status);
                }
            } catch (fetchErr) {
                console.warn('[Cloud Sync Fetch Error]:', fetchErr.message);
            }
        }

        // 2. Dự phòng: nếu máy chủ đám mây không tải được, thử tải dữ liệu tĩnh data/cloud-store.json (luôn có trên GitHub Pages)
        if (!data || !Array.isArray(data.products) || data.products.length === 0) {
            try {
                const staticRes = await fetch(STATIC_FALLBACK_URL, { cache: 'no-cache' });
                if (staticRes.ok) {
                    data = await staticRes.json();
                }
            } catch (staticErr) {}
        }

        if (data) {
            // Đồng bộ danh sách các ID sản phẩm đã xóa vĩnh viễn (Tombstones)
            if (Array.isArray(data.deleted_product_ids)) {
                data.deleted_product_ids.forEach(delId => recordDeletedProductId(delId));
            }
            const activeDeletedIds = getDeletedProductIds();

            if (Array.isArray(data.products)) {
                // Lọc bỏ ngay lập tức bất kỳ sản phẩm nào có ID trong danh sách đã xóa hoặc có cờ is_deleted
                const cleanCloudProducts = data.products.filter(p => 
                    p && !activeDeletedIds.includes(Number(p.id)) && !p.is_deleted && p.deleted !== true
                );

                const localProducts = localStorage.getItem(MOCK_PRODUCTS_KEY);
                const cloudProductsStr = JSON.stringify(cleanCloudProducts);

                if (force || !localProducts || localProducts !== cloudProductsStr) {
                    localStorage.setItem(MOCK_PRODUCTS_KEY, cloudProductsStr);
                    if (Array.isArray(data.categories) && data.categories.length > 0) {
                        localStorage.setItem(MOCK_CATEGORIES_KEY, JSON.stringify(data.categories));
                    }
                    const syncTime = data.updated_at || new Date().toISOString();
                    localStorage.setItem('mintmart_last_cloud_sync', syncTime);
                    console.log(`[Cloud Sync] Đã đồng bộ thành công ${cleanCloudProducts.length} sản phẩm từ Đám Mây liên thiết bị!`);
                    window.dispatchEvent(new CustomEvent('mintmart-cloud-synced', { detail: { ...data, products: cleanCloudProducts } }));
                }
                return { ...data, products: cleanCloudProducts };
            }
        }
    } catch (err) {
        console.warn('[Cloud Sync Fetch Error]:', err.message);
    } finally {
        isSyncingFromCloud = false;
    }
    return null;
}

async function syncToCloud(partialData = {}) {
    try {
        const cloudUrl = getCloudStorageUrl();
        if (!cloudUrl) return;

        if (isSyncingToCloud) return;
        isSyncingToCloud = true;

        const deletedIds = getDeletedProductIds();
        const rawProds = partialData.products || getMockProducts();
        const prods = rawProds.filter(p => p && !deletedIds.includes(Number(p.id)) && !p.is_deleted && p.deleted !== true);
        const cats = partialData.categories || getMockCategories();

        const payload = {
            updated_at: new Date().toISOString(),
            version: 3,
            source: 'MintMart Live Sync (Auto 30s)',
            deleted_product_ids: deletedIds,
            products: prods,
            categories: cats
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);

        const res = await fetch(cloudUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const syncTime = payload.updated_at;
            localStorage.setItem('mintmart_last_cloud_sync', syncTime);
            console.log(`[Cloud Sync] Đã lưu ${prods.length} sản phẩm lên Đám Mây thành công! (Đã loại trừ ${deletedIds.length} ID đã xóa)`);
            window.dispatchEvent(new CustomEvent('mintmart-cloud-saved', { detail: { syncTime, count: prods.length } }));
        } else {
            console.warn('[Cloud Sync Save] Máy chủ báo mã:', res.status);
        }
    } catch (saveErr) {
        console.warn('[Cloud Sync Save Exception]:', saveErr.message);
    } finally {
        isSyncingToCloud = false;
    }
}

// Chu kỳ tự động đồng bộ 2 chiều lên & xuống Đám Mây (Chu kỳ 30s)
async function run30sCloudCycle() {
    try {
        window.dispatchEvent(new CustomEvent('mintmart-cloud-sync-start'));
        // 1. Đẩy các thay đổi cục bộ hiện tại lên đám mây
        await syncToCloud();
        // 2. Kéo các thay đổi mới nhất từ các máy tính khác về
        await syncFromCloud();
        const now = new Date().toISOString();
        window.dispatchEvent(new CustomEvent('mintmart-cloud-cycle-complete', {
            detail: { timestamp: now }
        }));
    } catch (e) {
        console.warn('[Cloud 30s Cycle Exception]:', e);
    }
}

function resetCloudCountdown(seconds = 30) {
    cloudSyncCountdown = seconds;
}

// Tự động khởi chạy đồng bộ nền với Đám Mây khi chạy trang web
if (typeof window !== 'undefined') {
    // Tải dữ liệu ban đầu
    setTimeout(() => {
        syncFromCloud().catch(() => {});
    }, 200);

    // Ticker mỗi 1 giây: đếm ngược 30s và thực hiện đồng bộ 2 chiều khi hết giờ
    if (cloudCountdownInterval) clearInterval(cloudCountdownInterval);
    cloudCountdownInterval = setInterval(() => {
        cloudSyncCountdown--;
        if (cloudSyncCountdown <= 0) {
            cloudSyncCountdown = 30;
            run30sCloudCycle().catch(() => {});
        }
        window.dispatchEvent(new CustomEvent('mintmart-cloud-tick', {
            detail: {
                countdown: cloudSyncCountdown,
                total: 30,
                lastSync: localStorage.getItem('mintmart_last_cloud_sync')
            }
        }));
    }, 1000);

    // Export ra window để sử dụng toàn cục
    window.syncFromCloud = syncFromCloud;
    window.syncToCloud = syncToCloud;
    window.run30sCloudCycle = run30sCloudCycle;
    window.resetCloudCountdown = resetCloudCountdown;
    window.getCloudStorageUrl = getCloudStorageUrl;
    window.getDeletedProductIds = getDeletedProductIds;
    window.recordDeletedProductId = recordDeletedProductId;
}

function getMockCategories() {
    try {
        const stored = localStorage.getItem(MOCK_CATEGORIES_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem(MOCK_CATEGORIES_KEY, JSON.stringify(SEED_CATEGORIES));
    return SEED_CATEGORIES;
}

function getMockOrders() {
    try {
        const stored = localStorage.getItem(MOCK_ORDERS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            const cleaned = parsed.filter(o => o && !['MM-98214', 'MM-98215', 'MM-98216'].includes(o.order_code));
            if (cleaned.length !== parsed.length) {
                localStorage.setItem(MOCK_ORDERS_KEY, JSON.stringify(cleaned));
            }
            return cleaned;
        }
    } catch (e) {}
    localStorage.setItem(MOCK_ORDERS_KEY, JSON.stringify([]));
    return [];
}

function saveMockOrders(orders) {
    localStorage.setItem(MOCK_ORDERS_KEY, JSON.stringify(orders));
}

function getMockLogs() {
    try {
        const stored = localStorage.getItem(MOCK_LOGS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            const cleaned = parsed.filter(l => l && !['MM-98214', 'MM-98215', 'MM-98216'].includes(l.order_code));
            if (cleaned.length !== parsed.length) {
                localStorage.setItem(MOCK_LOGS_KEY, JSON.stringify(cleaned));
            }
            return cleaned;
        }
    } catch (e) {}
    localStorage.setItem(MOCK_LOGS_KEY, JSON.stringify([]));
    return [];
}

// Check if running on GitHub Pages, static host or offline fallback
function isStaticOrGitHubPages() {
    if (_mintmartBackendAvailable === false) return true;
    if (_mintmartBackendAvailable === true) return false;

    try {
        const forcedMode = localStorage.getItem('mintmart_app_mode');
        if (forcedMode === 'static') return true;
        if (forcedMode === 'backend') return false;
    } catch (e) {}

    return window.location.hostname.includes('github.io') || 
           window.location.protocol === 'file:' || 
           window.location.port === '5500' ||
           (window.location.hostname === 'localhost' && window.location.port === '');
}

// 2. Client-side Mock Handler
async function handleMockApi(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const urlObj = new URL(endpoint, 'http://dummy.local');
    const path = urlObj.pathname;
    const query = urlObj.searchParams;

    // Simulate small realistic network delay (50ms)
    await new Promise(r => setTimeout(r, 50));

    // A. CATEGORIES
    if (path === '/api/categories') {
        if (method === 'POST') {
            const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
            const categories = getMockCategories();
            const newId = categories.length > 0 ? Math.max(...categories.map(c => c.id)) + 1 : 1;
            const newCat = {
                id: newId,
                name: body.name || 'Danh mục mới',
                slug: (body.name || 'danh-muc').toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + newId,
                icon: body.icon || 'fa-tag',
                description: body.description || '',
                product_count: 0
            };
            categories.push(newCat);
            localStorage.setItem(MOCK_CATEGORIES_KEY, JSON.stringify(categories));
            syncToCloud({ categories });
            return { success: true, message: 'Tạo danh mục mới thành công!', categoryId: newId };
        }
        const categories = getMockCategories();
        const products = getMockProducts();
        categories.forEach(c => {
            c.product_count = products.filter(p => p.category_id == c.id && p.is_active == 1).length;
        });
        return { success: true, categories };
    }

    // A2. DELETE CATEGORY (ADMIN)
    const delCatMatch = path.match(/^\/api\/categories\/(\d+)$/);
    if (delCatMatch && method === 'DELETE') {
        const id = parseInt(delCatMatch[1], 10);
        let categories = getMockCategories();
        const cat = categories.find(c => c.id === id);
        if (!cat) throw new Error('Không tìm thấy danh mục cần xóa');
        categories = categories.filter(c => c.id !== id);
        localStorage.setItem(MOCK_CATEGORIES_KEY, JSON.stringify(categories));

        // Unlink products in this category
        const prods = getMockProducts();
        prods.forEach(p => {
            if (p.category_id === id) {
                p.category_id = null;
                p.category_name = 'Khác';
            }
        });
        saveMockProducts(prods);
        syncToCloud({ categories, products: prods });

        return {
            success: true,
            message: `Đã xóa danh mục "${cat.name}" thành công! Các sản phẩm liên quan đã được chuyển sang danh mục mặc định và đồng bộ tức thì với trang web khách hàng.`
        };
    }

    // B. HOT PRODUCTS
    if (path === '/api/products/hot') {
        let prods = getMockProducts().filter(p => p.is_active == 1);
        prods.sort((a, b) => {
            const aIsHot = (a.badge || '').includes('HOT') ? 1 : (a.badge || '').includes('BÁN CHẠY') ? 2 : 3;
            const bIsHot = (b.badge || '').includes('HOT') ? 1 : (b.badge || '').includes('BÁN CHẠY') ? 2 : 3;
            if (aIsHot !== bIsHot) return aIsHot - bIsHot;
            return (b.sold_count || 0) - (a.sold_count || 0);
        });
        const topHot = prods.slice(0, 8);
        return { success: true, count: topHot.length, products: topHot };
    }

    // C. PRODUCTS LIST
    if (path === '/api/products' && method === 'GET') {
        let prods = [...getMockProducts()];
        const adminView = query.get('adminView');
        const status = query.get('status');
        const categoryId = query.get('category_id');
        const search = (query.get('search') || '').toLowerCase().trim();
        const minPrice = parseFloat(query.get('minPrice'));
        const maxPrice = parseFloat(query.get('maxPrice'));
        const sort = query.get('sort');
        const hot = query.get('hot');
        const onSale = query.get('on_sale');

        // Status filter
        if (!adminView || adminView === '0') {
            prods = prods.filter(p => p.is_active == 1);
        } else if (status === 'active') {
            prods = prods.filter(p => p.is_active == 1);
        } else if (status === 'inactive' || status === 'unlisted') {
            prods = prods.filter(p => p.is_active == 0);
        }

        // Hot filter
        if (hot === '1' || hot === 'true') {
            prods = prods.filter(p => (p.badge || '').includes('HOT') || (p.badge || '').includes('BÁN CHẠY') || p.sold_count >= 200);
        }

        // On sale filter
        if (onSale === '1' || onSale === 'true') {
            prods = prods.filter(p => p.original_price && p.original_price > p.price);
        }

        // Category filter
        if (categoryId && categoryId !== 'all') {
            prods = prods.filter(p => p.category_id == categoryId);
        }

        // Search
        if (search) {
            prods = prods.filter(p => 
                (p.name || '').toLowerCase().includes(search) || 
                (p.description || '').toLowerCase().includes(search)
            );
        }

        // Price filter
        if (!isNaN(minPrice)) prods = prods.filter(p => p.price >= minPrice);
        if (!isNaN(maxPrice)) prods = prods.filter(p => p.price <= maxPrice);

        // Sorting
        if (sort === 'price-asc' || sort === 'price_asc') prods.sort((a, b) => a.price - b.price);
        else if (sort === 'price-desc' || sort === 'price_desc') prods.sort((a, b) => b.price - a.price);
        else if (sort === 'best-seller' || sort === 'popular') prods.sort((a, b) => (b.sold_count || 0) - (a.sold_count || 0));
        else if (sort === 'discount') {
            prods.sort((a, b) => {
                const discA = a.original_price ? (a.original_price - a.price) / a.original_price : 0;
                const discB = b.original_price ? (b.original_price - b.price) / b.original_price : 0;
                return discB - discA;
            });
        } else {
            prods.sort((a, b) => b.id - a.id);
        }

        return { success: true, count: prods.length, products: prods };
    }

    // D. SINGLE PRODUCT
    const prodMatch = path.match(/^\/api\/products\/(\d+)$/);
    if (prodMatch && method === 'GET') {
        const id = parseInt(prodMatch[1], 10);
        const p = getMockProducts().find(item => item.id === id);
        if (!p) throw new Error('Không tìm thấy sản phẩm');
        return { success: true, product: p };
    }

    // E. TOGGLE ACTIVE (GỠ SẢN PHẨM / MỞ BÁN)
    const toggleMatch = path.match(/^\/api\/products\/(\d+)\/toggle-active$/);
    if (toggleMatch && method === 'PATCH') {
        const id = parseInt(toggleMatch[1], 10);
        const prods = getMockProducts();
        const p = prods.find(item => item.id === id);
        if (!p) throw new Error('Không tìm thấy sản phẩm');
        p.is_active = p.is_active == 1 ? 0 : 1;
        saveMockProducts(prods);
        return {
            success: true,
            is_active: p.is_active,
            message: p.is_active == 1 ? `Đã đăng mở bán lại trên website! ("${p.name}")` : `Đã gỡ sản phẩm khỏi website bán hàng! ("${p.name}")`
        };
    }

    // F. CREATE PRODUCT (ADMIN)
    if (path === '/api/products' && method === 'POST') {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const prods = getMockProducts();
        const newId = prods.length > 0 ? Math.max(...prods.map(p => p.id)) + 1 : 1;
        const cats = getMockCategories();
        const cat = cats.find(c => c.id == body.category_id);

        const newProd = {
            id: newId,
            name: body.name || 'Sản phẩm mới',
            slug: (body.name || 'san-pham').toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + newId,
            category_id: parseInt(body.category_id, 10) || 1,
            category_name: cat ? cat.name : 'Khác',
            price: parseFloat(body.price) || 0,
            original_price: parseFloat(body.original_price) || parseFloat(body.price) || 0,
            stock: parseInt(body.stock, 10) || 0,
            image_url: body.image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
            badge: body.badge || '',
            rating: 5.0,
            sold_count: 0,
            description: body.description || '',
            is_active: body.is_active === undefined ? 1 : parseInt(body.is_active, 10),
            shopee_item_id: body.shopee_item_id || `SHP-${10000000 + newId}`,
            shopee_stock: parseInt(body.shopee_stock, 10) || parseInt(body.stock, 10) || 0,
            lazada_item_id: body.lazada_item_id || `LAZ-${20000000 + newId}`,
            lazada_stock: parseInt(body.lazada_stock, 10) || parseInt(body.stock, 10) || 0,
            auto_sync_marketplace: 1
        };

        prods.unshift(newProd);
        saveMockProducts(prods);
        return { success: true, message: 'Thêm sản phẩm mới thành công!', productId: newId };
    }

    // G. UPDATE PRODUCT (ADMIN)
    if (prodMatch && method === 'PUT') {
        const id = parseInt(prodMatch[1], 10);
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const prods = getMockProducts();
        const idx = prods.findIndex(p => p.id === id);
        if (idx === -1) throw new Error('Không tìm thấy sản phẩm');

        const cats = getMockCategories();
        const cat = cats.find(c => c.id == body.category_id);

        prods[idx] = {
            ...prods[idx],
            name: body.name !== undefined ? body.name : prods[idx].name,
            category_id: body.category_id !== undefined ? parseInt(body.category_id, 10) : prods[idx].category_id,
            category_name: cat ? cat.name : prods[idx].category_name,
            price: body.price !== undefined ? parseFloat(body.price) : prods[idx].price,
            original_price: body.original_price !== undefined ? parseFloat(body.original_price) : prods[idx].original_price,
            stock: body.stock !== undefined ? parseInt(body.stock, 10) : prods[idx].stock,
            image_url: body.image_url || prods[idx].image_url,
            badge: body.badge !== undefined ? body.badge : prods[idx].badge,
            description: body.description !== undefined ? body.description : prods[idx].description,
            is_active: body.is_active !== undefined ? parseInt(body.is_active, 10) : prods[idx].is_active,
            shopee_stock: body.shopee_stock !== undefined ? parseInt(body.shopee_stock, 10) : prods[idx].shopee_stock,
            lazada_stock: body.lazada_stock !== undefined ? parseInt(body.lazada_stock, 10) : prods[idx].lazada_stock
        };
        saveMockProducts(prods);
        return { success: true, message: 'Cập nhật sản phẩm thành công!' };
    }

    // H. DELETE PRODUCT (ADMIN)
    if (prodMatch && method === 'DELETE') {
        const id = parseInt(prodMatch[1], 10);
        recordDeletedProductId(id);
        let prods = getMockProducts();
        prods = prods.filter(p => Number(p.id) !== id);
        saveMockProducts(prods);
        await syncToCloud({ products: prods });
        return { success: true, message: 'Đã xóa sản phẩm thành công!' };
    }

    // I. UPLOAD IMAGE
    if ((path === '/api/upload' || path === '/api/products/upload-image') && method === 'POST') {
        return {
            success: true,
            imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
            message: 'Tải ảnh sản phẩm lên thành công!'
        };
    }

    // J. AUTH LOGIN
    if (path === '/api/auth/login' && method === 'POST') {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const email = (body.email || '').toLowerCase().trim();
        const pass = body.password || '';

        const adminSavedEmail = (localStorage.getItem('mock_admin_email') || 'admin@mintmart.vn').toLowerCase().trim();
        const adminSavedPass = localStorage.getItem('mock_admin_pass') || 'admin123';
        const adminSavedName = localStorage.getItem('mock_admin_name') || 'Quản Trị Viên (Admin)';

        if (email === adminSavedEmail && pass === adminSavedPass) {
            return {
                success: true,
                message: 'Đăng nhập Quản Trị Viên thành công!',
                token: 'mock-admin-token-' + Date.now(),
                user: { id: 1, email: adminSavedEmail, name: adminSavedName, role: 'admin' }
            };
        } else {
            // Check registered customer users
            const users = getMockUsers();
            const matched = users.find(u => (u.email || '').toLowerCase().trim() === email && u.role !== 'admin');
            if (matched && pass && pass.length >= 6) {
                return {
                    success: true,
                    message: 'Đăng nhập thành công!',
                    token: 'mock-user-token-' + Date.now(),
                    user: { id: matched.id, email: matched.email, name: matched.name, role: 'customer' }
                };
            }
            throw new Error('Email hoặc mật khẩu không chính xác! Vui lòng kiểm tra lại.');
        }
    }

    // J2. AUTH CHANGE CREDENTIALS
    if (path === '/api/auth/change-credentials' && method === 'PUT') {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const { newName, newEmail, newPassword } = body;
        if (newEmail) localStorage.setItem('mock_admin_email', newEmail);
        if (newPassword) localStorage.setItem('mock_admin_pass', newPassword);
        if (newName) localStorage.setItem('mock_admin_name', newName);

        const currentEmail = newEmail || localStorage.getItem('mock_admin_email') || 'admin@mintmart.vn';
        const currentName = newName || localStorage.getItem('mock_admin_name') || 'Quản Trị Viên (Admin)';

        return {
            success: true,
            message: 'Cập nhật tài khoản và mật khẩu thành công!',
            token: 'mock-admin-token-' + Date.now(),
            user: { id: 1, email: currentEmail, name: currentName, role: 'admin' }
        };
    }

    // K. AUTH REGISTER
    if (path === '/api/auth/register' && method === 'POST') {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const users = getMockUsers();
        const newUser = {
            id: Date.now(),
            name: body.name || 'Khách hàng',
            email: (body.email || '').toLowerCase().trim(),
            phone: body.phone || '',
            address: body.address || '',
            role: 'customer',
            created_at: new Date().toISOString().slice(0, 10)
        };
        users.push(newUser);
        localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
        return {
            success: true,
            message: 'Đăng ký tài khoản thành công!',
            token: 'mock-token-' + Date.now(),
            user: newUser
        };
    }

    // L. CREATE ORDER
    if (path === '/api/orders' && method === 'POST') {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const items = body.items || [];
        if (!items || items.length === 0) {
            throw new Error('Giỏ hàng của bạn đang trống! Vui lòng chọn ít nhất một sản phẩm.');
        }

        // 1. Kiểm tra Họ và tên
        const trimmedName = (body.customer_name || '').trim();
        if (!trimmedName || trimmedName.length < 2) {
            throw new Error('Họ và tên người nhận hàng không hợp lệ (tối thiểu 2 ký tự)!');
        }

        // 2. Ràng buộc Số điện thoại
        const rawPhone = (body.customer_phone || '').trim();
        let cleanPhone = rawPhone.replace(/[\s\.\-\(\)]/g, '');
        if (cleanPhone.startsWith('+84')) cleanPhone = '0' + cleanPhone.slice(3);
        else if (cleanPhone.startsWith('84') && cleanPhone.length === 11) cleanPhone = '0' + cleanPhone.slice(2);

        const vnPhoneRegex = /^0[35789]\d{8}$/;
        const isRepeatedDigits = /^0([0-9])\1{8}$/.test(cleanPhone);
        if (!cleanPhone || !vnPhoneRegex.test(cleanPhone) || isRepeatedDigits || cleanPhone === '0900000000') {
            throw new Error('Số điện thoại nhận hàng không hợp lệ! Vui lòng nhập số di động Việt Nam gồm 10 chữ số (Đầu số: 03, 05, 07, 08, 09. Ví dụ: 0912345678).');
        }

        // 3. Ràng buộc Gmail / Email
        const cleanEmail = (body.customer_email || '').trim().toLowerCase();
        if (!cleanEmail) {
            throw new Error('Vui lòng cung cấp địa chỉ Gmail/Email để nhận thông tin đơn hàng và hóa đơn thanh toán!');
        }
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(cleanEmail)) {
            throw new Error('Địa chỉ Gmail/Email không đúng định dạng! Vui lòng nhập email hợp lệ (Ví dụ: khachhang@gmail.com).');
        }

        // 4. Ràng buộc Địa chỉ nhận hàng
        const cleanAddress = (body.shipping_address || '').trim();
        if (!cleanAddress || cleanAddress.length < 10) {
            throw new Error('Địa chỉ giao hàng quá ngắn (tối thiểu 10 ký tự)! Vui lòng ghi chi tiết: Số nhà, ngõ/đường, phường/xã, quận/huyện, tỉnh/thành phố để shipper giao hàng tận nơi.');
        }
        if (cleanAddress.length > 300) {
            throw new Error('Địa chỉ giao hàng không được vượt quá 300 ký tự!');
        }
        const addressWords = cleanAddress.split(/\s+/).filter(w => w.length > 0);
        if (addressWords.length < 3) {
            throw new Error('Địa chỉ nhận hàng chưa rõ ràng! Vui lòng cung cấp tối thiểu 3 thành phần (Số nhà/đường, phường/xã, quận/huyện, tỉnh/thành phố).');
        }
        if (!/[a-zA-ZàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệđìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẸÊỀẾỂỄỆĐÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]/i.test(cleanAddress)) {
            throw new Error('Địa chỉ giao hàng không hợp lệ (không chứa tên đường, địa danh có chữ cái)!');
        }
        if (/(.)\1{5,}/.test(cleanAddress)) {
            throw new Error('Địa chỉ giao hàng chứa chuỗi ký tự lặp vô nghĩa! Vui lòng nhập địa chỉ thực tế.');
        }

        const orderCode = 'MM-' + Math.floor(10000 + Math.random() * 90000);
        const orders = getMockOrders();
        const total = items.reduce((sum, it) => sum + (it.price * it.quantity), 0);
        const payment_status = body.payment_status || 'pending';

        const newOrder = {
            id: orders.length + 1,
            order_code: orderCode,
            customer_name: trimmedName,
            customer_phone: cleanPhone,
            customer_email: cleanEmail,
            shipping_address: cleanAddress,
            payment_method: body.payment_method || 'COD',
            payment_status: payment_status,
            total_amount: total,
            status: 'pending',
            note: body.note || '',
            created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
            items: items
        };
        orders.unshift(newOrder);
        saveMockOrders(orders);

        // Deduct mock product stock & increment marketplace sold counts
        const prods = getMockProducts();
        items.forEach(it => {
            const p = prods.find(item => item.id === it.id);
            if (p) {
                p.stock = Math.max(0, p.stock - it.quantity);
                p.sold_count = (p.sold_count || 0) + it.quantity;
                p.shopee_stock = Math.max(0, (p.shopee_stock !== undefined ? p.shopee_stock : p.stock) - it.quantity);
                p.lazada_stock = Math.max(0, (p.lazada_stock !== undefined ? p.lazada_stock : p.stock) - it.quantity);
                p.shopee_sold_count = (p.shopee_sold_count || 0) + it.quantity;
                p.lazada_sold_count = (p.lazada_sold_count || 0) + it.quantity;
            }
        });
        saveMockProducts(prods);

        return {
            success: true,
            message: 'Đặt hàng thành công!',
            order: newOrder,
            order_code: orderCode
        };
    }

    // M. GET ORDERS
    if (path === '/api/orders' || path === '/api/orders/my-orders') {
        return { success: true, count: getMockOrders().length, orders: getMockOrders() };
    }

    // N. UPDATE ORDER STATUS & PAYMENT
    const orderStatusMatch = path.match(/^\/api\/orders\/(\d+)\/status$/);
    if (orderStatusMatch && (method === 'PATCH' || method === 'PUT')) {
        const id = parseInt(orderStatusMatch[1], 10);
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const orders = getMockOrders();
        const o = orders.find(item => item.id === id);
        if (o) o.status = body.status;
        saveMockOrders(orders);
        return { success: true, message: 'Cập nhật trạng thái đơn hàng thành công!' };
    }

    const orderPaymentMatch = path.match(/^\/api\/orders\/(\d+)\/payment$/);
    if (orderPaymentMatch && (method === 'PATCH' || method === 'PUT')) {
        const id = parseInt(orderPaymentMatch[1], 10);
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const orders = getMockOrders();
        const o = orders.find(item => item.id === id);
        if (o) o.payment_status = body.payment_status;
        saveMockOrders(orders);
        return { success: true, message: `Đã cập nhật trạng thái thanh toán sang: ${body.payment_status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}` };
    }

function generateMock7DayMarketplaceRevenue() {
    const orders = getMockOrders();
    const days = [];
    const dateStrs = [];
    const shopeeDaily = [];
    const lazadaDaily = [];

    let shpTotalRev = 0, shpTotalOrders = 0, shpTotalUnits = 0;
    let lazTotalRev = 0, lazTotalOrders = 0, lazTotalUnits = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const shortDay = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dayLabel = `${shortDay} (${dd}/${mm})`;
        const fullDate = `${dd}/${mm}/${d.getFullYear()}`;
        days.push(dayLabel);
        dateStrs.push(dateStr);
        const idx = 6 - i;

        // Tìm đơn hàng thực tế phát sinh trong ngày
        const dayOrders = orders.filter(o => {
            if (!o.created_at) return false;
            return o.created_at.startsWith(dateStr);
        });

        const dayOrdersCount = dayOrders.length;
        const dayUnits = dayOrders.reduce((sum, o) => {
            if (Array.isArray(o.items)) {
                return sum + o.items.reduce((s, it) => s + (Number(it.quantity) || 1), 0);
            }
            return sum + (Number(o.item_count) || 1);
        }, 0);
        const dayRev = dayOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        shpTotalRev += dayRev;
        shpTotalOrders += dayOrdersCount;
        shpTotalUnits += dayUnits;

        const prevShpRev = idx > 0 ? (shopeeDaily[idx - 1]?.revenue || 0) : 0;
        let shpGrowth = '0%';
        if (dayRev > 0 && prevShpRev === 0) {
            shpGrowth = '+100%';
        } else if (prevShpRev > 0) {
            const diff = ((dayRev - prevShpRev) / prevShpRev) * 100;
            shpGrowth = diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
        }

        shopeeDaily.push({
            date: fullDate,
            dateKey: dateStr,
            dateStr: dateStr,
            dayLabel,
            orders: dayOrdersCount,
            units: dayUnits,
            revenue: dayRev,
            real_synced_orders: dayOrdersCount,
            growth: shpGrowth,
            status: 'Đồng bộ API v2'
        });

        lazadaDaily.push({
            date: fullDate,
            dateKey: dateStr,
            dateStr: dateStr,
            dayLabel,
            orders: 0,
            units: 0,
            revenue: 0,
            real_synced_orders: 0,
            growth: '0%',
            status: 'Tạm ẩn API'
        });
    }

    return {
        success: true,
        days,
        shopee: {
            platform: 'Shopee',
            shop_name: 'MintMart Official Store (Shopee Mall)',
            status_label: 'Đang kết nối API v2',
            total_revenue: shpTotalRev,
            total_orders: shpTotalOrders,
            total_units: shpTotalUnits,
            daily: shopeeDaily
        },
        lazada: {
            platform: 'Lazada',
            shop_name: 'MintMart LazMall Flagship Store',
            status_label: 'Tạm ẩn theo yêu cầu quản trị viên',
            is_temporarily_hidden: true,
            total_revenue: lazTotalRev,
            total_orders: lazTotalOrders,
            total_units: lazTotalUnits,
            daily: lazadaDaily
        }
    };
}

    // O. DASHBOARD & REVENUE STATS
    if (path === '/api/stats/dashboard' || path === '/api/stats/revenue') {
        const orders = getMockOrders();
        const prods = getMockProducts();
        const categories = getMockCategories();
        const users = getMockUsers();

        const nonCancelled = orders.filter(o => o.status !== 'cancelled');
        const totalRev = nonCancelled.reduce((s, o) => s + (o.total_amount || 0), 0);
        const recentOrders = orders.slice(0, 5);
        const lowStockProducts = prods.filter(p => (p.stock || 0) <= 15).sort((a, b) => a.stock - b.stock).slice(0, 5);

        const salesByCategory = categories.map(c => {
            const catProds = prods.filter(p => p.category_id == c.id);
            const totalSold = catProds.reduce((sum, p) => sum + (p.sold_count || 0), 0);
            return {
                name: c.name,
                product_count: catProds.length,
                total_sold: totalSold
            };
        });

        // 7-day marketplace data calculated from real orders (Bắt đầu từ 0)
        const marketplace7Days = generateMock7DayMarketplaceRevenue();

        return {
            success: true,
            stats: {
                totalRevenue: totalRev,
                totalOrders: orders.length,
                totalProducts: prods.length,
                totalCustomers: users.filter(u => u.role === 'customer').length,
                recentOrders,
                lowStockProducts,
                salesByCategory,
                marketplace7Days,
                monthlyRevenue: []
            }
        };
    }

    // P. MARKETPLACE REVENUE REPORT (SHOPEE & LAZADA 2 BẢNG RIÊNG BIỆT)
    if (path === '/api/marketplace/revenue-report') {
        const prods = getMockProducts().filter(p => p.is_active == 1);
        let shopeeTotal = 0, shopeeUnits = 0, shopeeOrders = 0;
        let lazadaTotal = 0, lazadaUnits = 0, lazadaOrders = 0;

        const shopeeItems = prods.map(p => {
            const sold = Number(p.shopee_sold_count) || 0;
            const rev = sold * Number(p.price);
            shopeeTotal += rev;
            shopeeUnits += sold;
            if (sold > 0) shopeeOrders++;
            return {
                id: p.id,
                name: p.name,
                image_url: p.image_url,
                price: p.price,
                shopee_item_id: p.shopee_item_id || `SHP-${p.id * 1234}`,
                shopee_stock: p.shopee_stock !== undefined ? p.shopee_stock : p.stock,
                order_quantity: sold,
                revenue: rev,
                status: 'Đang liên kết & đồng bộ'
            };
        });

        const lazadaItems = prods.map(p => {
            const sold = Number(p.lazada_sold_count) || 0;
            const rev = sold * Number(p.price);
            lazadaTotal += rev;
            lazadaUnits += sold;
            if (sold > 0) lazadaOrders++;
            return {
                id: p.id,
                name: p.name,
                image_url: p.image_url,
                price: p.price,
                lazada_item_id: p.lazada_item_id || `LAZ-${p.id * 4321}`,
                lazada_stock: p.lazada_stock !== undefined ? p.lazada_stock : p.stock,
                order_quantity: sold,
                revenue: rev,
                status: 'Tạm ẩn API (Dữ liệu lưu kho)'
            };
        });

        return {
            success: true,
            shopee: {
                platform: 'Shopee',
                shop_name: 'MintMart Official Store (Shopee Mall)',
                partner_id: '2005831',
                shop_id: '98273615',
                status: 'active',
                status_label: 'Đang hoạt động',
                total_revenue: shopeeTotal,
                total_orders: shopeeOrders,
                total_units_sold: shopeeUnits,
                items: shopeeItems
            },
            lazada: {
                platform: 'Lazada',
                shop_name: 'MintMart LazMall Flagship Store',
                seller_id: 'VN_SELLER_88371',
                app_key: '109283',
                status: 'temporarily_hidden',
                status_label: 'Tạm ẩn theo yêu cầu quản trị viên',
                is_temporarily_hidden: true,
                total_revenue: lazadaTotal,
                total_orders: lazadaOrders,
                total_units_sold: lazadaUnits,
                items: lazadaItems
            }
        };
    }

    // P2. 7-DAY REVENUE REPORT FOR 2 MARKETPLACES
    if (path === '/api/marketplace/revenue-7days') {
        return generateMock7DayMarketplaceRevenue();
    }

    // Q. MARKETPLACE LOGS & SETTINGS
    if (path === '/api/marketplace/logs') {
        return { success: true, count: getMockLogs().length, logs: getMockLogs() };
    }
    if (path === '/api/marketplace/settings') {
        if (method === 'PUT') {
            return {
                success: true,
                message: 'Cập nhật cấu hình kết nối sàn Shopee & Lazada thành công!'
            };
        }
        return {
            success: true,
            settings: {
                shopee_enabled: 1,
                shopee_partner_id: '2005831',
                shopee_shop_id: '98273615',
                lazada_enabled: 0,
                lazada_hidden: 1,
                lazada_seller_id: 'VN_SELLER_88371',
                sync_on_order: 1
            }
        };
    }
    if (path === '/api/marketplace/test-connection' && method === 'POST') {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const platform = (body.platform || 'shopee').toLowerCase();
        const isShopee = platform === 'shopee';
        return {
            success: true,
            result: {
                platform: isShopee ? 'Shopee Open Platform V2' : 'Lazada Open Platform',
                shop_name: isShopee ? 'MintMart Official Store' : 'MintMart Vietnam Mall',
                seller_name: isShopee ? 'MintMart Store' : 'MintMart Vietnam Mall',
                api_version: isShopee ? 'v2.0-prod' : 'v1.4-live',
                latency_ms: Math.floor(45 + Math.random() * 30),
                status: 'connected',
                message: 'Đường truyền API bảo mật HMAC-SHA256 phản hồi hoàn hảo trong thời gian thực!'
            }
        };
    }
    if (path === '/api/marketplace/lazada/toggle-hide') {
        return {
            success: true,
            lazada_hidden: 1,
            message: 'Đã cập nhật trạng thái tạm ẩn API Lazada!'
        };
    }
    if (path === '/api/marketplace/sync-all') {
        return { success: true, message: 'Đồng bộ toàn bộ kho hàng lên Shopee & Lazada thành công!' };
    }

    // USER MANAGEMENT
    if (path === '/api/users' && method === 'GET') {
        const users = getMockUsers();
        return { success: true, count: users.length, users };
    }

    const userRoleMatch = path.match(/^\/api\/users\/(\d+)\/role$/);
    if (userRoleMatch && (method === 'PUT' || method === 'PATCH')) {
        const uid = parseInt(userRoleMatch[1], 10);
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const users = getMockUsers();
        const u = users.find(x => x.id === uid);
        if (u) {
            u.role = body.role || 'customer';
            localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
        }
        return { success: true, message: 'Cập nhật phân quyền người dùng thành công!' };
    }

    // R. CLOUD SYNC & BACKUP MANAGEMENT ENDPOINTS
    if (path === '/api/cloud-sync/status') {
        return {
            success: true,
            status: 'connected',
            cloudUrl: getCloudStorageUrl(),
            lastSync: localStorage.getItem('mintmart_last_cloud_sync') || null,
            productCount: getMockProducts().length,
            categoryCount: getMockCategories().length
        };
    }
    if (path === '/api/cloud-sync/pull' && method === 'POST') {
        const synced = await syncFromCloud(true);
        return {
            success: true,
            message: 'Đã tải dữ liệu mới nhất từ Đám Mây thành công!',
            products: getMockProducts()
        };
    }
    if (path === '/api/cloud-sync/push' && method === 'POST') {
        await syncToCloud();
        return {
            success: true,
            message: 'Đã lưu và đồng bộ toàn bộ dữ liệu lên Đám Mây thành công!'
        };
    }
    if (path === '/api/cloud-sync/export') {
        return {
            success: true,
            data: {
                version: 2,
                exported_at: new Date().toISOString(),
                products: getMockProducts(),
                categories: getMockCategories()
            }
        };
    }
    if (path === '/api/cloud-sync/import' && method === 'POST') {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body || {};
        const importedData = body.data || body;
        if (Array.isArray(importedData.products) && importedData.products.length > 0) {
            localStorage.setItem(MOCK_PRODUCTS_KEY, JSON.stringify(importedData.products));
            if (Array.isArray(importedData.categories) && importedData.categories.length > 0) {
                localStorage.setItem(MOCK_CATEGORIES_KEY, JSON.stringify(importedData.categories));
            }
            await syncToCloud({ products: importedData.products, categories: importedData.categories });
            window.dispatchEvent(new CustomEvent('mintmart-cloud-synced', { detail: importedData }));
            return {
                success: true,
                message: `Khôi phục thành công ${importedData.products.length} sản phẩm và đồng bộ lên Đám Mây!`
            };
        }
        throw new Error('Dữ liệu nhập không hợp lệ (cần mảng sản phẩm hợp lệ)!');
    }

    return { success: true };
}

// Auth State Helpers
function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getCurrentUser() {
    try {
        const u = localStorage.getItem(USER_KEY);
        return u ? JSON.parse(u) : null;
    } catch (e) {
        return null;
    }
}

function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function isLoggedIn() {
    return !!getAuthToken();
}

function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

// Format Currency to Vietnamese Dong (VNĐ)
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '0 ₫';
    return Number(amount).toLocaleString('vi-VN') + ' ₫';
}

// Format Date
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Unified API Fetch wrapper with GitHub Pages, Custom Domain & Resilient Fallback
async function apiFetch(endpoint, options = {}) {
    // If running in known static mode or backend was already verified as unavailable
    if (isStaticOrGitHubPages()) {
        try {
            return await handleMockApi(endpoint, options);
        } catch (mockErr) {
            console.error(`Mock API Error [${endpoint}]:`, mockErr);
            throw mockErr;
        }
    }

    // When attempting backend fetch (e.g. Node server on localhost:3000 or custom domain backend)
    const base = getApiBase();
    const url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint}`;
    const headers = options.headers || {};

    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, { ...options, headers });
        if (response.ok) {
            _mintmartBackendAvailable = true;
            return await response.json();
        }

        // If backend returned 404 (Not Found) or 405 (Method Not Allowed - common on static hosts for POST)
        // or server errors (501, 502, 503, 504):
        if (response.status === 404 || response.status === 405 || response.status >= 500) {
            _mintmartBackendAvailable = false;
            console.warn(`[MintMart] Máy chủ phản hồi HTTP ${response.status} cho [${endpoint}]. Tự động chuyển sang chế độ Client-side DB & Cloud Sync.`);
            return await handleMockApi(endpoint, options);
        }

        // For other 4xx errors:
        const data = await response.json().catch(() => ({}));
        // If the server returned an explicit JSON error message from our Express backend, propagate it
        if (data && data.message && (data.success === false || data.success === true)) {
            _mintmartBackendAvailable = true;
            const appErr = new Error(data.message);
            appErr.isAppError = true;
            appErr.status = response.status;
            appErr.data = data;
            throw appErr;
        }

        // Non-JSON or generic web server 4xx error page (e.g. 403 Forbidden directory on static hosting):
        _mintmartBackendAvailable = false;
        console.warn(`[MintMart] Phản hồi không phải API hợp lệ (${response.status}) cho [${endpoint}]. Chuyển sang Client-side DB.`);
        return await handleMockApi(endpoint, options);

    } catch (err) {
        if (err.isAppError) {
            throw err;
        }
        // Connection refused, network error, CORS, or host down
        _mintmartBackendAvailable = false;
        console.warn(`[MintMart] Kết nối máy chủ backend thất bại cho [${endpoint}]:`, err.message, `. Đang kích hoạt Client-side DB.`);
        return await handleMockApi(endpoint, options);
    }
}

// SweetAlert2 notification helper
function showToast(icon, title) {
    if (window.Swal) {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });
        Toast.fire({ icon, title });
    } else {
        alert(title);
    }
}

// Shopping Cart Helpers
function getCart() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    window.dispatchEvent(new Event('cart-updated'));
}

function addToCart(product, quantity = 1) {
    const cart = getCart();
    const existingIndex = cart.findIndex(item => item.id === product.id);

    if (existingIndex > -1) {
        cart[existingIndex].quantity += quantity;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            original_price: product.original_price,
            image_url: product.image_url,
            quantity: quantity,
            stock: product.stock
        });
    }

    saveCart(cart);
    showToast('success', `Đã thêm "${product.name}" vào giỏ hàng!`);
}

function updateCartQuantity(productId, newQty) {
    let cart = getCart();
    if (newQty <= 0) {
        cart = cart.filter(item => item.id !== productId);
    } else {
        const item = cart.find(item => item.id === productId);
        if (item) item.quantity = newQty;
    }
    saveCart(cart);
}

function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(item => item.id !== productId);
    saveCart(cart);
    showToast('info', 'Đã xóa sản phẩm khỏi giỏ hàng');
}

function clearCart() {
    localStorage.removeItem(CART_KEY);
    window.dispatchEvent(new Event('cart-updated'));
}

function getCartTotals() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = subtotal > 300000 || subtotal === 0 ? 0 : 30000;
    const total = subtotal + shipping;

    return { count, subtotal, shipping, total, items: cart };
}

// Global Cloud Sync Exports for UI
if (typeof window !== 'undefined') {
    window.syncFromCloud = syncFromCloud;
    window.syncToCloud = syncToCloud;
    window.getCloudStorageUrl = getCloudStorageUrl;
}
