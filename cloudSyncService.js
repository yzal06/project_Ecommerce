/**
 * MintMart - Cloud Synchronization Service
 * Đảm bảo mọi thay đổi (thêm mới, chỉnh sửa, xóa sản phẩm, danh mục)
 * đều được tự động lưu bền vững lên Đám Mây (Cloud Storage) đa thiết bị.
 */

const { allQuery, runQuery } = require('./database');

const DEFAULT_CLOUD_URL = process.env.CLOUD_STORAGE_URL || 'https://api.npoint.io/5d9be062d0b238760026';
const CLOUD_SYNC_ENABLED = process.env.CLOUD_SYNC_ENABLED !== '0';

class CloudSyncService {
    constructor() {
        this.cloudUrl = DEFAULT_CLOUD_URL;
        this.isEnabled = CLOUD_SYNC_ENABLED;
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.deletedProductIds = [13, 14];
    }

    getCloudUrl() {
        return process.env.CLOUD_STORAGE_URL || this.cloudUrl || DEFAULT_CLOUD_URL;
    }

    /**
     * Lấy toàn bộ dữ liệu hiện tại từ SQLite để chuẩn bị snapshot đẩy lên Cloud
     */
    async getLocalSnapshot() {
        const products = await allQuery(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.id ASC
        `);

        const categories = await allQuery(`
            SELECT c.*, COUNT(p.id) as product_count 
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
            GROUP BY c.id
            ORDER BY c.id ASC
        `);

        // Lọc bỏ các sản phẩm nằm trong danh sách đã xóa vĩnh viễn
        const cleanProducts = products.filter(p => !this.deletedProductIds.includes(Number(p.id)));

        return {
            updated_at: new Date().toISOString(),
            version: 3,
            source: 'MintMart Backend Live Cloud Sync (Node.js Express)',
            deleted_product_ids: this.deletedProductIds,
            total_products: cleanProducts.length,
            total_categories: categories.length,
            products: cleanProducts,
            categories: categories
        };
    }

    /**
     * Đẩy toàn bộ dữ liệu hiện tại lên Cloud Storage
     */
    async pushToCloud() {
        if (!this.isEnabled) {
            console.log('[Cloud Sync] Đồng bộ đám mây đang tạm tắt qua CLOUD_SYNC_ENABLED=0');
            return { success: false, message: 'Cloud sync is disabled' };
        }

        if (this.isSyncing) {
            console.log('[Cloud Sync] Đang có tiến trình đồng bộ khác chạy, bỏ qua lần này');
            return { success: false, message: 'Sync already in progress' };
        }

        this.isSyncing = true;
        try {
            const url = this.getCloudUrl();
            const snapshot = await this.getLocalSnapshot();

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(snapshot),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                console.warn(`[Cloud Sync] Máy chủ Cloud báo lỗi HTTP: ${res.status}`);
                return { success: false, status: res.status, message: `Cloud server returned HTTP ${res.status}` };
            }

            this.lastSyncTime = snapshot.updated_at;
            console.log(`☁️ [Cloud Sync] ĐÃ LƯU LÊN CLOUD THÀNH CÔNG! (${snapshot.products.length} sản phẩm, lúc ${this.lastSyncTime})`);
            return {
                success: true,
                message: 'Đã lưu và đồng bộ lên Đám Mây thành công!',
                timestamp: this.lastSyncTime,
                total_products: snapshot.products.length
            };
        } catch (err) {
            console.error('[Cloud Sync] Lỗi khi đẩy dữ liệu lên Cloud:', err.message);
            return { success: false, error: err.message };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Kéo dữ liệu từ Cloud về nạp vào SQLite (nếu cần khôi phục)
     */
    async pullFromCloud(force = false) {
        try {
            const url = this.getCloudUrl();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const res = await fetch(url, {
                method: 'GET',
                cache: 'no-cache',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                return { success: false, message: `Không thể đọc dữ liệu từ Cloud (HTTP ${res.status})` };
            }

            const data = await res.json();
            if (!data || !Array.isArray(data.products)) {
                return { success: false, message: 'Dữ liệu trên Cloud không đúng định dạng sản phẩm' };
            }

            if (Array.isArray(data.deleted_product_ids)) {
                data.deleted_product_ids.forEach(id => {
                    if (!this.deletedProductIds.includes(Number(id))) {
                        this.deletedProductIds.push(Number(id));
                    }
                });
            }

            return {
                success: true,
                message: `Đã tải ${data.products.length} sản phẩm từ Cloud`,
                data
            };
        } catch (err) {
            console.error('[Cloud Sync] Lỗi khi tải dữ liệu từ Cloud:', err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Ghi nhận ID sản phẩm đã xóa để đồng bộ xóa vĩnh viễn trên Cloud
     */
    recordDeletedProduct(productId) {
        const numId = Number(productId);
        if (!this.deletedProductIds.includes(numId)) {
            this.deletedProductIds.push(numId);
        }
        // Tự động đẩy xóa lên Cloud ngay
        this.pushToCloud().catch(() => {});
    }

    /**
     * Trạng thái kết nối Cloud
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            cloudUrl: this.getCloudUrl(),
            lastSyncTime: this.lastSyncTime,
            isSyncing: this.isSyncing,
            deletedCount: this.deletedProductIds.length
        };
    }
}

const cloudSyncService = new CloudSyncService();
module.exports = cloudSyncService;
