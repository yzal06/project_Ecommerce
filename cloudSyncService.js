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

        const dailyRows = await allQuery(`SELECT date_key, page_views, product_views FROM web_daily_stats`).catch(() => []);
        const prodViewRows = await allQuery(`SELECT product_id, view_count FROM web_product_stats`).catch(() => []);
        const localOrders = await allQuery(`SELECT * FROM orders ORDER BY id DESC LIMIT 200`).catch(() => []);
        for (const o of localOrders) {
            o.items = await allQuery(`SELECT * FROM order_items WHERE order_id = ?`, [o.id]).catch(() => []);
        }

        const daily = {};
        dailyRows.forEach(r => {
            daily[r.date_key] = {
                page_views: Number(r.page_views) || 0,
                product_views: Number(r.product_views) || 0
            };
        });
        const productViews = {};
        prodViewRows.forEach(r => {
            productViews[String(r.product_id)] = Number(r.view_count) || 0;
        });

        // Lọc bỏ các sản phẩm nằm trong danh sách đã xóa vĩnh viễn
        const cleanProducts = products.filter(p => !this.deletedProductIds.includes(Number(p.id)));

        return {
            updated_at: new Date().toISOString(),
            version: 4,
            source: 'MintMart Backend Live Cloud Sync (Node.js Express)',
            deleted_product_ids: this.deletedProductIds,
            total_products: cleanProducts.length,
            total_categories: categories.length,
            products: cleanProducts,
            categories: categories,
            orders: localOrders,
            web_analytics: {
                daily,
                product_views: productViews,
                updated_at: new Date().toISOString()
            }
        };
    }

    /**
     * Đẩy toàn bộ dữ liệu hiện tại lên Cloud Storage (kèm bảo toàn lượt xem & đơn hàng trên Cloud)
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

            // Lấy snapshot hiện có trên Cloud để tránh ghi đè lượt xem web hoặc đơn hàng phát sinh từ trình duyệt khác
            try {
                const getController = new AbortController();
                const getTimer = setTimeout(() => getController.abort(), 5000);
                const existingRes = await fetch(url, {
                    method: 'GET',
                    cache: 'no-cache',
                    headers: { 'Accept': 'application/json' },
                    signal: getController.signal
                });
                clearTimeout(getTimer);
                if (existingRes.ok) {
                    const cloudData = await existingRes.json();
                    if (cloudData && typeof cloudData === 'object') {
                        if (Array.isArray(cloudData.orders)) {
                            const orderMap = new Map();
                            [...cloudData.orders, ...(snapshot.orders || [])].forEach(o => {
                                if (!o || !o.order_code) return;
                                if (['MM-98214', 'MM-98215', 'MM-98216'].includes(o.order_code)) return;
                                orderMap.set(o.order_code, o);
                            });
                            snapshot.orders = Array.from(orderMap.values());
                        }
                        if (cloudData.web_analytics && typeof cloudData.web_analytics === 'object') {
                            const cDaily = cloudData.web_analytics.daily || {};
                            const lDaily = snapshot.web_analytics.daily || {};
                            const mergedDaily = { ...cDaily };
                            Object.keys(lDaily).forEach(dk => {
                                const prev = mergedDaily[dk] || { page_views: 0, product_views: 0 };
                                mergedDaily[dk] = {
                                    page_views: Math.max(Number(prev.page_views) || 0, Number(lDaily[dk].page_views) || 0),
                                    product_views: Math.max(Number(prev.product_views) || 0, Number(lDaily[dk].product_views) || 0)
                                };
                            });
                            const cProd = cloudData.web_analytics.product_views || {};
                            const lProd = snapshot.web_analytics.product_views || {};
                            const mergedProd = { ...cProd };
                            Object.keys(lProd).forEach(pid => {
                                mergedProd[pid] = Math.max(Number(mergedProd[pid]) || 0, Number(lProd[pid]) || 0);
                            });
                            snapshot.web_analytics = {
                                daily: mergedDaily,
                                product_views: mergedProd,
                                updated_at: new Date().toISOString()
                            };
                        }
                    }
                }
            } catch (e) {}

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
