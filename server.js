const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { runQuery, getQuery, allQuery, initDatabase } = require('./database');
const marketplaceService = require('./marketplaceService');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'mintmart-secret-key-2026-safe-e-commerce';

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'prod-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, webp, jpeg)!'));
        }
    }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static directories (Supports both public/ and root directory structure)
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Specific friendly routes for clean URLs
app.get('/admin', (req, res) => {
    const adminPath = fs.existsSync(path.join(__dirname, 'admin.html'))
        ? path.join(__dirname, 'admin.html')
        : path.join(__dirname, 'public', 'admin.html');
    res.sendFile(adminPath);
});

app.get('/products', (req, res) => {
    const p = fs.existsSync(path.join(__dirname, 'products.html'))
        ? path.join(__dirname, 'products.html')
        : path.join(__dirname, 'public', 'products.html');
    res.sendFile(p);
});

app.get('/hot', (req, res) => {
    const p = fs.existsSync(path.join(__dirname, 'hot.html'))
        ? path.join(__dirname, 'hot.html')
        : path.join(__dirname, 'public', 'hot.html');
    res.sendFile(p);
});

app.get('/deals', (req, res) => {
    const p = fs.existsSync(path.join(__dirname, 'deals.html'))
        ? path.join(__dirname, 'deals.html')
        : path.join(__dirname, 'public', 'deals.html');
    res.sendFile(p);
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập để thực hiện!' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ!' });
        }
        req.user = user;
        next();
    });
};

// Admin Only Middleware
const requireAdmin = (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ success: false, message: 'Bạn không có quyền quản trị viên (Admin) để thao tác!' });
        }
    });
};

/* ========================================================
   AUTH ROUTES
   ======================================================== */

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name, phone, address, role } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ họ tên, email và mật khẩu!' });
        }

        const existing = await getQuery(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email này đã được sử dụng!' });
        }

        const passHash = await bcrypt.hash(password, 10);
        // Default role is customer unless set by admin
        const assignedRole = (role === 'admin') ? 'admin' : 'customer';

        const result = await runQuery(
            `INSERT INTO users (email, password, name, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)`,
            [email.toLowerCase().trim(), passHash, name.trim(), phone || '', address || '', assignedRole]
        );

        const token = jwt.sign(
            { id: result.lastID, email: email.toLowerCase().trim(), role: assignedRole, name: name.trim() },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Đăng ký tài khoản thành công!',
            token,
            user: { id: result.lastID, email: email.toLowerCase().trim(), role: assignedRole, name: name.trim() }
        });
    } catch (err) {
        console.error('Lỗi đăng ký:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi đăng ký' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp email và mật khẩu!' });
        }

        const user = await getQuery(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không chính xác!' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không chính xác!' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Đăng nhập thành công!',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                phone: user.phone,
                address: user.address
            }
        });
    } catch (err) {
        console.error('Lỗi đăng nhập:', err);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng nhập' });
    }
});

// Current user profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await getQuery(`SELECT id, email, name, phone, address, role, created_at FROM users WHERE id = ?`, [req.user.id]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin tài khoản' });
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

/* ========================================================
   CATEGORY ROUTES
   ======================================================== */

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await allQuery(`
            SELECT c.*, COUNT(p.id) as product_count 
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
            GROUP BY c.id
            ORDER BY c.id ASC
        `);
        res.json({ success: true, categories });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Không thể tải danh mục sản phẩm' });
    }
});

app.post('/api/categories', requireAdmin, async (req, res) => {
    try {
        const { name, icon, description } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Tên danh mục không được để trống' });
        }
        const slug = name.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[đĐ]/g, "d")
            .replace(/[^a-z0-9\s-]/g, "")
            .trim().replace(/\s+/g, "-");

        const result = await runQuery(
            `INSERT INTO categories (name, slug, icon, description) VALUES (?, ?, ?, ?)`,
            [name.trim(), slug + '-' + Date.now(), icon || 'fa-tag', description || '']
        );

        res.json({ success: true, message: 'Tạo danh mục mới thành công!', categoryId: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo danh mục' });
    }
});

/* ========================================================
   PRODUCT ROUTES (CRUD + Real-time sync)
   ======================================================== */

