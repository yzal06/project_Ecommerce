require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { runQuery, getQuery, allQuery, initDatabase } = require('./database');
const marketplaceService = require('./marketplaceService');
const cloudSyncService = require('./cloudSyncService');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mintmart-secret-key-2026-safe-e-commerce';

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
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check API
app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'online', service: 'MintMart E-Commerce API', timestamp: new Date().toISOString() });
});

// Specific friendly routes for clean URLs (prioritized before static handler)
app.get('/admin', (req, res) => {
    res.status(404).send('404 Not Found - Cổng Quản Trị đã được cô lập trên branch admin riêng biệt.');
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

// Serve static directories (Supports both root and public/ directory structure)
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

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

// Change Admin / User credentials (Email, Name, Password)
app.put('/api/auth/change-credentials', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newEmail, newPassword, newName, phone, address } = req.body;
        const user = await getQuery(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng!' });
        }

        // If current password provided, verify it (unless mock token)
        if (currentPassword && user.password) {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác!' });
            }
        }

        let updatedEmail = user.email;
        if (newEmail && newEmail.toLowerCase().trim() !== user.email) {
            const checkEmail = newEmail.toLowerCase().trim();
            const existing = await getQuery(`SELECT id FROM users WHERE email = ? AND id != ?`, [checkEmail, user.id]);
            if (existing) {
                return res.status(400).json({ success: false, message: 'Email này đã được tài khoản khác sử dụng!' });
            }
            updatedEmail = checkEmail;
        }

        let updatedName = (newName && newName.trim()) ? newName.trim() : user.name;
        let updatedPhone = phone !== undefined ? phone : (user.phone || '');
        let updatedAddress = address !== undefined ? address : (user.address || '');

        let updatedPassHash = user.password;
        if (newPassword && newPassword.trim()) {
            if (newPassword.trim().length < 6) {
                return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có tối thiểu 6 ký tự!' });
            }
            updatedPassHash = await bcrypt.hash(newPassword.trim(), 10);
        }

        await runQuery(
            `UPDATE users SET email = ?, password = ?, name = ?, phone = ?, address = ? WHERE id = ?`,
            [updatedEmail, updatedPassHash, updatedName, updatedPhone, updatedAddress, user.id]
        );

        // Generate new JWT Token with updated credentials
        const token = jwt.sign(
            { id: user.id, email: updatedEmail, role: user.role, name: updatedName },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Cập nhật tài khoản và mật khẩu thành công!',
            token,
            user: {
                id: user.id,
                email: updatedEmail,
                name: updatedName,
                role: user.role,
                phone: updatedPhone,
                address: updatedAddress
            }
        });
    } catch (err) {
        console.error('Lỗi cập nhật thông tin tài khoản:', err);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật tài khoản!' });
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

        // Đồng bộ lên Đám Mây
        cloudSyncService.pushToCloud().catch(err => console.error('Lỗi tự động đẩy Cloud khi tạo danh mục:', err.message));

        res.json({ success: true, message: 'Tạo danh mục mới thành công!', categoryId: result.lastID });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi server khi tạo danh mục' });
    }
});

