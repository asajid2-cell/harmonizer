/**
 * SONIC ARCHITECT MK.III
 * Storage - LocalStorage & IndexedDB Wrapper
 */

const DB_NAME = 'SonicArchitectDB';
const DB_VERSION = 1;
const STORES = {
    PLAYLISTS: 'playlists',
    PRESETS: 'presets',
    SETTINGS: 'settings',
    AUDIO_CACHE: 'audioCache'
};

class Storage {
    constructor() {
        this.db = null;
        this.isReady = false;
        this.readyPromise = this.initIndexedDB();
    }

    /**
     * Initialize IndexedDB
     */
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('IndexedDB not supported, using localStorage only');
                this.isReady = true;
                resolve();
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                this.isReady = true;
                resolve(); // Still resolve, fall back to localStorage
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores
                if (!db.objectStoreNames.contains(STORES.PLAYLISTS)) {
                    db.createObjectStore(STORES.PLAYLISTS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORES.PRESETS)) {
                    db.createObjectStore(STORES.PRESETS, { keyPath: 'name' });
                }
                if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORES.AUDIO_CACHE)) {
                    const store = db.createObjectStore(STORES.AUDIO_CACHE, { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    /**
     * Wait for storage to be ready
     */
    async ready() {
        return this.readyPromise;
    }

    // ==========================================
    // LocalStorage Methods
    // ==========================================

    /**
     * Get item from localStorage
     */
    getLocal(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage getLocal error:', error);
            return defaultValue;
        }
    }

    /**
     * Set item in localStorage
     */
    setLocal(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage setLocal error:', error);
            return false;
        }
    }

    /**
     * Remove item from localStorage
     */
    removeLocal(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage removeLocal error:', error);
            return false;
        }
    }

    // ==========================================
    // IndexedDB Methods
    // ==========================================

    /**
     * Get item from IndexedDB
     */
    async get(storeName, key) {
        await this.ready();
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all items from IndexedDB store
     */
    async getAll(storeName) {
        await this.ready();
        if (!this.db) return [];

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Set item in IndexedDB
     */
    async set(storeName, value) {
        await this.ready();
        if (!this.db) return false;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(value);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete item from IndexedDB
     */
    async delete(storeName, key) {
        await this.ready();
        if (!this.db) return false;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear entire store
     */
    async clear(storeName) {
        await this.ready();
        if (!this.db) return false;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ==========================================
    // Settings Convenience Methods
    // ==========================================

    async getSetting(key, defaultValue = null) {
        const result = await this.get(STORES.SETTINGS, key);
        return result ? result.value : defaultValue;
    }

    async setSetting(key, value) {
        return this.set(STORES.SETTINGS, { key, value });
    }

    // ==========================================
    // Playlist Convenience Methods
    // ==========================================

    async getPlaylists() {
        return this.getAll(STORES.PLAYLISTS);
    }

    async savePlaylist(playlist) {
        return this.set(STORES.PLAYLISTS, {
            id: playlist.id || Date.now().toString(),
            ...playlist,
            updatedAt: Date.now()
        });
    }

    async deletePlaylist(id) {
        return this.delete(STORES.PLAYLISTS, id);
    }

    // ==========================================
    // Preset Convenience Methods
    // ==========================================

    async getPresets() {
        return this.getAll(STORES.PRESETS);
    }

    async savePreset(preset) {
        return this.set(STORES.PRESETS, {
            ...preset,
            updatedAt: Date.now()
        });
    }

    async deletePreset(name) {
        return this.delete(STORES.PRESETS, name);
    }

    // ==========================================
    // Audio Cache Methods
    // ==========================================

    async cacheAudio(id, audioData) {
        return this.set(STORES.AUDIO_CACHE, {
            id,
            data: audioData,
            timestamp: Date.now()
        });
    }

    async getCachedAudio(id) {
        const result = await this.get(STORES.AUDIO_CACHE, id);
        return result ? result.data : null;
    }

    /**
     * Clean old cached audio (older than maxAge in ms)
     */
    async cleanAudioCache(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
        await this.ready();
        if (!this.db) return;

        const cutoff = Date.now() - maxAge;
        const transaction = this.db.transaction(STORES.AUDIO_CACHE, 'readwrite');
        const store = transaction.objectStore(STORES.AUDIO_CACHE);
        const index = store.index('timestamp');
        const range = IDBKeyRange.upperBound(cutoff);

        index.openCursor(range).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                store.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
    }
}

// Export singleton instance
export const storage = new Storage();
export { STORES };
export default storage;
