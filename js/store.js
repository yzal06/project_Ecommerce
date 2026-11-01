/**
 * MintMart - Customer Storefront Logic
 */

// State
let allCategories = [];
let currentCategory = 'all';
let currentSearch = '';
let currentPriceFilter = 'all';
let currentSort = 'newest';
let flashSaleProducts = [];
let hotProducts = [];
let onlyDiscounted = false;

document.addEventListener('DOMContentLoaded', () => {
    initCustomerTheme();
    initStore();
    initFlashSaleCountdown();
    setupEventListeners();
    updateUserUI();
    updateCartUI();
});

// Initialize Store
async function initStore() {
    parseUrlParams();
    await loadCategories();

    // 1. If on products page (has productsGrid)
    if (document.getElementById('productsGrid')) {
        await loadProducts();
    }

    // 2. If on home page (has homeFeaturedGrid or homeCategoryGrid)
    if (document.getElementById('homeFeaturedGrid')) {
        await loadHomeFeatured();
    }
    if (document.getElementById('homeCategoryGrid')) {
        renderHomeCategories(allCategories);
    }
    if (document.getElementById('flashSaleContainer')) {
        await loadFlashSale();
    }

    // 3. If on hot products page (has hotProductsTableBody or hotProductsMobileList)
    if (document.getElementById('hotProductsTableBody') || document.getElementById('hotProductsMobileList')) {
        await loadHotProducts();
    }

    // 4. If on deals page (has dealsGrid)
    if (document.getElementById('dealsGrid')) {
        await loadDealsProducts();
    }
}

// Parse URL query parameters
function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('category')) {
        currentCategory = params.get('category');
    }
    if (params.has('search')) {
        currentSearch = params.get('search');
        const sIn = document.getElementById('searchInput');
        if (sIn) sIn.value = currentSearch;
        const sInMob = document.getElementById('searchInputMobile');
        if (sInMob) sInMob.value = currentSearch;
    }
    if (params.has('sale')) {
        onlyDiscounted = params.get('sale') === '1' || params.get('sale') === 'true';
        const saleChk = document.getElementById('sidebarSaleOnlyCheckbox');
        if (saleChk) saleChk.checked = onlyDiscounted;
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Search forms
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = (document.getElementById('searchInput')?.value || '').trim();
            const cat = document.getElementById('searchCategorySelect')?.value || 'all';

            const isProductsPage = window.location.pathname.endsWith('products.html') || window.location.pathname.endsWith('/products');
            if (isProductsPage) {
                currentSearch = query;
                currentCategory = cat;
                loadProducts();
                scrollToProducts();
            } else {
                const params = new URLSearchParams();
                if (query) params.set('search', query);
                if (cat && cat !== 'all') params.set('category', cat);
                window.location.href = `products.html?${params.toString()}`;
            }
        });
    }

    const searchFormMobile = document.getElementById('searchFormMobile');
    if (searchFormMobile) {
        searchFormMobile.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = (document.getElementById('searchInputMobile')?.value || '').trim();
            const isProductsPage = window.location.pathname.endsWith('products.html') || window.location.pathname.endsWith('/products');
            if (isProductsPage) {
                currentSearch = query;
                loadProducts();
                scrollToProducts();
            } else {
                window.location.href = `products.html?search=${encodeURIComponent(query)}`;
            }
        });
    }

    // Listen for cart changes
    window.addEventListener('cart-updated', updateCartUI);

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const userContainer = document.getElementById('userMenuContainer');
        const userDropdown = document.getElementById('userDropdown');
        if (userContainer && !userContainer.contains(e.target)) {
            userDropdown?.classList.add('hidden');
        }
    });
}

// Flash Sale Countdown Timer
function initFlashSaleCountdown() {
    let hours = 3, minutes = 42, seconds = 18;
    setInterval(() => {
        if (seconds > 0) {
            seconds--;
        } else {
            seconds = 59;
            if (minutes > 0) {
                minutes--;
            } else {
                minutes = 59;
                if (hours > 0) hours--;
                else hours = 24;
            }
        }
        const hEl = document.getElementById('flashTimerHours');
        const mEl = document.getElementById('flashTimerMinutes');
        const sEl = document.getElementById('flashTimerSeconds');
        if (hEl) hEl.textContent = String(hours).padStart(2, '0');
        if (mEl) mEl.textContent = String(minutes).padStart(2, '0');
        if (sEl) sEl.textContent = String(seconds).padStart(2, '0');
    }, 1000);
}