// Delete Category (ADMIN ONLY - Synchronized with customer storefront)
app.delete('/api/categories/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const cat = await getQuery(`SELECT * FROM categories WHERE id = ?`, [id]);
        if (!cat) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy danh mục cần xóa' });
        }

        // Unlink products in this category before deleting
        await runQuery(`UPDATE products SET category_id = NULL WHERE category_id = ?`, [id]);

        // Delete the category
        await runQuery(`DELETE FROM categories WHERE id = ?`, [id]);

        // Đồng bộ lên Đám Mây
        cloudSyncService.pushToCloud().catch(err => console.error('Lỗi tự động đẩy Cloud khi xóa danh mục:', err.message));

        res.json({
            success: true,
            message: `Đã xóa danh mục "${cat.name}" thành công! Các sản phẩm thuộc danh mục đã được chuyển sang danh mục mặc định và đồng bộ tức thì với trang web khách hàng.`
        });
    } catch (err) {
        console.error('Lỗi xóa danh mục:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi xóa danh mục' });
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

        // TỰ ĐỘNG ĐẨY MẶT HÀNG MỚI LÊN ĐÁM MÂY (CLOUD STORAGE)
        cloudSyncService.pushToCloud().catch(cloudErr => {
            console.error('Lỗi tự động đẩy Cloud khi thêm sản phẩm:', cloudErr.message);
        });

        res.json({
            success: true,
            message: 'Thêm mặt hàng mới thành công (Đã lưu cơ sở dữ liệu & Đồng bộ lên Đám Mây)!',
            product: newProduct,
            cloud_synced: true
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

        // TỰ ĐỘNG ĐỒNG BỘ CẬP NHẬT LÊN ĐÁM MÂY
        cloudSyncService.pushToCloud().catch(cloudErr => {
            console.error('Lỗi tự động đẩy Cloud khi sửa sản phẩm:', cloudErr.message);
        });

        res.json({
            success: true,
            message: 'Cập nhật sản phẩm & kho Shopee/Lazada thành công (Đã đồng bộ Đám Mây)!',
            product: updated,
            cloud_synced: true
        });
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

        // TỰ ĐỘNG ĐỒNG BỘ TRẠNG THÁI MỞ BÁN / GỠ BÁN LÊN ĐÁM MÂY
        cloudSyncService.pushToCloud().catch(cloudErr => {
            console.error('Lỗi tự động đẩy Cloud khi đổi trạng thái sản phẩm:', cloudErr.message);
        });

        const actionText = newStatus === 1 ? 'Đã đăng mở bán lại trên website (Đã đồng bộ Đám Mây)!' : 'Đã gỡ sản phẩm khỏi website bán hàng (Đã đồng bộ Đám Mây)!';
        res.json({
            success: true,
            is_active: newStatus,
            message: `${actionText} ("${existing.name}")`,
            cloud_synced: true
        });
    } catch (err) {
        console.error('Lỗi khi gỡ/mở bán sản phẩm:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật trạng thái sản phẩm' });
    }
});