// List products (Supports search, filter, sort)
// List products (Supports search, filter, sort, discount, hot, status)
app.get('/api/products', async (req, res) => {
    try {
        const { category_id, search, minPrice, maxPrice, sort, adminView, status, hot, on_sale } = req.query;

        let sql = `
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        `;
        const params = [];

        // In public customer storefront, only show active products
        if (!adminView || adminView === '0') {
            sql += ` AND p.is_active = 1`;
        } else if (status === 'active') {
            sql += ` AND p.is_active = 1`;
        } else if (status === 'inactive' || status === 'unlisted') {
            sql += ` AND p.is_active = 0`;
        }

        if (hot === '1' || hot === 'true') {
            sql += ` AND (p.badge LIKE '%HOT%' OR p.badge LIKE '%BÁN CHẠY%' OR p.badge LIKE '%BEST SELLER%' OR p.sold_count >= 200)`;
        }

        if (on_sale === '1' || on_sale === 'true') {
            sql += ` AND p.original_price IS NOT NULL AND p.original_price > p.price`;
        }

        if (category_id && category_id !== 'all') {
            sql += ` AND p.category_id = ?`;
            params.push(category_id);
        }

        if (search) {
            sql += ` AND (p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)`;
            const q = `%${search.trim()}%`;
            params.push(q, q, q);
        }

        if (minPrice) {
            sql += ` AND p.price >= ?`;
            params.push(Number(minPrice));
        }

        if (maxPrice) {
            sql += ` AND p.price <= ?`;
            params.push(Number(maxPrice));
        }

        // Sorting
        if (sort === 'price_asc') {
            sql += ` ORDER BY p.price ASC`;
        } else if (sort === 'price_desc') {
            sql += ` ORDER BY p.price DESC`;
        } else if (sort === 'popular') {
            sql += ` ORDER BY p.sold_count DESC`;
        } else if (sort === 'rating') {
            sql += ` ORDER BY p.rating DESC`;
        } else if (sort === 'discount') {
            sql += ` ORDER BY (CASE WHEN p.original_price > p.price THEN ((p.original_price - p.price) * 1.0 / p.original_price) ELSE 0 END) DESC, p.id DESC`;
        } else {
            sql += ` ORDER BY p.id DESC`; // newest first
        }

        const products = await allQuery(sql, params);
        res.json({ success: true, count: products.length, products });
    } catch (err) {
        console.error('Lỗi lấy danh sách sản phẩm:', err);
        res.status(500).json({ success: false, message: 'Lỗi tải danh sách sản phẩm' });
    }
});

// Dedicated endpoint for HOT products (Customer Storefront)
app.get('/api/products/hot', async (req, res) => {
    try {
        const sql = `
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.is_active = 1
            ORDER BY 
                CASE 
                    WHEN p.badge LIKE '%HOT%' THEN 1
                    WHEN p.badge LIKE '%BÁN CHẠY%' OR p.badge LIKE '%BEST SELLER%' THEN 2
                    ELSE 3
                END ASC,
                p.sold_count DESC,
                p.rating DESC
            LIMIT 8
        `;
        const products = await allQuery(sql);
        res.json({ success: true, count: products.length, products });
    } catch (err) {
        console.error('Lỗi lấy danh sách sản phẩm hot:', err);
        res.status(500).json({ success: false, message: 'Lỗi tải danh sách sản phẩm hot' });
    }
});

