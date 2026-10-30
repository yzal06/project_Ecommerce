/**
 * MintMart - Shared API & Utilities
 */

const API_BASE = ''; // Same origin

// Storage keys
const TOKEN_KEY = 'mintmart_token';
const USER_KEY = 'mintmart_user';
const CART_KEY = 'mintmart_cart';

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

// Unified API Fetch wrapper
async function apiFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
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
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `Lỗi HTTP ${response.status}`);
        }

        return data;
    } catch (err) {
        console.error(`API Error [${endpoint}]:`, err);
        throw err;
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