// Delete product (ADMIN ONLY - Vĩnh viễn & Xóa trên Đám Mây)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await runQuery(`DELETE FROM products WHERE id = ?`, [id]);

        // Ghi nhận ID đã xóa và đồng bộ xóa vĩnh viễn trên Đám Mây
        cloudSyncService.recordDeletedProduct(id);

        res.json({
            success: true,
            message: 'Đã xóa sản phẩm thành công và đồng bộ xóa vĩnh viễn trên Đám Mây!',
            cloud_synced: true
        });
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

        // 1. Kiểm tra danh sách sản phẩm
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Giỏ hàng của bạn đang trống! Vui lòng chọn ít nhất một sản phẩm.' });
        }

        // 2. Ràng buộc Họ và tên người nhận
        const trimmedName = (customer_name || '').trim();
        if (!trimmedName || trimmedName.length < 2) {
            return res.status(400).json({ success: false, message: 'Họ và tên người nhận hàng không hợp lệ (tối thiểu 2 ký tự)!' });
        }
        if (!/[a-zA-ZàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệđìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆĐÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]/i.test(trimmedName)) {
            return res.status(400).json({ success: false, message: 'Họ và tên người nhận không hợp lệ (phải chứa chữ cái)!' });
        }

        // 3. Ràng buộc Số điện thoại (Chuẩn nhà mạng di động Việt Nam)
        const rawPhone = (customer_phone || '').trim();
        let cleanPhone = rawPhone.replace(/[\s\.\-\(\)]/g, '');
        if (cleanPhone.startsWith('+84')) {
            cleanPhone = '0' + cleanPhone.slice(3);
        } else if (cleanPhone.startsWith('84') && cleanPhone.length === 11) {
            cleanPhone = '0' + cleanPhone.slice(2);
        }

        const vnPhoneRegex = /^0[35789]\d{8}$/;
        const isRepeatedDigits = /^0([0-9])\1{8}$/.test(cleanPhone);
        if (!cleanPhone || !vnPhoneRegex.test(cleanPhone) || isRepeatedDigits || cleanPhone === '0900000000') {
            return res.status(400).json({
                success: false,
                message: 'Số điện thoại nhận hàng không hợp lệ! Vui lòng nhập số di động Việt Nam gồm 10 chữ số (Đầu số: 03, 05, 07, 08, 09. Ví dụ: 0912345678).'
            });
        }

        // 4. Ràng buộc Gmail / Email nhận thông báo đơn hàng
        const cleanEmail = (customer_email || '').trim().toLowerCase();
        if (!cleanEmail) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp địa chỉ Gmail/Email để nhận thông tin đơn hàng và hóa đơn thanh toán!'
            });
        }
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Địa chỉ Gmail/Email không đúng định dạng! Vui lòng nhập email hợp lệ (Ví dụ: khachhang@gmail.com).'
            });
        }

        // 5. Ràng buộc Địa chỉ nhận hàng chi tiết
        const cleanAddress = (shipping_address || '').trim();
        if (!cleanAddress || cleanAddress.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Địa chỉ giao hàng quá ngắn (tối thiểu 10 ký tự)! Vui lòng ghi chi tiết: Số nhà, ngõ/đường, phường/xã, quận/huyện, tỉnh/thành phố để shipper giao hàng tận nơi.'
            });
        }
        if (cleanAddress.length > 300) {
            return res.status(400).json({
                success: false,
                message: 'Địa chỉ giao hàng không được vượt quá 300 ký tự!'
            });
        }
        const addressWords = cleanAddress.split(/\s+/).filter(w => w.length > 0);
        if (addressWords.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Địa chỉ nhận hàng chưa rõ ràng! Vui lòng cung cấp tối thiểu 3 thành phần (Số nhà/đường, phường/xã, quận/huyện, tỉnh/thành phố).'
            });
        }
        const hasAddressLetters = /[a-zA-ZàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệđìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆĐÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]/i.test(cleanAddress);
        if (!hasAddressLetters) {
            return res.status(400).json({
                success: false,
                message: 'Địa chỉ giao hàng không hợp lệ (không chứa tên đường, địa danh có chữ cái)!'
            });
        }
        if (/(.)\1{5,}/.test(cleanAddress)) {
            return res.status(400).json({
                success: false,
                message: 'Địa chỉ giao hàng chứa chuỗi ký tự lặp vô nghĩa! Vui lòng nhập địa chỉ thực tế.'
            });
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
        const payment_status = req.body.payment_status || (payment_method === 'COD' ? 'pending' : 'paid');

        const orderResult = await runQuery(`
            INSERT INTO orders 
            (order_code, customer_name, customer_phone, customer_email, shipping_address, payment_method, total_amount, note, user_id, status, payment_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `, [
            orderCode,
            trimmedName,
            cleanPhone,
            cleanEmail,
            cleanAddress,
            payment_method || 'COD',
            calculatedTotal,
            note || '',
            user_id || null,
            payment_status
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
                customer_name: trimmedName,
                customer_phone: cleanPhone,
                customer_email: cleanEmail,
                shipping_address: cleanAddress,
                status: 'pending',
                payment_method: payment_method || 'COD',
                payment_status
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

// Update order payment status (Customer payment confirmation & Admin management)
app.put('/api/orders/:id/payment', async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_status } = req.body;

        if (!['pending', 'paid'].includes(payment_status)) {
            return res.status(400).json({ success: false, message: 'Trạng thái thanh toán không hợp lệ!' });
        }

        await runQuery(`UPDATE orders SET payment_status = ? WHERE id = ?`, [payment_status, id]);
        res.json({ success: true, message: `Đã cập nhật trạng thái thanh toán sang: ${payment_status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái thanh toán' });
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

        // 7-day marketplace revenue separated for Shopee & Lazada
        const marketplace7Days = await marketplaceService.get7DayMarketplaceRevenue();

        res.json({
            success: true,
            stats: {
                totalRevenue,
                totalOrders: totalOrdersResult.total,
                totalProducts: totalProductsResult.total,
                totalCustomers: totalCustomersResult.total,
                recentOrders,
                lowStockProducts,
                salesByCategory,
                marketplace7Days
            }
        });
    } catch (err) {
        console.error('Lỗi lấy thống kê admin:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy dữ liệu thống kê' });
    }
});

// BÁO CÁO DOANH THU 7 NGÀY GẦN NHẤT PHÂN TÁCH 2 SÀN SHOPEE & LAZADA
app.get('/api/marketplace/revenue-7days', requireAdmin, async (req, res) => {
    try {
        const report = await marketplaceService.get7DayMarketplaceRevenue();
        res.json(report);
    } catch (err) {
        console.error('Lỗi lấy báo cáo doanh thu 7 ngày 2 sàn:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy báo cáo doanh thu 7 ngày' });
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

// BÁO CÁO DOANH THU 2 SÀN SHOPEE & LAZADA (TÁCH 2 BẢNG RIÊNG BIỆT LIÊN KẾT ĐẶT HÀNG)
app.get('/api/marketplace/revenue-report', requireAdmin, async (req, res) => {
    try {
        const report = await marketplaceService.getMarketplaceRevenueReport();
        res.json(report);
    } catch (err) {
        console.error('Lỗi lấy báo cáo doanh thu 2 sàn:', err);
        res.status(500).json({ success: false, message: 'Lỗi server khi lấy báo cáo doanh thu 2 sàn' });
    }
});

// TẠM ẨN / MỞ LẠI API LAZADA THEO YÊU CẦU QUẢN TRỊ VIÊN
app.patch('/api/marketplace/lazada/toggle-hide', requireAdmin, async (req, res) => {
    try {
        const settings = await marketplaceService.getSettings();
        const newHidden = settings.lazada_hidden ? 0 : 1;
        await marketplaceService.updateSettings({
            ...settings,
            lazada_hidden: newHidden,
            lazada_enabled: newHidden ? 0 : 1
        });
        res.json({
            success: true,
            lazada_hidden: newHidden,
            message: newHidden ? 'Đã tạm ẩn API Lazada theo yêu cầu quản trị viên!' : 'Đã mở lại kết nối API Lazada!'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi khi cập nhật trạng thái tạm ẩn API Lazada' });
    }
});

/* ========================================================
   CLOUD SYNC & BACKUP ROUTES (ĐỒNG BỘ ĐÁM MÂY ĐA THIẾT BỊ)
   ======================================================== */

// Lấy trạng thái đồng bộ Cloud
app.get('/api/cloud-sync/status', (req, res) => {
    try {
        res.json({ success: true, ...cloudSyncService.getStatus() });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi lấy trạng thái đám mây' });
    }
});

// Kích hoạt đồng bộ đẩy toàn bộ dữ liệu SQLite lên Cloud (Admin)
app.post('/api/cloud-sync/push', requireAdmin, async (req, res) => {
    try {
        const result = await cloudSyncService.pushToCloud();
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi khi đẩy dữ liệu lên Cloud: ' + err.message });
    }
});

// Tải dữ liệu từ Cloud về nạp vào hệ thống (Admin)
app.post('/api/cloud-sync/pull', requireAdmin, async (req, res) => {
    try {
        const result = await cloudSyncService.pullFromCloud(true);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi khi kéo dữ liệu từ Cloud: ' + err.message });
    }
});

// Start server
async function start() {
    await initDatabase();

    // Tự động đẩy snapshot dữ liệu hiện tại lên Đám Mây khi server khởi động
    cloudSyncService.pushToCloud().catch(err => {
        console.warn('⚠️ [Cloud Sync] Chưa thể đồng bộ đám mây ngay lúc khởi động:', err.message);
    });

    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🌱 MintMart E-Commerce Server đang chạy tại:`);
        console.log(`   - Giao diện Khách hàng (Storefront): http://localhost:${PORT}`);
        console.log(`   - Giao diện Quản trị viên (Admin Portal): http://localhost:${PORT}/admin`);
        console.log(`   - Đồng bộ Đám Mây (Cloud Sync): Đang kích hoạt (Tự động lưu lên Cloud khi thêm mới)`);
        console.log(`====================================================`);
    });
}

start();