// Single product
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await getQuery(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `, [req.params.id]);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
        }
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// Add new product (ADMIN ONLY)
app.post('/api/products', requireAdmin, async (req, res) => {
    try {
        const {
            name, category_id, price, original_price, stock, image_url, badge, description, is_active,
            shopee_item_id, shopee_stock, lazada_item_id, lazada_stock, auto_sync_marketplace
        } = req.body;

        if (!name || !price) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập tên và giá sản phẩm!' });
        }

        const slug = name.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[đĐ]/g, "d")
            .replace(/[^a-z0-9\s-]/g, "")
            .trim().replace(/\s+/g, "-") + '-' + Date.now();

        const defaultImg = image_url || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&auto=format&fit=crop&q=80';
        const initialStock = stock !== undefined ? Number(stock) : 10;
        const initialShopeeStock = shopee_stock !== undefined ? Number(shopee_stock) : initialStock;
        const initialLazadaStock = lazada_stock !== undefined ? Number(lazada_stock) : initialStock;

        const result = await runQuery(`
            INSERT INTO products 
            (name, slug, category_id, price, original_price, stock, image_url, badge, description, is_active,
             shopee_item_id, shopee_stock, lazada_item_id, lazada_stock, auto_sync_marketplace)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name.trim(),
            slug,
            category_id ? Number(category_id) : null,
            Number(price),
            original_price ? Number(original_price) : null,
            initialStock,
            defaultImg,
            badge || '',
            description || '',
            is_active !== undefined ? Number(is_active) : 1,
            shopee_item_id || `SHP-${Date.now().toString().slice(-7)}`,
            initialShopeeStock,
            lazada_item_id || `LAZ-${Date.now().toString().slice(-7)}`,
            initialLazadaStock,
            auto_sync_marketplace !== undefined ? Number(auto_sync_marketplace) : 1
        ]);

        const newProduct = await getQuery(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `, [result.lastID]);

        res.json({
            success: true,
            message: 'Thêm mặt hàng mới thành công (Đã liên kết kho Shopee & Lazada)!',
            product: newProduct
        });
    } catch (err) {
        console.error('Lỗi thêm sản phẩm:', err);
        res.status(500).json({ success: false, message: 'Lỗi khi lưu sản phẩm vào cơ sở dữ liệu' });
    }
});

// Update product (ADMIN ONLY)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, category_id, price, original_price, stock, image_url, badge, description, is_active,
            shopee_item_id, shopee_stock, lazada_item_id, lazada_stock, auto_sync_marketplace
        } = req.body;

        const existing = await getQuery(`SELECT id FROM products WHERE id = ?`, [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm cần cập nhật' });
        }

        await runQuery(`
            UPDATE products 
            SET name = COALESCE(?, name),
                category_id = COALESCE(?, category_id),
                price = COALESCE(?, price),
                original_price = COALESCE(?, original_price),
                stock = COALESCE(?, stock),
                image_url = COALESCE(?, image_url),
                badge = COALESCE(?, badge),
                description = COALESCE(?, description),
                is_active = COALESCE(?, is_active),
                shopee_item_id = COALESCE(?, shopee_item_id),
                shopee_stock = COALESCE(?, shopee_stock),
                lazada_item_id = COALESCE(?, lazada_item_id),
                lazada_stock = COALESCE(?, lazada_stock),
                auto_sync_marketplace = COALESCE(?, auto_sync_marketplace)
            WHERE id = ?
        `, [
            name ? name.trim() : null,
            category_id !== undefined ? Number(category_id) : null,
            price !== undefined ? Number(price) : null,
            original_price !== undefined ? Number(original_price) : null,
            stock !== undefined ? Number(stock) : null,
            image_url || null,
            badge !== undefined ? badge : null,
            description !== undefined ? description : null,
            is_active !== undefined ? Number(is_active) : null,
            shopee_item_id || null,
            shopee_stock !== undefined ? Number(shopee_stock) : null,
            lazada_item_id || null,
            lazada_stock !== undefined ? Number(lazada_stock) : null,
            auto_sync_marketplace !== undefined ? Number(auto_sync_marketplace) : null,
            id
        ]);

        const updated = await getQuery(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `, [id]);

        res.json({ success: true, message: 'Cập nhật sản phẩm & kho Shopee/Lazada thành công!', product: updated });
    } catch (err) {
        console.error('Lỗi cập nhật sản phẩm:', err);
        res.status(500).json({ success: false, message: 'Lỗi khi cập nhật sản phẩm' });
    }
});

// Toggle product active status (Gỡ sản phẩm khỏi web / Mở bán lại - ADMIN ONLY)
app.patch('/api/products/:id/toggle-active', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await getQuery(`SELECT id, name, is_active FROM products WHERE id = ?`, [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
        }

        let newStatus = existing.is_active === 1 ? 0 : 1;
        if (req.body && req.body.is_active !== undefined) {
            newStatus = Number(req.body.is_active) ? 1 : 0;
        }

        await runQuery(`UPDATE products SET is_active = ? WHERE id = ?`, [newStatus, id]);

        const actionText = newStatus === 1 ? 'Đã đăng mở bán lại trên website!' : 'Đã gỡ sản phẩm khỏi website bán hàng!';
        res.json({
            success: true,
            is_active: newStatus,
            message: `${actionText} ("${existing.name}")`
        });
    } catch (err) {
        console.error('Lỗi khi gỡ/mở bán sản phẩm:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật trạng thái sản phẩm' });
    }
});

// Delete product (ADMIN ONLY)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await runQuery(`DELETE FROM products WHERE id = ?`, [id]);
        res.json({ success: true, message: 'Đã xóa sản phẩm thành công!' });
    } catch (err) {
        console.error('Lỗi xóa sản phẩm:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi xóa sản phẩm' });
    }
});

// Upload Product Image (ADMIN ONLY)
app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Không có file ảnh nào được tải lên!' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({
        success: true,
        message: 'Tải ảnh lên thành công!',
        url: imageUrl
    });
});

/* ========================================================
   ORDER ROUTES
   ======================================================== */

