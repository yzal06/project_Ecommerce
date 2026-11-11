require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'ecommerce.db');
const db = new sqlite3.Database(dbPath);

// Helper for promises
const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const getQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const allQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// Initialize tables and seed initial data
async function initDatabase() {
    console.log('Khởi tạo cơ sở dữ liệu SQLite...');

    // Users table (Admin & Customers)
    await runQuery(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            role TEXT DEFAULT 'customer',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Categories table
    await runQuery(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            icon TEXT,
            description TEXT
        )
    `);

    // Products table
    await runQuery(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            category_id INTEGER,
            price REAL NOT NULL,
            original_price REAL,
            stock INTEGER DEFAULT 0,
            image_url TEXT,
            badge TEXT,
            rating REAL DEFAULT 5.0,
            sold_count INTEGER DEFAULT 0,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories (id)
        )
    `);

    // Orders table
    await runQuery(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_code TEXT UNIQUE NOT NULL,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            customer_email TEXT,
            shipping_address TEXT NOT NULL,
            payment_method TEXT DEFAULT 'COD',
            total_amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            note TEXT,
            user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Order Items table
    await runQuery(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            product_image TEXT,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            total REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders (id)
        )
    `);

    // Marketplace Sync Logs table (Shopee & Lazada)
    await runQuery(`
        CREATE TABLE IF NOT EXISTS marketplace_sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_code TEXT,
            product_id INTEGER,
            product_name TEXT,
            platform TEXT NOT NULL,
            action TEXT NOT NULL,
            quantity_deducted INTEGER NOT NULL,
            previous_stock INTEGER,
            remaining_stock INTEGER,
            status TEXT NOT NULL DEFAULT 'success',
            response_payload TEXT,
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Marketplace API Settings table
    await runQuery(`
        CREATE TABLE IF NOT EXISTS marketplace_settings (
            id INTEGER PRIMARY KEY,
            shopee_enabled INTEGER DEFAULT 1,
            shopee_partner_id TEXT DEFAULT '2005831',
            shopee_shop_id TEXT DEFAULT '98273615',
            shopee_partner_key TEXT DEFAULT 'shopee_live_partner_key_prod_89a7f3',
            lazada_enabled INTEGER DEFAULT 1,
            lazada_app_key TEXT DEFAULT '109283',
            lazada_app_secret TEXT DEFAULT 'lazada_live_app_secret_d49e8a',
            lazada_seller_id TEXT DEFAULT 'VN_SELLER_88371',
            sync_on_order INTEGER DEFAULT 1
        )
    `);

    // Customer Website Analytics tables (Số lần xem trang & sản phẩm trên web khách hàng)
    await runQuery(`
        CREATE TABLE IF NOT EXISTS web_daily_stats (
            date_key TEXT PRIMARY KEY,
            page_views INTEGER DEFAULT 0,
            product_views INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await runQuery(`
        CREATE TABLE IF NOT EXISTS web_product_stats (
            product_id INTEGER PRIMARY KEY,
            view_count INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Ensure Marketplace Columns exist in products table
    try {
        const prodCols = await allQuery(`PRAGMA table_info(products)`);
        const colNames = prodCols.map(c => c.name);

        if (!colNames.includes('shopee_item_id')) {
            await runQuery(`ALTER TABLE products ADD COLUMN shopee_item_id TEXT`);
        }
        if (!colNames.includes('shopee_stock')) {
            await runQuery(`ALTER TABLE products ADD COLUMN shopee_stock INTEGER DEFAULT 0`);
        }
        if (!colNames.includes('lazada_item_id')) {
            await runQuery(`ALTER TABLE products ADD COLUMN lazada_item_id TEXT`);
        }
        if (!colNames.includes('lazada_stock')) {
            await runQuery(`ALTER TABLE products ADD COLUMN lazada_stock INTEGER DEFAULT 0`);
        }
        if (!colNames.includes('auto_sync_marketplace')) {
            await runQuery(`ALTER TABLE products ADD COLUMN auto_sync_marketplace INTEGER DEFAULT 1`);
        }

        if (!colNames.includes('shopee_sold_count')) {
            await runQuery(`ALTER TABLE products ADD COLUMN shopee_sold_count INTEGER DEFAULT 0`);
        }
        if (!colNames.includes('lazada_sold_count')) {
            await runQuery(`ALTER TABLE products ADD COLUMN lazada_sold_count INTEGER DEFAULT 0`);
        }

        // Check orders table for payment_status
        const orderCols = await allQuery(`PRAGMA table_info(orders)`);
        const orderColNames = orderCols.map(c => c.name);
        if (!orderColNames.includes('payment_status')) {
            await runQuery(`ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'`);
        }

        // Check marketplace_settings for lazada_hidden
        const mktCols = await allQuery(`PRAGMA table_info(marketplace_settings)`);
        const mktColNames = mktCols.map(c => c.name);
        if (!mktColNames.includes('lazada_hidden')) {
            await runQuery(`ALTER TABLE marketplace_settings ADD COLUMN lazada_hidden INTEGER DEFAULT 1`);
        }

        // Ensure lazada_hidden is set to 1 and lazada_enabled is 0 (Tạm ẩn API Lazada theo yêu cầu)
        await runQuery(`UPDATE marketplace_settings SET lazada_enabled = 0, lazada_hidden = 1 WHERE id = 1`);

        // Initialize shopee and lazada stock & sold counts (bắt đầu từ 0)
        await runQuery(`
            UPDATE products 
            SET shopee_item_id = COALESCE(shopee_item_id, 'SHP-' || (10000000 + id * 1234)),
                shopee_stock = CASE WHEN shopee_stock IS NULL OR shopee_stock = 0 THEN stock ELSE shopee_stock END,
                lazada_item_id = COALESCE(lazada_item_id, 'LAZ-' || (20000000 + id * 4321)),
                lazada_stock = CASE WHEN lazada_stock IS NULL OR lazada_stock = 0 THEN stock ELSE lazada_stock END,
                shopee_sold_count = COALESCE(shopee_sold_count, 0),
                lazada_sold_count = COALESCE(lazada_sold_count, 0),
                auto_sync_marketplace = 1
            WHERE shopee_item_id IS NULL OR shopee_stock = 0
        `);
    } catch (migErr) {
        console.error('Lỗi kiểm tra migration marketplace:', migErr);
    }

    // Check if admin user exists, if not seed default users
    const defaultAdminEmail = (process.env.ADMIN_EMAIL || 'admin@mintmart.vn').toLowerCase().trim();
    const defaultAdminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const adminUser = await getQuery(`SELECT * FROM users WHERE role = 'admin' OR email = ?`, [defaultAdminEmail]);
    if (!adminUser) {
        console.log('Tạo tài khoản quản trị viên mặc định...');
        const adminPassHash = await bcrypt.hash(defaultAdminPass, 10);
        await runQuery(
            `INSERT INTO users (email, password, name, phone, address, role) VALUES (?, ?, ?, ?, ?, ?)`,
            [defaultAdminEmail, adminPassHash, 'Quản Trị Viên (Admin)', '0901234567', 'Hà Nội, Việt Nam', 'admin']
        );
    }

    // Check if categories exist, if not seed
    const catCount = await getQuery(`SELECT COUNT(*) as count FROM categories`);
    if (catCount.count === 0) {
        console.log('Tạo danh mục sản phẩm mẫu...');
        const categories = [
            { name: 'Công nghệ & Điện tử', slug: 'cong-nghe-dien-tu', icon: 'fa-laptop', description: 'Điện thoại, laptop, tai nghe và phụ kiện chính hãng' },
            { name: 'Thời trang & Phụ kiện', slug: 'thoi-trang', icon: 'fa-shirt', description: 'Trang phục thời trang nam nữ, túi xách, đồng hồ' },
            { name: 'Nhà cửa & Đời sống', slug: 'nha-cua-doi-song', icon: 'fa-couch', description: 'Nội thất, đèn ngủ, thiết bị gia dụng tiện ích' },
            { name: 'Làm đẹp & Sức khỏe', slug: 'lam-dep-suc-khoe', icon: 'fa-spa', description: 'Mỹ phẩm hữu cơ, kem dưỡng da, nước hoa tự nhiên' },
            { name: 'Đồ gia dụng thông minh', slug: 'do-gia-dung', icon: 'fa-blender', description: 'Nồi chiên không dầu, robot hút bụi, máy xay sinh tố' },
            { name: 'Sách & Văn phòng phẩm', slug: 'sach-van-phong', icon: 'fa-book-open', description: 'Sách kỹ năng, kinh doanh, sổ tay cao cấp' }
        ];

        for (const cat of categories) {
            await runQuery(
                `INSERT INTO categories (name, slug, icon, description) VALUES (?, ?, ?, ?)`,
                [cat.name, cat.slug, cat.icon, cat.description]
            );
        }
    }

    // Check if products exist, if not seed realistic products
    const prodCount = await getQuery(`SELECT COUNT(*) as count FROM products`);
    if (prodCount.count === 0) {
        console.log('Tạo danh sách sản phẩm mẫu chuẩn giao diện sang trọng...');
        const sampleProducts = [
            {
                name: 'Tai nghe Bluetooth Không Dây Mint Sound Pro',
                slug: 'tai-nghe-bluetooth-mint-sound-pro',
                category_id: 1,
                price: 890000,
                original_price: 1290000,
                stock: 45,
                image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
                badge: 'HOT',
                rating: 4.9,
                sold_count: 0,
                description: 'Tai nghe chống ồn chủ động cao cấp, âm bass mạnh mẽ, pin trâu 36 giờ, màu xanh bạc hà thanh lịch.'
            },
            {
                name: 'Đồng Hồ Thông Minh Mint FitTrack V2 Chống Nước',
                slug: 'dong-ho-thong-minh-mint-fittrack-v2',
                category_id: 1,
                price: 1450000,
                original_price: 1950000,
                stock: 30,
                image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
                badge: 'GIẢM 25%',
                rating: 4.8,
                sold_count: 0,
                description: 'Đo nhịp tim, nồng độ oxy SpO2, theo dõi giấc ngủ và 100 chế độ tập luyện. Màn hình AMOLED 1.4 inch sắc nét.'
            },
            {
                name: 'Bàn Phím Cơ Không Dây Mint Matcha Keycaps RGB',
                slug: 'ban-phim-co-khong-day-mint-matcha',
                category_id: 1,
                price: 1250000,
                original_price: 1550000,
                stock: 22,
                image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
                badge: 'BÁN CHẠY',
                rating: 5.0,
                sold_count: 0,
                description: 'Layout 75%, switch gõ êm ái, kết nối 3 chế độ (Bluetooth 5.1 / 2.4GHz / Type-C), pin dùng 4 tuần.'
            },
            {
                name: 'Áo Hoodie Unisex Organic Cotton Màu Xanh Bạc Hà',
                slug: 'ao-hoodie-unisex-mint-organic',
                category_id: 2,
                price: 390000,
                original_price: 520000,
                stock: 60,
                image_url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80',
                badge: 'MỚI',
                rating: 4.7,
                sold_count: 0,
                description: 'Chất liệu nỉ cotton 100% tự nhiên mềm mịn, thoáng mát, form rộng hiện đại chuẩn Hàn Quốc.'
            },
            {
                name: 'Balo Du Lịch Chống Thấm Nước Mint Urban Minimalist',
                slug: 'balo-du-lich-mint-urban',
                category_id: 2,
                price: 480000,
                original_price: 650000,
                stock: 35,
                image_url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80',
                badge: 'GIẢM 26%',
                rating: 4.8,
                sold_count: 0,
                description: 'Chứa vừa laptop 15.6 inch, thiết kế ngăn thông minh, đệm lưng êm ái chống gù lưng, vải Oxford kháng nước.'
            },
            {
                name: 'Đèn Bàn LED Đọc Sách Bảo Vệ Mắt Cảm Ứng Mint Light',
                slug: 'den-ban-led-mint-light',
                category_id: 3,
                price: 320000,
                original_price: 450000,
                stock: 50,
                image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80',
                badge: 'HOT',
                rating: 4.9,
                sold_count: 0,
                description: 'Không ánh sáng xanh gây hại, tùy chỉnh 3 dải màu và 5 cấp độ sáng cảm ứng, tích hợp sạc pin tiện lợi.'
            },
            {
                name: 'Bình Giữ Nhiệt Inox 316 Cao Cấp 800ml Màu Mint',
                slug: 'binh-giu-nhiet-inox-mint-800ml',
                category_id: 3,
                price: 245000,
                original_price: 350000,
                stock: 80,
                image_url: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80',
                badge: 'BEST SELLER',
                rating: 4.9,
                sold_count: 0,
                description: 'Giữ nóng 12 tiếng, giữ lạnh 24 tiếng. Lõi Inox 316 y tế an toàn cho sức khỏe, có quai xách thể thao.'
            },
            {
                name: 'Bộ Serum Tinh Chất Trà Xanh & Rau Má Làm Dịu Da Mint Herbal',
                slug: 'bo-serum-tra-xanh-rau-ma-mint-herbal',
                category_id: 4,
                price: 380000,
                original_price: 490000,
                stock: 40,
                image_url: 'https://images.unsplash.com/photo-1608248597359-2e0618012678?w=800&auto=format&fit=crop&q=80',
                badge: 'THIÊN NHIÊN',
                rating: 4.8,
                sold_count: 0,
                description: 'Chiết xuất 100% thảo mộc organic xanh mát, kiểm soát dầu thừa, se khít lỗ chân lông và phục hồi da nhạy cảm.'
            },
            {
                name: 'Nồi Chiên Không Dầu Điện Tử 6.5L Mint AirFryer Master',
                slug: 'noi-chien-khong-dau-mint-airfryer-6-5l',
                category_id: 5,
                price: 1690000,
                original_price: 2200000,
                stock: 15,
                image_url: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=800&auto=format&fit=crop&q=80',
                badge: 'GIẢM 23%',
                rating: 4.9,
                sold_count: 0,
                description: 'Công nghệ đốt nhiệt Rapid Air tuần hoàn 360 độ, giảm 85% chất béo, mặt kính quan sát tiện lợi.'
            },
            {
                name: 'Máy Xay Sinh Tố Cầm Tay Mini Tiện Dụng Mint Blend',
                slug: 'may-xay-sinh-to-cam-tay-mint-blend',
                category_id: 5,
                price: 295000,
                original_price: 420000,
                stock: 65,
                image_url: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=800&auto=format&fit=crop&q=80',
                badge: 'HOT',
                rating: 4.6,
                sold_count: 0,
                description: 'Lưỡi dao thép 6 cánh sắc bén, sạc qua cổng Type-C, nhỏ gọn mang đi làm hoặc tập gym mọi lúc mọi nơi.'
            },
            {
                name: 'Sổ Tay Bìa Da Khắc Laser Màu Xanh Bạc Hà Mint Journal',
                slug: 'so-tay-bia-da-mint-journal',
                category_id: 6,
                price: 135000,
                original_price: 180000,
                stock: 100,
                image_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',
                badge: 'MỚI',
                rating: 4.9,
                sold_count: 0,
                description: 'Giấy ford định lượng 100gsm chống thấm mực cao cấp, bìa da PU chống nước, ruy băng đánh dấu trang.'
            },
            {
                name: 'Loa Bluetooth Kháng Nước Mini Mint BassGo',
                slug: 'loa-bluetooth-mint-bassgo',
                category_id: 1,
                price: 520000,
                original_price: 690000,
                stock: 28,
                image_url: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80',
                badge: 'HOT',
                rating: 4.8,
                sold_count: 0,
                description: 'Âm thanh 360 độ sống động, chống nước chuẩn IPX7, pin nghe nhạc liên tục 15 giờ.'
            }
        ];

        for (const p of sampleProducts) {
            await runQuery(
                `INSERT INTO products (name, slug, category_id, price, original_price, stock, image_url, badge, rating, sold_count, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [p.name, p.slug, p.category_id, p.price, p.original_price, p.stock, p.image_url, p.badge, p.rating, p.sold_count, p.description]
            );
        }
    }

    console.log('Khởi tạo cơ sở dữ liệu thành công!');
}

module.exports = {
    db,
    runQuery,
    getQuery,
    allQuery,
    initDatabase
};