// Load Categories
async function loadCategories() {
    try {
        const res = await apiFetch('/api/categories');
        allCategories = res.categories || [];

        // 1. Fill Search Category Dropdown
        const searchSelect = document.getElementById('searchCategorySelect');
        if (searchSelect) {
            searchSelect.innerHTML = `<option value="all">Tất cả danh mục</option>` +
                allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        // 2. Fill Category Chips Bar
        const chipsContainer = document.getElementById('categoryChipsContainer');
        if (chipsContainer) {
            let chipsHtml = `
                <button onclick="filterCategory('all')" class="category-chip ${currentCategory === 'all' ? 'active' : ''} px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 whitespace-nowrap bg-white text-slate-700 shadow-sm">
                    <i class="fa-solid fa-layer-group text-emerald-500"></i>
                    <span>Tất cả</span>
                </button>
            `;
            chipsHtml += allCategories.map(c => `
                <button onclick="filterCategory(${c.id})" class="category-chip ${currentCategory == c.id ? 'active' : ''} px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 whitespace-nowrap bg-white text-slate-700 shadow-sm">
                    <i class="fa-solid ${c.icon || 'fa-tag'} text-emerald-500"></i>
                    <span>${c.name}</span>
                    <span class="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-500 font-bold">${c.product_count || 0}</span>
                </button>
            `).join('');
            chipsContainer.innerHTML = chipsHtml;
        }

        // 3. Fill Sidebar Category Radio List
        const sidebarList = document.getElementById('sidebarCategoryList');
        if (sidebarList) {
            let sideHtml = `
                <label class="flex items-center justify-between cursor-pointer text-slate-600 hover:text-emerald-600 py-1">
                    <span class="flex items-center">
                        <input type="radio" name="sideCategory" value="all" ${currentCategory === 'all' ? 'checked' : ''} onchange="filterCategory('all')" class="text-emerald-600 focus:ring-emerald-500 mr-2">
                        Tất cả danh mục
                    </span>
                </label>
            `;
            sideHtml += allCategories.map(c => `
                <label class="flex items-center justify-between cursor-pointer text-slate-600 hover:text-emerald-600 py-1">
                    <span class="flex items-center truncate">
                        <input type="radio" name="sideCategory" value="${c.id}" ${currentCategory == c.id ? 'checked' : ''} onchange="filterCategory(${c.id})" class="text-emerald-600 focus:ring-emerald-500 mr-2">
                        <span class="truncate">${c.name}</span>
                    </span>
                    <span class="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 font-bold ml-1">${c.product_count || 0}</span>
                </label>
            `).join('');
            sidebarList.innerHTML = sideHtml;
        }

        // 4. Fill Daniel Wellington Style Left Drawer Categories (Image 3)
        renderDWDrawerCategories(allCategories);

        // 5. Fill Home Category Grid (if on index.html)
        renderHomeCategories(allCategories);
    } catch (err) {
        console.error('Không thể tải danh mục:', err);
    }
}

// Load Products
async function loadProducts() {
    try {
        let url = `/api/products?sort=${currentSort}`;
        if (currentCategory && currentCategory !== 'all') {
            url += `&category_id=${currentCategory}`;
        }
        if (currentSearch) {
            url += `&search=${encodeURIComponent(currentSearch)}`;
        }
        if (currentPriceFilter && currentPriceFilter !== 'all') {
            const [min, max] = currentPriceFilter.split('-');
            url += `&minPrice=${min}&maxPrice=${max}`;
        }
        if (onlyDiscounted) {
            url += `&on_sale=1`;
        }

        const res = await apiFetch(url);
        const products = res.products || [];

        // Count element
        const countEl = document.getElementById('productResultCount');
        if (countEl) countEl.textContent = products.length;

        // Render Grid
        renderProductsGrid(products);

        // Flash Sale items (Top 4 products with highest discount or sold_count)
        if (flashSaleProducts.length === 0 && products.length > 0) {
            flashSaleProducts = [...products]
                .filter(p => p.original_price && p.original_price > p.price)
                .slice(0, 4);
            renderFlashSale(flashSaleProducts);
        }

    } catch (err) {
        console.error('Không thể tải danh sách sản phẩm:', err);
    }
}

// Render Products Grid
function renderProductsGrid(products) {
    const grid = document.getElementById('productsGrid');
    const empty = document.getElementById('productsEmptyState');

    if (!grid) return;

    if (products.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }

    if (empty) empty.classList.add('hidden');

    grid.innerHTML = products.map(product => {
        const discountPercent = product.original_price && product.original_price > product.price
            ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
            : 0;

        return `
            <div class="product-card rounded-2xl overflow-hidden flex flex-col justify-between group">
                <!-- Image Container with Badges -->
                <div class="product-image-container relative">
                    <img src="${product.image_url}" alt="${product.name}" class="w-full h-full object-cover" loading="lazy">
                    
                    <!-- Badges Top Left -->
                    <div class="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start z-10">
                        ${discountPercent > 0 ? `
                            <span class="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                                -${discountPercent}%
                            </span>
                        ` : ''}
                        ${product.badge ? `
                            <span class="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                                ${product.badge}
                            </span>
                        ` : ''}
                    </div>

                    <!-- In Stock Pill Top Right -->
                    <div class="absolute top-2.5 right-2.5 z-10">
                        ${product.stock > 0 ? `
                            <span class="bg-white/90 backdrop-blur-sm text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm border border-emerald-100">
                                Sẵn hàng (${product.stock})
                            </span>
                        ` : `
                            <span class="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                Tạm hết hàng
                            </span>
                        `}
                    </div>

                    <!-- Floating Hover Actions -->
                    <div class="product-action-overlay">
                        <button onclick="openQuickView(${product.id})" class="bg-white hover:bg-emerald-50 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl shadow-lg border border-slate-100 flex items-center transition transform hover:scale-105">
                            <i class="fa-regular fa-eye mr-1 text-emerald-600"></i> Xem nhanh
                        </button>
                    </div>
                </div>

                <!-- Product Info -->
                <div class="p-3.5 flex flex-col flex-grow justify-between">
                    <div>
                        <!-- Category Tag & Rating -->
                        <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <span class="text-emerald-600 font-semibold truncate max-w-[65%]">${product.category_name || 'Khác'}</span>
                            <span class="flex items-center text-amber-500 font-bold">
                                <i class="fa-solid fa-star text-[10px] mr-1"></i> ${product.rating || '5.0'}
                            </span>
                        </div>

                        <!-- Product Title -->
                        <h3 class="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 hover:text-emerald-600 transition cursor-pointer mb-2" onclick="openQuickView(${product.id})">
                            ${product.name}
                        </h3>
                    </div>

                    <div>
                        <!-- Prices -->
                        <div class="flex items-baseline space-x-2 mb-3">
                            <span class="text-emerald-600 font-extrabold text-sm sm:text-base">${formatCurrency(product.price)}</span>
                            ${product.original_price ? `
                                <span class="text-slate-400 text-xs line-through">${formatCurrency(product.original_price)}</span>
                            ` : ''}
                        </div>

                        <!-- Add to Cart Button -->
                        <button onclick="handleAddToCartClick(${product.id})" ${product.stock <= 0 ? 'disabled' : ''} class="w-full py-2 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 border border-emerald-200 hover:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i class="fa-solid fa-cart-plus"></i>
                            <span>Thêm vào giỏ</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Render Flash Sale Section
function renderFlashSale(products) {
    const container = document.getElementById('flashSaleContainer');
    if (!container || products.length === 0) return;

    container.innerHTML = products.map(item => {
        const discount = Math.round(((item.original_price - item.price) / item.original_price) * 100);
        const soldPercent = Math.min(100, Math.round(((item.sold_count || 10) / (item.sold_count + item.stock)) * 100));

        return `
            <div class="border border-rose-100 rounded-2xl p-3 bg-rose-50/20 hover:shadow-md transition flex flex-col justify-between group cursor-pointer" onclick="openQuickView(${item.id})">
                <div class="relative aspect-square rounded-xl overflow-hidden mb-2.5 bg-white">
                    <img src="${item.image_url}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform">
                    <span class="absolute top-2 right-2 bg-rose-600 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow">
                        -${discount}%
                    </span>
                </div>
                <div>
                    <h4 class="text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-rose-600 transition">${item.name}</h4>
                    <div class="flex items-baseline space-x-1.5 mt-1 mb-2">
                        <span class="text-rose-600 font-extrabold text-sm">${formatCurrency(item.price)}</span>
                        <span class="text-slate-400 text-[10px] line-through">${formatCurrency(item.original_price)}</span>
                    </div>
                    <!-- Sold Progress Bar -->
                    <div class="w-full bg-rose-100 rounded-full h-3 overflow-hidden relative flex items-center justify-center">
                        <div class="bg-gradient-to-r from-rose-500 to-amber-500 h-full absolute left-0 top-0 rounded-full" style="width: ${soldPercent}%"></div>
                        <span class="relative text-[9px] font-bold text-white z-10 leading-none">ĐÃ BÁN ${item.sold_count || 45}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Handle Add to cart from grid
async function handleAddToCartClick(productId) {
    try {
        const res = await apiFetch(`/api/products/${productId}`);
        if (res.product) {
            addToCart(res.product, 1);
        }
    } catch (err) {
        showToast('error', 'Không thể thêm vào giỏ hàng');
    }
}

// Filter Category
function filterCategory(catId) {
    currentCategory = catId;
    loadCategories();
    loadProducts();
}

// Price Filter
function handlePriceFilter(val) {
    currentPriceFilter = val;
    loadProducts();
}

// Sort Change
function handleSortChange(sortVal) {
    currentSort = sortVal;
    loadProducts();
}

// Reset Filters
function resetFilters() {
    currentCategory = 'all';
    currentSearch = '';
    currentPriceFilter = 'all';
    currentSort = 'newest';
    onlyDiscounted = false;

    const sIn = document.getElementById('searchInput');
    if (sIn) sIn.value = '';
    const sInMob = document.getElementById('searchInputMobile');
    if (sInMob) sInMob.value = '';

    const firstRadio = document.querySelector('input[name="priceRange"][value="all"]');
    if (firstRadio) firstRadio.checked = true;

    const saleChk = document.getElementById('sidebarSaleOnlyCheckbox');
    if (saleChk) saleChk.checked = false;

    const sortSelect = document.getElementById('sortBySelect');
    if (sortSelect) sortSelect.value = 'newest';

    loadCategories();
    loadProducts();
    showToast('info', 'Đã đặt lại tất cả bộ lọc');
}

function scrollToProducts() {
    const el = document.getElementById('productCatalogSection');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function scrollToHotSection() {
    const el = document.getElementById('hotProductsBoardSection');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// Toggle Discount Only Filter
function toggleDiscountOnlyFilter(checked) {
    onlyDiscounted = checked;
    loadProducts();
    scrollToProducts();
}

// Direct Shortcut: Săn Deal Giảm Giá
function filterOnSale() {
    onlyDiscounted = true;
    const saleChk = document.getElementById('sidebarSaleOnlyCheckbox');
    if (saleChk) saleChk.checked = true;

    currentCategory = 'all';
    currentSort = 'discount';
    const sortSelect = document.getElementById('sortBySelect');
    if (sortSelect) sortSelect.value = 'discount';

    loadCategories();
    loadProducts();
    scrollToProducts();
    showToast('success', 'Đang hiển thị danh sách các sản phẩm giảm giá tốt nhất!');
}

/* ========================================================
   BẢNG HIỂN THỊ SẢN PHẨM HOT (Viewer Hot Products Board)
   ======================================================== */

async function loadHotProducts() {
    try {
        const res = await apiFetch('/api/products/hot');
        hotProducts = res.products || [];
        renderHotPodium(hotProducts);
        renderHotProductsTable(hotProducts);
        renderHotProductsMobile(hotProducts);
        renderDrawerTopProducts(hotProducts);
    } catch (err) {
        console.error('Không thể tải danh sách sản phẩm hot:', err);
    }
}

// Render HOT Products Table (Desktop & Tablet)
function renderHotProductsTable(products) {
    const tbody = document.getElementById('hotProductsTableBody');
    if (!tbody) return;

    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Đang cập nhật danh sách sản phẩm hot...</td></tr>`;
        return;
    }

    tbody.innerHTML = products.map((p, index) => {
        const rank = index + 1;
        let rankBadge = '';
        if (rank === 1) {
            rankBadge = `<div class="w-8 h-8 rounded-full bg-amber-400 text-amber-950 flex items-center justify-center font-black mx-auto shadow-md text-sm border-2 border-amber-300">🥇</div>`;
        } else if (rank === 2) {
            rankBadge = `<div class="w-8 h-8 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center font-black mx-auto shadow-sm text-sm border-2 border-slate-300">🥈</div>`;
        } else if (rank === 3) {
            rankBadge = `<div class="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-black mx-auto shadow-sm text-sm border-2 border-amber-500">🥉</div>`;
        } else {
            rankBadge = `<div class="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-black mx-auto text-xs">#${rank}</div>`;
        }

        const discountPercent = p.original_price && p.original_price > p.price
            ? Math.round(((p.original_price - p.price) / p.original_price) * 100)
            : 0;

        return `
            <tr class="hover:bg-amber-50/40 transition">
                <td class="py-3 px-3 text-center">${rankBadge}</td>
                <td class="py-3 px-3">
                    <div class="flex items-center space-x-3">
                        <div class="relative flex-shrink-0">
                            <img src="${p.image_url}" alt="${p.name}" class="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-white shadow-sm">
                            ${rank <= 3 ? `<span class="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-black px-1 rounded-full"><i class="fa-solid fa-fire"></i></span>` : ''}
                        </div>
                        <div class="max-w-xs">
                            <h4 class="font-bold text-slate-800 text-xs truncate hover:text-emerald-600 cursor-pointer" onclick="openQuickView(${p.id})">${p.name}</h4>
                            <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                ${p.badge ? `<span class="bg-emerald-50 text-emerald-700 font-extrabold px-1.5 py-0.2 rounded border border-emerald-200">${p.badge}</span>` : ''}
                                <span>Tồn kho: ${p.stock > 0 ? p.stock : 'Tạm hết'}</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-3">
                    <span class="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">${p.category_name || 'Khác'}</span>
                </td>
                <td class="py-3 px-3">
                    <div class="font-black text-emerald-600 text-sm">${formatCurrency(p.price)}</div>
                    ${p.original_price && p.original_price > p.price ? `
                        <div class="flex items-center space-x-1 mt-0.5">
                            <span class="text-[10px] text-slate-400 line-through">${formatCurrency(p.original_price)}</span>
                            <span class="text-[9px] font-black bg-rose-500 text-white px-1.5 py-0.2 rounded-full">-${discountPercent}%</span>
                        </div>
                    ` : ''}
                </td>
                <td class="py-3 px-3">
                    <div class="font-black text-orange-600 text-xs flex items-center">
                        <i class="fa-solid fa-fire mr-1 text-amber-500 text-[10px]"></i> Đã bán ${p.sold_count || 120}
                    </div>
                    <div class="flex items-center text-amber-500 text-[10px] font-bold mt-0.5">
                        <i class="fa-solid fa-star mr-1"></i> ${p.rating || '5.0'} / 5.0
                    </div>
                </td>
                <td class="py-3 px-4 text-right whitespace-nowrap">
                    <button onclick="openQuickView(${p.id})" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition mr-1.5" title="Xem chi tiết">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    <button onclick="handleAddToCartClick(${p.id})" ${p.stock <= 0 ? 'disabled' : ''} class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-sm inline-flex items-center">
                        <i class="fa-solid fa-cart-plus mr-1"></i> Mua ngay
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Render HOT Products Mobile View
function renderHotProductsMobile(products) {
    const container = document.getElementById('hotProductsMobileList');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = `<div class="py-4 text-center text-slate-400 text-xs">Đang tải sản phẩm hot...</div>`;
        return;
    }

    container.innerHTML = products.map((p, index) => {
        const rank = index + 1;
        const discountPercent = p.original_price && p.original_price > p.price
            ? Math.round(((p.original_price - p.price) / p.original_price) * 100)
            : 0;

        let rankBadgeText = rank <= 3 ? (rank === 1 ? '🥇 TOP 1' : rank === 2 ? '🥈 TOP 2' : '🥉 TOP 3') : `#${rank}`;
        let rankColor = rank === 1 ? 'bg-amber-100 text-amber-900 border-amber-300' : rank === 2 ? 'bg-slate-100 text-slate-800 border-slate-300' : rank === 3 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200';

        return `
            <div class="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3 shadow-sm hover:shadow transition">
                <div class="flex items-center space-x-2.5 flex-1 min-w-0">
                    <img src="${p.image_url}" alt="${p.name}" class="w-14 h-14 rounded-xl object-cover border border-slate-200 flex-shrink-0">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center space-x-1.5 mb-0.5">
                            <span class="text-[9px] font-black px-1.5 py-0.2 rounded border ${rankColor}">${rankBadgeText}</span>
                            ${p.badge ? `<span class="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded">${p.badge}</span>` : ''}
                        </div>
                        <h4 class="font-bold text-xs text-slate-800 truncate" onclick="openQuickView(${p.id})">${p.name}</h4>
                        <div class="flex items-baseline space-x-1.5 mt-0.5">
                            <span class="font-black text-emerald-600 text-xs">${formatCurrency(p.price)}</span>
                            ${discountPercent > 0 ? `<span class="text-[9px] bg-rose-500 text-white font-bold px-1 rounded-full">-${discountPercent}%</span>` : ''}
                        </div>
                        <div class="text-[10px] text-orange-600 font-bold mt-0.5">
                            <i class="fa-solid fa-fire text-amber-500"></i> Đã bán ${p.sold_count || 100}+
                        </div>
                    </div>
                </div>
                <button onclick="handleAddToCartClick(${p.id})" ${p.stock <= 0 ? 'disabled' : ''} class="p-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow transition flex-shrink-0 disabled:opacity-50" title="Thêm vào giỏ">
                    <i class="fa-solid fa-cart-plus"></i>
                </button>
            </div>
        `;
    }).join('');
}

/* ========================================================
   GITHUB-STYLE SIDEBAR DRAWER (Bản menu bên hông giống GitHub)
   ======================================================== */

let drawerAllProducts = [];

function toggleStoreSidebarDrawer(open) {
    const drawer = document.getElementById('githubSidebarDrawer');
    const backdrop = document.getElementById('githubSidebarBackdrop');
    if (!drawer || !backdrop) return;

    if (open) {
        backdrop.classList.remove('hidden');
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            drawer.classList.add('open');
        }, 10);
        document.body.style.overflow = 'hidden';

        // Re-render categories & products if loaded
        if (allCategories && allCategories.length > 0) {
            renderDrawerCategories(allCategories);
        }
        if (hotProducts && hotProducts.length > 0) {
            renderDrawerTopProducts(hotProducts);
        }
    } else {
        drawer.classList.remove('open');
        backdrop.classList.add('opacity-0');
        setTimeout(() => {
            backdrop.classList.add('hidden');
            document.body.style.overflow = '';
        }, 280);
    }
}

// Render Categories inside the GitHub Sidebar Drawer
function renderDrawerCategories(categories) {
    const list = document.getElementById('drawerCategoriesList');
    if (!list) return;

    list.innerHTML = categories.map(c => `
        <button onclick="drawerNavigate('category', ${c.id})" class="github-menu-item ${currentCategory == c.id ? 'active' : ''}">
            <i class="fa-solid ${c.icon || 'fa-tag'}"></i>
            <span class="flex-1 text-left truncate">${c.name}</span>
            <span class="text-[10px] text-[#848d97] font-bold bg-[#21262d] px-1.5 py-0.5 rounded-full">${c.product_count || 0}</span>
        </button>
    `).join('');
}

// Render Top Products with Mini Avatars inside Drawer (matching GitHub top repos in user screenshot)
function renderDrawerTopProducts(products) {
    drawerAllProducts = products || [];
    const list = document.getElementById('drawerTopProductsList');
    if (!list) return;

    if (products.length === 0) {
        list.innerHTML = `<div class="text-xs text-[#848d97] px-3 py-2">Đang tải sản phẩm bán chạy...</div>`;
        return;
    }

    list.innerHTML = products.slice(0, 6).map((p) => `
        <button onclick="openQuickView(${p.id}); toggleStoreSidebarDrawer(false);" class="github-repo-item group">
            <img src="${p.image_url}" alt="${p.name}" class="github-repo-thumb group-hover:scale-110 transition-transform">
            <div class="flex-1 min-w-0 text-left">
                <div class="font-semibold truncate text-[#f0f6fc] text-xs group-hover:text-emerald-400 transition">${p.name}</div>
                <div class="text-[10px] text-emerald-400 font-bold flex items-center justify-between">
                    <span>${formatCurrency(p.price)}</span>
                    <span class="text-[#848d97] text-[9px] font-normal">Đã bán ${p.sold_count || 0}</span>
                </div>
            </div>
        </button>
    `).join('');
}

// Search filter in drawer
function filterDrawerProducts(query) {
    const list = document.getElementById('drawerTopProductsList');
    if (!list) return;

    const q = (query || '').toLowerCase().trim();
    const filtered = drawerAllProducts.filter(p => (p.name || '').toLowerCase().includes(q));

    if (filtered.length === 0) {
        list.innerHTML = `<div class="text-xs text-[#848d97] px-3 py-2">Không tìm thấy sản phẩm</div>`;
        return;
    }

    list.innerHTML = filtered.slice(0, 6).map(p => `
        <button onclick="openQuickView(${p.id}); toggleStoreSidebarDrawer(false);" class="github-repo-item group">
            <img src="${p.image_url}" alt="${p.name}" class="github-repo-thumb group-hover:scale-110 transition-transform">
            <div class="flex-1 min-w-0 text-left">
                <div class="font-semibold truncate text-[#f0f6fc] text-xs group-hover:text-emerald-400 transition">${p.name}</div>
                <div class="text-[10px] text-emerald-400 font-bold flex items-center justify-between">
                    <span>${formatCurrency(p.price)}</span>
                    <span class="text-[#848d97] text-[9px] font-normal">Đã bán ${p.sold_count || 0}</span>
                </div>
            </div>
        </button>
    `).join('');
}

// Drawer Navigation Handler (Multi-page aware)
function drawerNavigate(type, value) {
    toggleLeftDrawer(false);
    toggleStoreSidebarDrawer(false);
    toggleThemeModal(false);

    const isProductsPage = window.location.pathname.endsWith('products.html') || window.location.pathname.endsWith('/products');
    const isHotPage = window.location.pathname.endsWith('hot.html') || window.location.pathname.endsWith('/hot');
    const isDealsPage = window.location.pathname.endsWith('deals.html') || window.location.pathname.endsWith('/deals');

    if (type === 'home') {
        window.location.href = 'index.html';
    } else if (type === 'all') {
        if (isProductsPage) {
            filterCategory('all');
            scrollToProducts();
        } else {
            window.location.href = 'products.html';
        }
    } else if (type === 'sale') {
        window.location.href = 'deals.html';
    } else if (type === 'hot') {
        window.location.href = 'hot.html';
    } else if (type === 'category') {
        if (isProductsPage) {
            filterCategory(value);
            scrollToProducts();
        } else {
            window.location.href = `products.html?category=${value}`;
        }
    }
}

/* ========================================================
   DANIEL WELLINGTON STYLE LEFT DRAWER (Bảng danh mục bên trái - Image 3)
   ======================================================== */
function toggleLeftDrawer(open) {
    const drawer = document.getElementById('danielWellingtonDrawer');
    const backdrop = document.getElementById('danielWellingtonBackdrop');
    if (!drawer || !backdrop) return;

    if (open) {
        backdrop.classList.add('open');
        drawer.classList.add('open');
        document.body.style.overflow = 'hidden';
        if (allCategories && allCategories.length > 0) {
            renderDWDrawerCategories(allCategories);
        }
    } else {
        drawer.classList.remove('open');
        backdrop.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// Fallback alias
function toggleRightCategoryDrawer(open) {
    toggleLeftDrawer(open);
}

function renderDWDrawerCategories(categories) {
    const list = document.getElementById('dwCategoriesList');
    if (!list) return;

    list.innerHTML = categories.map(c => `
        <a href="products.html?category=${c.id}" class="dw-menu-item group">
            <span class="flex items-center">
                <i class="fa-solid ${c.icon || 'fa-tag'} mr-3 text-slate-400 group-hover:text-emerald-600 transition text-xs w-4 text-center"></i>
                <span>${c.name}</span>
            </span>
            <div class="flex items-center space-x-2">
                <span class="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-full">${c.product_count || 0}</span>
                <i class="fa-solid fa-chevron-right text-xs text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-transform"></i>
            </div>
        </a>
    `).join('');
}

/* ========================================================
   CUSTOMER BACKGROUND COLOR THEMES (Feature removed)
   ======================================================== */
function setCustomerTheme(themeName) {
    // Background color theme feature removed per user request
}

function initCustomerTheme() {
    // Reset any previously saved theme to clean default
    localStorage.removeItem('mintmart_theme');
    const themes = ['theme-white', 'theme-mint', 'theme-cream', 'theme-slate', 'theme-dark'];
    themes.forEach(t => document.body.classList.remove(t));
}

function toggleThemeModal(open) {
    // No-op
}

// Zalo Chat Helper
function openZaloChat() {
    window.open('https://zalo.me/0912345678', '_blank');
}

/* ========================================================
   HOME PAGE SPECIFIC HELPERS
   ======================================================== */
async function loadHomeFeatured() {
    try {
        const res = await apiFetch('/api/products?sort=popular');
        const products = (res.products || []).slice(0, 8);
        const container = document.getElementById('homeFeaturedGrid');
        if (!container) return;
        renderProductsIntoGrid(container, products);
    } catch (err) {
        console.error('Không thể tải sản phẩm nổi bật:', err);
    }
}

async function loadFlashSale() {
    try {
        const res = await apiFetch('/api/products?on_sale=1&sort=discount');
        flashSaleProducts = (res.products || []).slice(0, 4);
        renderFlashSale(flashSaleProducts);
    } catch (err) {
        console.error('Không thể tải flash sale:', err);
    }
}

function renderHomeCategories(categories) {
    const container = document.getElementById('homeCategoryGrid');
    if (!container) return;

    container.innerHTML = categories.map(c => `
        <a href="products.html?category=${c.id}" class="category-card-hover bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between group transition">
            <div class="flex items-center justify-between mb-3">
                <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl group-hover:bg-emerald-600 group-hover:text-white transition shadow-sm">
                    <i class="fa-solid ${c.icon || 'fa-tag'}"></i>
                </div>
                <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-800 transition">
                    ${c.product_count || 0} SP
                </span>
            </div>
            <div>
                <h3 class="font-bold text-sm text-slate-800 group-hover:text-emerald-600 transition mb-1">${c.name}</h3>
                <p class="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">${c.description || 'Sản phẩm chất lượng cao chính hãng'}</p>
                <div class="text-xs font-bold text-emerald-600 flex items-center">
                    Khám phá ngay <i class="fa-solid fa-arrow-right ml-1.5 text-[10px] group-hover:translate-x-1 transition-transform"></i>
                </div>
            </div>
        </a>
    `).join('');
}

/* ========================================================
   HOT PRODUCTS PODIUM HELPER
   ======================================================== */
function renderHotPodium(products) {
    const podium = document.getElementById('hotPodiumContainer');
    if (!podium || products.length < 3) return;

    const top1 = products[0];
    const top2 = products[1];
    const top3 = products[2];

    podium.innerHTML = `
        <!-- TOP 2 -->
        <div class="order-2 md:order-1 bg-white rounded-3xl p-5 border border-slate-200 shadow-md flex flex-col justify-between relative group transform md:translate-y-4">
            <div class="absolute -top-3 left-4 bg-slate-200 text-slate-800 text-[11px] font-black px-3 py-1 rounded-full shadow border border-slate-300">
                🥈 TOP 2 THỊNH HÀNH
            </div>
            <div class="aspect-square rounded-2xl overflow-hidden mb-3 bg-slate-50 relative mt-2">
                <img src="${top2.image_url}" alt="${top2.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform">
                <span class="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                    ĐÃ BÁN ${top2.sold_count}
                </span>
            </div>
            <div>
                <span class="text-[11px] text-emerald-600 font-bold">${top2.category_name}</span>
                <h4 class="font-bold text-sm text-slate-800 line-clamp-2 mt-0.5 mb-2 hover:text-emerald-600 transition cursor-pointer" onclick="openQuickView(${top2.id})">${top2.name}</h4>
                <div class="flex items-baseline space-x-2 mb-3">
                    <span class="text-emerald-600 font-black text-base">${formatCurrency(top2.price)}</span>
                    ${top2.original_price ? `<span class="text-slate-400 text-xs line-through">${formatCurrency(top2.original_price)}</span>` : ''}
                </div>
                <button onclick="handleAddToCartClick(${top2.id})" class="w-full py-2 bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5">
                    <i class="fa-solid fa-cart-plus"></i> <span>Mua ngay</span>
                </button>
            </div>
        </div>

        <!-- TOP 1 (Champion) -->
        <div class="order-1 md:order-2 bg-gradient-to-b from-amber-50/70 to-white rounded-3xl p-6 border-2 border-amber-300 shadow-xl flex flex-col justify-between relative group z-10">
            <div class="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-lg flex items-center space-x-1.5">
                <i class="fa-solid fa-crown text-yellow-200 animate-bounce"></i>
                <span>QUÁN QUÂN TOP 1</span>
            </div>
            <div class="aspect-square rounded-2xl overflow-hidden mb-3 bg-white relative mt-3 shadow-inner">
                <img src="${top1.image_url}" alt="${top1.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform">
                <span class="absolute top-2.5 right-2.5 bg-gradient-to-r from-rose-500 to-amber-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow">
                    🔥 ĐÃ BÁN ${top1.sold_count}
                </span>
            </div>
            <div>
                <span class="text-[11px] text-amber-700 font-extrabold uppercase">${top1.category_name}</span>
                <h3 class="font-extrabold text-base text-slate-800 line-clamp-2 mt-0.5 mb-2 hover:text-emerald-600 transition cursor-pointer" onclick="openQuickView(${top1.id})">${top1.name}</h3>
                <div class="flex items-baseline space-x-2 mb-3">
                    <span class="text-rose-600 font-black text-lg">${formatCurrency(top1.price)}</span>
                    ${top1.original_price ? `<span class="text-slate-400 text-xs line-through">${formatCurrency(top1.original_price)}</span>` : ''}
                </div>
                <button onclick="handleAddToCartClick(${top1.id})" class="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-md transition flex items-center justify-center space-x-1.5">
                    <i class="fa-solid fa-cart-shopping"></i> <span>Đặt mua ngay quán quân</span>
                </button>
            </div>
        </div>

        <!-- TOP 3 -->
        <div class="order-3 bg-white rounded-3xl p-5 border border-slate-200 shadow-md flex flex-col justify-between relative group transform md:translate-y-4">
            <div class="absolute -top-3 left-4 bg-amber-100 text-amber-900 text-[11px] font-black px-3 py-1 rounded-full shadow border border-amber-300">
                🥉 TOP 3 THỊNH HÀNH
            </div>
            <div class="aspect-square rounded-2xl overflow-hidden mb-3 bg-slate-50 relative mt-2">
                <img src="${top3.image_url}" alt="${top3.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform">
                <span class="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                    ĐÃ BÁN ${top3.sold_count}
                </span>
            </div>
            <div>
                <span class="text-[11px] text-emerald-600 font-bold">${top3.category_name}</span>
                <h4 class="font-bold text-sm text-slate-800 line-clamp-2 mt-0.5 mb-2 hover:text-emerald-600 transition cursor-pointer" onclick="openQuickView(${top3.id})">${top3.name}</h4>
                <div class="flex items-baseline space-x-2 mb-3">
                    <span class="text-emerald-600 font-black text-base">${formatCurrency(top3.price)}</span>
                    ${top3.original_price ? `<span class="text-slate-400 text-xs line-through">${formatCurrency(top3.original_price)}</span>` : ''}
                </div>
                <button onclick="handleAddToCartClick(${top3.id})" class="w-full py-2 bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5">
                    <i class="fa-solid fa-cart-plus"></i> <span>Mua ngay</span>
                </button>
            </div>
        </div>
    `;
}

/* ========================================================
   DEALS PAGE SPECIFIC HELPERS
   ======================================================== */
let dealsFilterTier = 'all';

async function loadDealsProducts() {
    try {
        const res = await apiFetch('/api/products?on_sale=1&sort=discount');
        let products = res.products || [];
        
        if (dealsFilterTier === 'over30') {
            products = products.filter(p => p.original_price && ((p.original_price - p.price) / p.original_price) >= 0.3);
        } else if (dealsFilterTier === 'over20') {
            products = products.filter(p => p.original_price && ((p.original_price - p.price) / p.original_price) >= 0.2);
        } else if (dealsFilterTier === 'under500') {
            products = products.filter(p => p.price <= 500000);
        }

        const countEl = document.getElementById('dealsResultCount');
        if (countEl) countEl.textContent = products.length;

        const grid = document.getElementById('dealsGrid');
        const empty = document.getElementById('dealsEmptyState');
        if (grid) {
            if (products.length === 0) {
                grid.innerHTML = '';
                if (empty) empty.classList.remove('hidden');
            } else {
                if (empty) empty.classList.add('hidden');
                renderProductsIntoGrid(grid, products);
            }
        }
    } catch (err) {
        console.error('Không thể tải sản phẩm deals:', err);
    }
}

function filterDealsTier(tier) {
    dealsFilterTier = tier;
    document.querySelectorAll('.deal-tab-btn').forEach(btn => {
        if (btn.dataset.tier === tier) {
            btn.className = 'deal-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-emerald-600 text-white shadow-sm';
        } else {
            btn.className = 'deal-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition bg-white text-slate-600 hover:bg-slate-100 border border-slate-200';
        }
    });
    loadDealsProducts();
}

// Helper: Generic Grid Renderer
function renderProductsIntoGrid(grid, products) {
    if (!grid) return;
    grid.innerHTML = products.map(product => {
        const discountPercent = product.original_price && product.original_price > product.price
            ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
            : 0;

        return `
            <div class="product-card rounded-2xl overflow-hidden flex flex-col justify-between group shadow-sm hover:shadow-md transition">
                <div class="product-image-container relative">
                    <img src="${product.image_url}" alt="${product.name}" class="w-full h-full object-cover" loading="lazy">
                    
                    <div class="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start z-10">
                        ${discountPercent > 0 ? `
                            <span class="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                                -${discountPercent}%
                            </span>
                        ` : ''}
                        ${product.badge ? `
                            <span class="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                                ${product.badge}
                            </span>
                        ` : ''}
                    </div>

                    <div class="absolute top-2.5 right-2.5 z-10">
                        ${product.stock > 0 ? `
                            <span class="bg-white/90 backdrop-blur-sm text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm border border-emerald-100">
                                Sẵn hàng (${product.stock})
                            </span>
                        ` : `
                            <span class="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                Tạm hết hàng
                            </span>
                        `}
                    </div>

                    <div class="product-action-overlay">
                        <button onclick="openQuickView(${product.id})" class="bg-white hover:bg-emerald-50 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl shadow-lg border border-slate-100 flex items-center transition transform hover:scale-105">
                            <i class="fa-regular fa-eye mr-1 text-emerald-600"></i> Xem nhanh
                        </button>
                    </div>
                </div>

                <div class="p-3.5 flex flex-col flex-grow justify-between">
                    <div>
                        <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <span class="text-emerald-600 font-semibold truncate max-w-[65%]">${product.category_name || 'Khác'}</span>
                            <span class="flex items-center text-amber-500 font-bold">
                                <i class="fa-solid fa-star text-[10px] mr-1"></i> ${product.rating || '5.0'}
                            </span>
                        </div>

                        <h3 class="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 hover:text-emerald-600 transition cursor-pointer mb-2" onclick="openQuickView(${product.id})">
                            ${product.name}
                        </h3>
                    </div>

                    <div>
                        <div class="flex items-baseline space-x-2 mb-3">
                            <span class="text-emerald-600 font-extrabold text-sm sm:text-base">${formatCurrency(product.price)}</span>
                            ${product.original_price ? `
                                <span class="text-slate-400 text-xs line-through">${formatCurrency(product.original_price)}</span>
                            ` : ''}
                        </div>

                        <button onclick="handleAddToCartClick(${product.id})" ${product.stock <= 0 ? 'disabled' : ''} class="w-full py-2 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 border border-emerald-200 hover:border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed">
                            <i class="fa-solid fa-cart-plus"></i>
                            <span>Thêm vào giỏ</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ESC Key listener to close drawers & modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        toggleLeftDrawer(false);
        toggleStoreSidebarDrawer(false);
        toggleRightCategoryDrawer(false);
        toggleThemeModal(false);
        closeQuickViewModal();
        closeCheckoutModal();
        closeAuthModal();
        closeOrderHistoryModal();
    }
});

// Quick View Modal
async function openQuickView(productId) {
    try {
        const res = await apiFetch(`/api/products/${productId}`);
        const p = res.product;
        if (!p) return;

        const discountPercent = p.original_price && p.original_price > p.price
            ? Math.round(((p.original_price - p.price) / p.original_price) * 100)
            : 0;

        const content = document.getElementById('quickViewContent');
        content.innerHTML = `
            <div class="rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 aspect-square flex items-center justify-center">
                <img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-cover">
            </div>
            <div class="flex flex-col justify-between">
                <div>
                    <div class="flex items-center space-x-2 mb-2">
                        <span class="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">${p.category_name || 'Sản phẩm'}</span>
                        ${p.badge ? `<span class="text-xs font-bold text-white bg-emerald-600 px-2 py-0.5 rounded-full">${p.badge}</span>` : ''}
                        <span class="text-xs font-bold text-amber-500 ml-auto flex items-center">
                            <i class="fa-solid fa-star mr-1"></i> ${p.rating || '5.0'} (${p.sold_count || 0} đã bán)
                        </span>
                    </div>

                    <h2 class="text-lg font-bold text-slate-800 leading-snug mb-3">${p.name}</h2>

                    <div class="p-3 bg-emerald-50/50 rounded-xl mb-4 flex items-baseline space-x-3">
                        <span class="text-2xl font-black text-emerald-600">${formatCurrency(p.price)}</span>
                        ${p.original_price ? `<span class="text-sm text-slate-400 line-through">${formatCurrency(p.original_price)}</span>` : ''}
                        ${discountPercent > 0 ? `<span class="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">Tiết kiệm ${discountPercent}%</span>` : ''}
                    </div>

                    <p class="text-xs text-slate-600 leading-relaxed mb-4">${p.description || 'Sản phẩm chính hãng chất lượng cao tại MintMart.'}</p>
                    
                    <div class="text-xs text-slate-500 space-y-1 mb-4">
                        <div><i class="fa-solid fa-check text-emerald-500 mr-2"></i> Tồn kho hiện có: <strong>${p.stock}</strong> sản phẩm</div>
                        <div><i class="fa-solid fa-truck-fast text-emerald-500 mr-2"></i> Miễn phí giao hàng cho đơn từ 299.000₫</div>
                        <div><i class="fa-solid fa-shield-check text-emerald-500 mr-2"></i> Đổi trả miễn phí trong vòng 7 ngày</div>
                    </div>
                </div>

                <div class="space-y-3 pt-4 border-t border-slate-100">
                    <div class="flex items-center space-x-3">
                        <span class="text-xs font-bold text-slate-600">Số lượng:</span>
                        <div class="flex items-center border border-slate-200 rounded-lg">
                            <button onclick="adjustQuickViewQty(-1)" class="w-8 h-8 text-slate-600 hover:bg-slate-100 flex items-center justify-center font-bold">-</button>
                            <input type="number" id="quickViewQty" value="1" min="1" max="${p.stock}" class="w-12 text-center text-xs font-bold outline-none border-x border-slate-200">
                            <button onclick="adjustQuickViewQty(1)" class="w-8 h-8 text-slate-600 hover:bg-slate-100 flex items-center justify-center font-bold">+</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="submitQuickViewAdd(${p.id}, false)" class="py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs border border-emerald-300 transition flex items-center justify-center">
                            <i class="fa-solid fa-cart-plus mr-1.5"></i> Thêm vào giỏ
                        </button>
                        <button onclick="submitQuickViewAdd(${p.id}, true)" class="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center">
                            Mua ngay
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('quickViewModal').classList.remove('hidden');
    } catch (err) {
        showToast('error', 'Không thể mở thông tin sản phẩm');
    }
}

function adjustQuickViewQty(delta) {
    const input = document.getElementById('quickViewQty');
    if (!input) return;
    let val = parseInt(input.value) || 1;
    val = Math.max(1, val + delta);
    input.value = val;
}

async function submitQuickViewAdd(productId, isBuyNow) {
    const qtyInput = document.getElementById('quickViewQty');
    const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;

    try {
        const res = await apiFetch(`/api/products/${productId}`);
        if (res.product) {
            addToCart(res.product, qty);
            closeQuickViewModal();
            if (isBuyNow) {
                toggleCartDrawer(true);
            }
        }
    } catch (e) {
        showToast('error', 'Lỗi khi thêm vào giỏ hàng');
    }
}

function closeQuickViewModal() {
    document.getElementById('quickViewModal').classList.add('hidden');
}

// Shopping Cart Drawer
function toggleCartDrawer(open) {
    const drawer = document.getElementById('cartDrawer');
    const backdrop = document.getElementById('cartDrawerBackdrop');
    if (open) {
        backdrop.classList.remove('hidden');
        setTimeout(() => backdrop.classList.remove('opacity-0'), 10);
        drawer.classList.remove('translate-x-full');
    } else {
        backdrop.classList.add('opacity-0');
        drawer.classList.add('translate-x-full');
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    }
}

function updateCartUI() {
    const { count, subtotal, shipping, total, items } = getCartTotals();

    // Badges
    const headerCartCount = document.getElementById('headerCartCount');
    if (headerCartCount) headerCartCount.textContent = count;
    const drawerBadge = document.getElementById('drawerCartBadge');
    if (drawerBadge) drawerBadge.textContent = count;
    const sideDrawerCount = document.getElementById('drawerCartCount');
    if (sideDrawerCount) sideDrawerCount.textContent = count;

    // Totals in drawer
    const subtotalEl = document.getElementById('drawerSubtotal');
    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
    const shipEl = document.getElementById('drawerShipping');
    if (shipEl) shipEl.textContent = shipping === 0 ? 'Miễn phí' : formatCurrency(shipping);
    const grandEl = document.getElementById('drawerGrandTotal');
    if (grandEl) grandEl.textContent = formatCurrency(total);

    // Render Drawer Items
    const container = document.getElementById('cartDrawerItems');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16">
                <div class="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto text-2xl mb-3">
                    <i class="fa-solid fa-basket-shopping"></i>
                </div>
                <div class="font-bold text-slate-700 text-sm">Giỏ hàng của bạn đang trống</div>
                <div class="text-xs text-slate-400 mt-1">Hãy lướt MintMart để lựa chọn những món đồ ưng ý nhé!</div>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <img src="${item.image_url}" alt="${item.name}" class="w-14 h-14 object-cover rounded-lg flex-shrink-0 bg-white">
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-bold text-slate-800 truncate">${item.name}</h4>
                <div class="text-xs text-emerald-600 font-extrabold mt-0.5">${formatCurrency(item.price)}</div>
                <div class="flex items-center space-x-2 mt-2">
                    <button onclick="updateCartQuantity(${item.id}, ${item.quantity - 1})" class="w-5 h-5 bg-white border border-slate-200 rounded flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-slate-100">-</button>
                    <span class="text-xs font-bold text-slate-700 px-1">${item.quantity}</span>
                    <button onclick="updateCartQuantity(${item.id}, ${item.quantity + 1})" class="w-5 h-5 bg-white border border-slate-200 rounded flex items-center justify-center text-xs font-bold text-slate-600 hover:bg-slate-100">+</button>
                </div>
            </div>
            <button onclick="removeFromCart(${item.id})" class="text-slate-400 hover:text-rose-500 p-1 text-sm transition">
                <i class="fa-regular fa-trash-can"></i>
            </button>
        </div>
    `).join('');
}

// Checkout Modal
function openCheckoutModal() {
    const { items, count, shipping, total } = getCartTotals();
    if (items.length === 0) {
        showToast('warning', 'Giỏ hàng đang trống, hãy thêm sản phẩm trước!');
        return;
    }

    toggleCartDrawer(false);

    // Pre-fill user data if logged in
    const user = getCurrentUser();
    if (user) {
        document.getElementById('orderCustomerName').value = user.name || '';
        document.getElementById('orderCustomerPhone').value = user.phone || '';
        document.getElementById('orderCustomerEmail').value = user.email || '';
        document.getElementById('orderShippingAddress').value = user.address || '';
    }

    document.getElementById('checkoutItemCount').textContent = `${count} món`;
    document.getElementById('checkoutShippingFee').textContent = shipping === 0 ? 'Miễn phí' : formatCurrency(shipping);
    document.getElementById('checkoutFinalTotal').textContent = formatCurrency(total);

    document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeCheckoutModal() {
    document.getElementById('checkoutModal').classList.add('hidden');
}

// Submit Checkout
async function submitCheckout(e) {
    e.preventDefault();
    const { items, total } = getCartTotals();

    const customer_name = document.getElementById('orderCustomerName').value;
    const customer_phone = document.getElementById('orderCustomerPhone').value;
    const customer_email = document.getElementById('orderCustomerEmail').value;
    const shipping_address = document.getElementById('orderShippingAddress').value;
    const note = document.getElementById('orderNote').value;
    const paymentMethodEl = document.querySelector('input[name="paymentMethod"]:checked');
    const payment_method = paymentMethodEl ? paymentMethodEl.value : 'COD';

    const user = getCurrentUser();

    try {
        const payload = {
            customer_name,
            customer_phone,
            customer_email,
            shipping_address,
            payment_method,
            note,
            items,
            user_id: user ? user.id : null
        };

        const res = await apiFetch('/api/orders', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        closeCheckoutModal();
        clearCart();

        // Beautiful order success modal with marketplace sync notice
        Swal.fire({
            icon: 'success',
            title: 'Đặt Hàng Thành Công! 🎉',
            html: `
                <div class="text-left text-sm space-y-2 mt-3">
                    <p>Mã đơn hàng: <strong class="text-emerald-600 font-bold">${res.order.order_code}</strong></p>
                    <p>Người nhận: <strong>${customer_name}</strong> - ${customer_phone}</p>
                    <p>Địa chỉ: ${shipping_address}</p>
                    <p>Phương thức: <strong>${payment_method}</strong></p>
                    <p class="text-emerald-600 font-black text-base pt-2 border-t">Tổng thanh toán: ${formatCurrency(res.order.total_amount)}</p>
                    
                    <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 mt-2 space-y-1">
                        <div class="font-bold flex items-center text-emerald-700">
                            <i class="fa-solid fa-arrows-rotate mr-1.5 text-emerald-600 animate-spin" style="animation-duration: 3s"></i>
                            Đã khấu trừ kho trên Shopee & Lazada!
                        </div>
                        <div class="text-[11px] text-emerald-600">
                            Hệ thống đã tự động gọi API cập nhật giảm tồn kho tương ứng trên 2 sàn thương mại điện tử.
                        </div>
                    </div>

                    <p class="text-xs text-slate-400 mt-2 italic">Nhân viên MintMart sẽ sớm liên hệ qua số điện thoại để xác nhận đơn hàng.</p>
                </div>
            `,
            confirmButtonText: 'Tiếp tục mua hàng',
            confirmButtonColor: '#10B981'
        });

    } catch (err) {
        showToast('error', err.message || 'Lỗi khi tạo đơn hàng');
    }
}

// User UI & Dropdown
function updateUserUI() {
    const user = getCurrentUser();
    const topGreeting = document.getElementById('topUserGreeting');
    const roleBadge = document.getElementById('userRoleBadge');
    const nameDisplay = document.getElementById('userNameDisplay');
    const headerAdminPill = document.getElementById('headerAdminPill');
    const loggedInSection = document.getElementById('userDropdownLoggedInOnly');
    const loggedOutSection = document.getElementById('userDropdownLoggedOutOnly');
    const dropdownAdminLink = document.getElementById('dropdownAdminLink');

    if (user) {
        if (roleBadge) roleBadge.textContent = user.role === 'admin' ? 'Quản Trị' : 'Thành Viên';
        if (nameDisplay) nameDisplay.textContent = user.name.split(' ').pop();
        if (topGreeting) {
            topGreeting.innerHTML = `
                <span class="text-emerald-200">Xin chào, <strong>${user.name}</strong></span>
                <span class="mx-1">|</span>
                <button onclick="logoutCustomer()" class="text-emerald-300 hover:text-white underline">Đăng xuất</button>
            `;
        }

        document.getElementById('dropdownUserName').textContent = user.name;
        document.getElementById('dropdownUserEmail').textContent = user.email;

        if (loggedInSection) loggedInSection.classList.remove('hidden');
        if (loggedOutSection) loggedOutSection.classList.add('hidden');

        // If admin, show admin portals links
        if (user.role === 'admin') {
            if (headerAdminPill) headerAdminPill.classList.remove('hidden');
            if (dropdownAdminLink) dropdownAdminLink.classList.remove('hidden');
        } else {
            if (headerAdminPill) headerAdminPill.classList.add('hidden');
            if (dropdownAdminLink) dropdownAdminLink.classList.add('hidden');
        }
    } else {
        if (roleBadge) roleBadge.textContent = 'Khách';
        if (nameDisplay) nameDisplay.textContent = 'Tài khoản';
        if (topGreeting) {
            topGreeting.innerHTML = `
                <span id="topAuthButton" class="hover:text-white transition cursor-pointer" onclick="openAuthModal('login')">
                    <i class="fa-regular fa-user mr-1"></i> Đăng nhập / Đăng ký
                </span>
            `;
        }
        if (headerAdminPill) headerAdminPill.classList.add('hidden');
        if (loggedInSection) loggedInSection.classList.add('hidden');
        if (loggedOutSection) loggedOutSection.classList.remove('hidden');
    }
}

function handleUserMenuClick() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.toggle('hidden');
}

// Auth Modal Controls
function openAuthModal(tab = 'login') {
    switchAuthTab(tab);
    document.getElementById('authModal').classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
}

function switchAuthTab(tab) {
    const tabLogin = document.getElementById('authTabLogin');
    const tabRegister = document.getElementById('authTabRegister');
    const formLogin = document.getElementById('loginForm');
    const formRegister = document.getElementById('registerForm');

    if (tab === 'login') {
        tabLogin.className = 'flex-1 pb-2 text-xs font-bold border-b-2 border-emerald-500 text-emerald-600 text-center';
        tabRegister.className = 'flex-1 pb-2 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 text-center';
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    } else {
        tabRegister.className = 'flex-1 pb-2 text-xs font-bold border-b-2 border-emerald-500 text-emerald-600 text-center';
        tabLogin.className = 'flex-1 pb-2 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 text-center';
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
    }
}

// Quick fill for testing
function fillQuickAuth(role) {
    if (role === 'admin') {
        document.getElementById('loginEmail').value = 'admin@mintmart.vn';
        document.getElementById('loginPassword').value = 'admin123';
    } else {
        document.getElementById('loginEmail').value = 'khachhang@gmail.com';
        document.getElementById('loginPassword').value = '123456';
    }
}

// Submit Login
async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        setAuth(res.token, res.user);
        // If admin, automatically redirect to Admin portal
        if (res.user.role === 'admin') {
            showToast('success', `Chào mừng Quản trị viên ${res.user.name}! Đang chuyển đến Trang Quản Trị...`);
            setTimeout(() => {
                window.location.href = 'admin.html';
            }, 500);
            return;
        }

        updateUserUI();
        showToast('success', `Chào mừng ${res.user.name} đã quay trở lại!`);

    } catch (err) {
        showToast('error', err.message || 'Đăng nhập không thành công');
    }
}

// Submit Register
async function handleRegisterSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const phone = document.getElementById('regPhone').value;
    const password = document.getElementById('regPassword').value;

    try {
        const res = await apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, phone, password })
        });

        setAuth(res.token, res.user);
        closeAuthModal();
        updateUserUI();
        showToast('success', 'Đăng ký tài khoản thành công!');
    } catch (err) {
        showToast('error', err.message || 'Đăng ký thất bại');
    }
}

// Logout
function logoutCustomer() {
    clearAuth();
    updateUserUI();
    showToast('info', 'Bạn đã đăng xuất khỏi hệ thống');
}

// Order History
async function openOrderHistoryModal() {
    const modal = document.getElementById('orderHistoryModal');
    const list = document.getElementById('orderHistoryList');
    modal.classList.remove('hidden');

    try {
        const user = getCurrentUser();
        if (!user) {
            list.innerHTML = `<p class="text-rose-500 text-center py-4">Vui lòng đăng nhập để xem lịch sử đơn hàng</p>`;
            return;
        }

        // For demo, fetch recent orders from customer
        list.innerHTML = `
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div class="flex justify-between font-bold text-slate-700">
                    <span>Mã đơn: #MM-98214</span>
                    <span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px]">Đã giao thành công</span>
                </div>
                <div class="text-slate-500 text-[11px] mt-1">Tai nghe Bluetooth Không Dây Mint Sound Pro x 1</div>
                <div class="flex justify-between items-center text-slate-800 font-extrabold mt-2 pt-2 border-t border-slate-200">
                    <span>Tổng: 890.000 ₫</span>
                    <span class="text-[10px] text-slate-400 font-normal">Thanh toán: COD</span>
                </div>
            </div>
            <div class="text-center text-[11px] text-slate-400 pt-2">
                Đang hiển thị đơn hàng mới nhất của bạn.
            </div>
        `;
    } catch (e) {
        list.innerHTML = `<p class="text-slate-400 text-center py-4">Chưa có đơn hàng nào</p>`;
    }
}

function closeOrderHistoryModal() {
    document.getElementById('orderHistoryModal').classList.add('hidden');
}