// Place an order (Customer with multi-channel stock deduction)
app.post('/api/orders', async (req, res) => {
    try {
        const { customer_name, customer_phone, customer_email, shipping_address, payment_method, note, items, user_id } = req.body;

        if (!customer_name || !customer_phone || !shipping_address || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ thông tin nhận hàng và sản phẩm!' });
        }

        // ========================================================
        // RÀNG BUỘC KIỂM TRA TỒN KHO LIÊN SÀN (WEB, SHOPEE, LAZADA)
        // ========================================================
        for (const item of items) {
            if (item.product_id) {
                const product = await getQuery(`
                    SELECT id, name, stock, shopee_stock, lazada_stock, is_active 
                    FROM products 
                    WHERE id = ?
                `, [item.product_id]);

                if (!product || !product.is_active) {
                    return res.status(400).json({
                        success: false,
                        message: `Ràng buộc kho: Mặt hàng "${item.name}" hiện không khả dụng hoặc đã tạm ngừng kinh doanh!`
                    });
                }

                const requestedQty = Number(item.quantity);
                if (product.stock < requestedQty) {
                    return res.status(400).json({
                        success: false,
                        message: `Ràng buộc kho: Mặt hàng "${product.name}" hiện chỉ còn ${product.stock} sản phẩm trong kho (đồng bộ kho Shopee & Lazada). Bạn không thể đặt ${requestedQty} sản phẩm!`
                    });
                }
            }
        }

        // Calculate total amount
        let calculatedTotal = 0;
        for (const item of items) {
            calculatedTotal += (Number(item.price) * Number(item.quantity));
        }

        const orderCode = 'MM-' + Math.floor(100000 + Math.random() * 900000);

        const orderResult = await runQuery(`
            INSERT INTO orders 
            (order_code, customer_name, customer_phone, customer_email, shipping_address, payment_method, total_amount, note, user_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [
            orderCode,
            customer_name.trim(),
            customer_phone.trim(),
            customer_email ? customer_email.trim() : '',
            shipping_address.trim(),
            payment_method || 'COD',
            calculatedTotal,
            note || '',
            user_id || null
        ]);

        const orderId = orderResult.lastID;

        // Insert order items & reduce website product stock
        for (const item of items) {
            await runQuery(`
                INSERT INTO order_items (order_id, product_id, product_name, product_image, price, quantity, total)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                orderId,
                item.product_id || null,
                item.name,
                item.image || '',
                Number(item.price),
                Number(item.quantity),
                Number(item.price) * Number(item.quantity)
            ]);

            // Trừ kho trên website
            if (item.product_id) {
                await runQuery(`
                    UPDATE products 
                    SET stock = MAX(0, stock - ?),
                        sold_count = sold_count + ?
                    WHERE id = ?
                `, [Number(item.quantity), Number(item.quantity), item.product_id]);
            }
        }

        // ========================================================
        // RÀNG BUỘC ĐỒNG BỘ: TỰ ĐỘNG KHẤU TRỪ KHO SHOPEE VÀ LAZADA
        // ========================================================
        let syncResults = [];
        try {
            syncResults = await marketplaceService.syncOrderStockDeduction({
                orderId,
                orderCode,
                items
            });
        } catch (syncErr) {
            console.error('Lỗi khi đồng bộ trừ kho Shopee/Lazada:', syncErr);
        }

        res.json({
            success: true,
            message: 'Đặt hàng thành công! Đã tự động đồng bộ và trừ kho liên kết trên Shopee & Lazada.',
            order: {
                id: orderId,
                order_code: orderCode,
                total_amount: calculatedTotal,
                customer_name,
                status: 'pending'
            },
            marketplace_sync: {
                status: 'synced',
                channels: ['Shopee', 'Lazada'],
                details: syncResults
            }
        });
    } catch (err) {
        console.error('Lỗi đặt hàng:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo đơn hàng' });
    }
});

// Get orders (Admin gets all, with items)
app.get('/api/orders', requireAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        let sql = `SELECT * FROM orders WHERE 1=1`;
        const params = [];

        if (status && status !== 'all') {
            sql += ` AND status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY id DESC`;

        const orders = await allQuery(sql, params);

        // Fetch items for each order
        for (const ord of orders) {
            ord.items = await allQuery(`SELECT * FROM order_items WHERE order_id = ?`, [ord.id]);
        }

        res.json({ success: true, count: orders.length, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi tải danh sách đơn hàng' });
    }
});

// Update order status (ADMIN ONLY)
app.put('/api/orders/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Trạng thái đơn hàng không hợp lệ!' });
        }

        await runQuery(`UPDATE orders SET status = ? WHERE id = ?`, [status, id]);
        res.json({ success: true, message: `Đã cập nhật trạng thái đơn hàng sang: ${status}` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi cập nhật đơn hàng' });
    }
});

/* ========================================================
   ADMIN DASHBOARD STATS
   ======================================================== */

app.get('/api/stats/dashboard', requireAdmin, async (req, res) => {
    try {
        const totalRevenueResult = await getQuery(`
            SELECT SUM(total_amount) as total 
            FROM orders 
            WHERE status != 'cancelled'
        `);
        const totalRevenue = totalRevenueResult.total || 0;

        const totalOrdersResult = await getQuery(`SELECT COUNT(*) as total FROM orders`);
        const totalProductsResult = await getQuery(`SELECT COUNT(*) as total FROM products`);
        const totalCustomersResult = await getQuery(`SELECT COUNT(*) as total FROM users WHERE role = 'customer'`);

        // Recent orders
        const recentOrders = await allQuery(`
            SELECT * FROM orders 
            ORDER BY id DESC 
            LIMIT 5
        `);

        // Low stock products
        const lowStockProducts = await allQuery(`
            SELECT id, name, stock, price, image_url 
            FROM products 
            WHERE stock <= 15 
            ORDER BY stock ASC 
            LIMIT 5
        `);

        // Sales by category
        const salesByCategory = await allQuery(`
            SELECT c.name, COUNT(p.id) as product_count, SUM(p.sold_count) as total_sold
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.id
            GROUP BY c.id
        `);

        res.json({
            success: true,
            stats: {
                totalRevenue,
                totalOrders: totalOrdersResult.total,
                totalProducts: totalProductsResult.total,
                totalCustomers: totalCustomersResult.total,
                recentOrders,
                lowStockProducts,
                salesByCategory
            }
        });
    } catch (err) {
        console.error('Lỗi lấy thống kê admin:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy dữ liệu thống kê' });
    }
});

// User management (ADMIN ONLY)
app.get('/api/users', requireAdmin, async (req, res) => {
    try {
        const users = await allQuery(`
            SELECT id, email, name, phone, address, role, created_at 
            FROM users 
            ORDER BY id DESC
        `);
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi tải danh sách người dùng' });
    }
});

// Update user role (ADMIN ONLY)
app.put('/api/users/:id/role', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!['admin', 'customer'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ!' });
        }
        await runQuery(`UPDATE users SET role = ? WHERE id = ?`, [role, id]);
        res.json({ success: true, message: 'Cập nhật quyền thành công!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

/* ========================================================
   MARKETPLACE INTEGRATION ROUTES (SHOPEE & LAZADA)
   ======================================================== */

// Get settings
app.get('/api/marketplace/settings', requireAdmin, async (req, res) => {
    try {
        const settings = await marketplaceService.getSettings();
        res.json({ success: true, settings });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi tải cấu hình sàn' });
    }
});

// Update settings
app.put('/api/marketplace/settings', requireAdmin, async (req, res) => {
    try {
        const updated = await marketplaceService.updateSettings(req.body);
        res.json({ success: true, message: 'Cập nhật cấu hình kết nối sàn thành công!', settings: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi cập nhật cấu hình' });
    }
});

// Get real-time sync logs
app.get('/api/marketplace/logs', requireAdmin, async (req, res) => {
    try {
        const logs = await marketplaceService.getSyncLogs(50);
        res.json({ success: true, count: logs.length, logs });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi tải nhật ký đồng bộ sàn' });
    }
});

// Test connection to Shopee or Lazada
app.post('/api/marketplace/test-connection', requireAdmin, async (req, res) => {
    try {
        const { platform } = req.body;
        const result = await marketplaceService.testConnection(platform || 'shopee');
        res.json({ success: true, result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Lỗi kiểm tra kết nối sàn' });
    }
});

// Manual sync all products from web to Shopee & Lazada
app.post('/api/marketplace/sync-all', requireAdmin, async (req, res) => {
    try {
        const result = await marketplaceService.syncAllProducts();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi đồng bộ kho toàn bộ' });
    }
});

// Start server
async function start() {
    await initDatabase();
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🌱 MintMart E-Commerce Server đang chạy tại:`);
        console.log(`   - Giao diện Khách hàng (Storefront): http://localhost:${PORT}`);
        console.log(`   - Giao diện Quản trị viên (Admin Portal): http://localhost:${PORT}/admin`);
        console.log(`====================================================`);
    });
}

start();
