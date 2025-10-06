/**
 * EdgeOne客户端数据库存储方案
 * 使用IndexedDB作为主要存储，localStorage作为备用
 * 专为边缘部署平台设计，所有数据存储在浏览器客户端
 */

import type { BookSource } from "./types";

// 数据库配置
const DB_NAME = "DogEngineDB";
const DB_VERSION = 1;
const STORES = {
	BOOK_SOURCES: "bookSources",
	AI_CONFIG: "aiConfig",
	USER_SETTINGS: "userSettings",
	BOOK_DATA: "bookData",
	READING_PROGRESS: "readingProgress",
} as const;

// localStorage备用键名
const FALLBACK_KEYS = {
	BOOK_SOURCES: "dog-engine-book-sources",
	AI_CONFIG: "dog-engine-ai-config",
	USER_SETTINGS: "dog-engine-user-settings",
	BOOK_DATA: "dog-engine-book-data",
	READING_PROGRESS: "dog-engine-reading-progress",
} as const;

/**
 * 数据库连接管理
 */
class ClientDatabase {
	private db: IDBDatabase | null = null;
	private dbPromise: Promise<IDBDatabase> | null = null;

	/**
	 * 初始化数据库连接
	 */
	private async initDB(): Promise<IDBDatabase> {
		if (this.db) return this.db;

		if (this.dbPromise) return this.dbPromise;

		this.dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => {
				console.error("[ClientDB] 数据库打开失败:", request.error);
				reject(request.error);
			};

			request.onsuccess = () => {
				this.db = request.result;
				console.log("[ClientDB] 数据库连接成功");
				resolve(this.db);
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				console.log(
					"[ClientDB] 数据库升级，版本:",
					event.oldVersion,
					"->",
					event.newVersion,
				);

				// 创建书源存储
				if (!db.objectStoreNames.contains(STORES.BOOK_SOURCES)) {
					const bookSourceStore = db.createObjectStore(STORES.BOOK_SOURCES, {
						keyPath: "id",
					});
					bookSourceStore.createIndex("name", "name", { unique: false });
					bookSourceStore.createIndex("enabled", "enabled", { unique: false });
					bookSourceStore.createIndex("group", "group", { unique: false });
				}

				// 创建AI配置存储
				if (!db.objectStoreNames.contains(STORES.AI_CONFIG)) {
					db.createObjectStore(STORES.AI_CONFIG, { keyPath: "id" });
				}

				// 创建用户设置存储
				if (!db.objectStoreNames.contains(STORES.USER_SETTINGS)) {
					db.createObjectStore(STORES.USER_SETTINGS, { keyPath: "key" });
				}

				// 创建书籍数据存储
				if (!db.objectStoreNames.contains(STORES.BOOK_DATA)) {
					const bookDataStore = db.createObjectStore(STORES.BOOK_DATA, {
						keyPath: "id",
					});
					bookDataStore.createIndex("bookId", "bookId", { unique: false });
					bookDataStore.createIndex("lastUpdated", "lastUpdated", {
						unique: false,
					});
				}

				// 创建阅读进度存储
				if (!db.objectStoreNames.contains(STORES.READING_PROGRESS)) {
					const progressStore = db.createObjectStore(STORES.READING_PROGRESS, {
						keyPath: "bookId",
					});
					progressStore.createIndex("lastRead", "lastRead", { unique: false });
				}
			};
		});

		return this.dbPromise;
	}

	/**
	 * 检查IndexedDB支持
	 */
	private isIndexedDBSupported(): boolean {
		return (
			typeof window !== "undefined" &&
			"indexedDB" in window &&
			indexedDB !== null
		);
	}

	/**
	 * 通用的IndexedDB操作
	 */
	private async performDBOperation<T>(
		storeName: string,
		operation: (store: IDBObjectStore) => IDBRequest<T>,
		mode: IDBTransactionMode = "readonly",
	): Promise<T> {
		if (!this.isIndexedDBSupported()) {
			throw new Error("IndexedDB不支持，请使用现代浏览器");
		}

		const db = await this.initDB();
		const transaction = db.transaction([storeName], mode);
		const store = transaction.objectStore(storeName);
		const request = operation(store);

		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	/**
	 * localStorage备用操作
	 */
	private getFromLocalStorage<T>(key: string, defaultValue: T): T {
		if (typeof window === "undefined") return defaultValue;

		try {
			const item = (typeof window !== 'undefined' ? localStorage.getItem : (() => { console.warn('EdgeOne兼容: 服务端不支持localStorage'); return null; }))(key);
			return item ? JSON.parse(item) : defaultValue;
		} catch (error) {
			console.warn("[ClientDB] localStorage读取失败:", error);
			return defaultValue;
		}
	}

	private saveToLocalStorage<T>(key: string, data: T): boolean {
		if (typeof window === "undefined") return false;

		try {
			(typeof window !== 'undefined' ? localStorage.setItem : (() => { console.warn('EdgeOne兼容: 服务端不支持localStorage'); return null; }))(key, JSON.stringify(data));
			return true;
		} catch (error) {
			console.warn("[ClientDB] localStorage保存失败:", error);
			return false;
		}
	}

	/**
	 * 书源管理
	 */
	async getBookSources(): Promise<BookSource[]> {
		try {
			if (this.isIndexedDBSupported()) {
				const sources = await this.performDBOperation(
					STORES.BOOK_SOURCES,
					(store) => store.getAll(),
				);
				console.log(`[ClientDB] IndexedDB获取到 ${sources.length} 个书源`);
				return sources;
			}
		} catch (error) {
			console.warn(
				"[ClientDB] IndexedDB获取书源失败，使用localStorage备用:",
				error,
			);
		}

		// 备用方案：使用localStorage
		const sources = this.getFromLocalStorage<BookSource[]>(
			FALLBACK_KEYS.BOOK_SOURCES,
			[],
		);
		console.log(`[ClientDB] localStorage获取到 ${sources.length} 个书源`);
		return sources;
	}

	async saveBookSources(sources: BookSource[]): Promise<boolean> {
		let indexedDBSuccess = false;
		let localStorageSuccess = false;

		// 主要方案：IndexedDB
		if (this.isIndexedDBSupported()) {
			try {
				const db = await this.initDB();
				const transaction = db.transaction([STORES.BOOK_SOURCES], "readwrite");
				const store = transaction.objectStore(STORES.BOOK_SOURCES);

				// 先清空现有数据
				await new Promise((resolve, reject) => {
					const clearRequest = store.clear();
					clearRequest.onsuccess = () => resolve(clearRequest.result);
					clearRequest.onerror = () => reject(clearRequest.error);
				});

				// 批量插入新数据
				for (const source of sources) {
					await new Promise((resolve, reject) => {
						const addRequest = store.add(source);
						addRequest.onsuccess = () => resolve(addRequest.result);
						addRequest.onerror = () => reject(addRequest.error);
					});
				}
				indexedDBSuccess = true;
				console.log(`[ClientDB] IndexedDB保存了 ${sources.length} 个书源`);
			} catch (error) {
				console.warn("[ClientDB] IndexedDB保存书源失败:", error);
			}
		}

		// 备用方案：localStorage
		localStorageSuccess = this.saveToLocalStorage(
			FALLBACK_KEYS.BOOK_SOURCES,
			sources,
		);
		if (localStorageSuccess) {
			console.log(`[ClientDB] localStorage保存了 ${sources.length} 个书源`);
		}

		return indexedDBSuccess || localStorageSuccess;
	}

	async addBookSource(source: BookSource): Promise<boolean> {
		try {
			if (this.isIndexedDBSupported()) {
				await this.performDBOperation(
					STORES.BOOK_SOURCES,
					(store) => store.add(source),
					"readwrite",
				);
				console.log(`[ClientDB] IndexedDB添加书源: ${source.name}`);
				return true;
			}
		} catch (error) {
			console.warn(
				"[ClientDB] IndexedDB添加书源失败，使用localStorage备用:",
				error,
			);
		}

		// 备用方案：更新localStorage
		const sources = await this.getBookSources();
		sources.push(source);
		return this.saveBookSources(sources);
	}

	async updateBookSource(source: BookSource): Promise<boolean> {
		try {
			if (this.isIndexedDBSupported()) {
				await this.performDBOperation(
					STORES.BOOK_SOURCES,
					(store) => store.put(source),
					"readwrite",
				);
				console.log(`[ClientDB] IndexedDB更新书源: ${source.name}`);
				return true;
			}
		} catch (error) {
			console.warn(
				"[ClientDB] IndexedDB更新书源失败，使用localStorage备用:",
				error,
			);
		}

		// 备用方案：更新localStorage
		const sources = await this.getBookSources();
		const index = sources.findIndex((s) => s.id === source.id);
		if (index !== -1) {
			sources[index] = source;
			return this.saveBookSources(sources);
		}
		return false;
	}

	async deleteBookSource(id: string): Promise<boolean> {
		try {
			if (this.isIndexedDBSupported()) {
				await this.performDBOperation(
					STORES.BOOK_SOURCES,
					(store) => store.delete(id),
					"readwrite",
				);
				console.log(`[ClientDB] IndexedDB删除书源: ${id}`);
				return true;
			}
		} catch (error) {
			console.warn(
				"[ClientDB] IndexedDB删除书源失败，使用localStorage备用:",
				error,
			);
		}

		// 备用方案：更新localStorage
		const sources = await this.getBookSources();
		const filteredSources = sources.filter((s) => s.id !== id);
		return this.saveBookSources(filteredSources);
	}

	/**
	 * AI配置管理
	 */
	async getAIConfig(): Promise<unknown> {
		try {
			if (this.isIndexedDBSupported()) {
				const config = await this.performDBOperation(
					STORES.AI_CONFIG,
					(store) => store.get("default"),
				);
				if (config) return config.data;
			}
		} catch (error) {
			console.warn(
				"[ClientDB] IndexedDB获取AI配置失败，使用localStorage备用:",
				error,
			);
		}

		return this.getFromLocalStorage(FALLBACK_KEYS.AI_CONFIG, null);
	}

	async saveAIConfig(config: unknown): Promise<boolean> {
		let success = false;

		// 主要方案：IndexedDB
		if (this.isIndexedDBSupported()) {
			try {
				await this.performDBOperation(
					STORES.AI_CONFIG,
					(store) =>
						store.put({ id: "default", data: config, updatedAt: Date.now() }),
					"readwrite",
				);
				success = true;
				console.log("[ClientDB] IndexedDB保存AI配置成功");
			} catch (error) {
				console.warn("[ClientDB] IndexedDB保存AI配置失败:", error);
			}
		}

		// 备用方案：localStorage
		const localStorageSuccess = this.saveToLocalStorage(
			FALLBACK_KEYS.AI_CONFIG,
			config,
		);
		return success || localStorageSuccess;
	}

	/**
	 * 用户设置管理
	 */
	async getUserSetting<T>(key: string, defaultValue: T): Promise<T> {
		try {
			if (this.isIndexedDBSupported()) {
				const setting = await this.performDBOperation(
					STORES.USER_SETTINGS,
					(store) => store.get(key),
				);
				if (setting) return setting.value;
			}
		} catch (error) {
			console.warn(
				"[ClientDB] IndexedDB获取用户设置失败，使用localStorage备用:",
				error,
			);
		}

		return this.getFromLocalStorage(
			`${FALLBACK_KEYS.USER_SETTINGS}-${key}`,
			defaultValue,
		);
	}

	async saveUserSetting<T>(key: string, value: T): Promise<boolean> {
		let success = false;

		// 主要方案：IndexedDB
		if (this.isIndexedDBSupported()) {
			try {
				await this.performDBOperation(
					STORES.USER_SETTINGS,
					(store) => store.put({ key, value, updatedAt: Date.now() }),
					"readwrite",
				);
				success = true;
			} catch (error) {
				console.warn("[ClientDB] IndexedDB保存用户设置失败:", error);
			}
		}

		// 备用方案：localStorage
		const localStorageSuccess = this.saveToLocalStorage(
			`${FALLBACK_KEYS.USER_SETTINGS}-${key}`,
			value,
		);
		return success || localStorageSuccess;
	}

	/**
	 * 书籍数据管理
	 */
	async saveBookData(bookId: string, data: unknown): Promise<boolean> {
		const bookData = {
			id: `${bookId}-${Date.now()}`,
			bookId,
			data,
			lastUpdated: Date.now(),
		};

		let success = false;

		if (this.isIndexedDBSupported()) {
			try {
				await this.performDBOperation(
					STORES.BOOK_DATA,
					(store) => store.add(bookData),
					"readwrite",
				);
				success = true;
				console.log(`[ClientDB] IndexedDB保存书籍数据: ${bookId}`);
			} catch (error) {
				console.warn("[ClientDB] IndexedDB保存书籍数据失败:", error);
			}
		}

		// 备用方案：localStorage（有大小限制，需要谨慎使用）
		if (!success) {
			const localStorageSuccess = this.saveToLocalStorage(
				`${FALLBACK_KEYS.BOOK_DATA}-${bookId}`,
				data,
			);
			return localStorageSuccess;
		}

		return success;
	}

	async getBookData(bookId: string): Promise<unknown[]> {
		try {
			if (this.isIndexedDBSupported()) {
				const db = await this.initDB();
				const transaction = db.transaction([STORES.BOOK_DATA], "readonly");
				const store = transaction.objectStore(STORES.BOOK_DATA);
				const index = store.index("bookId");
				const request = index.getAll(bookId);

				return new Promise((resolve, reject) => {
					request.onsuccess = () =>
						resolve(request.result.map((item) => item.data));
					request.onerror = () => reject(request.error);
				});
			}
		} catch (error) {
			console.warn(
				"[ClientDB] IndexedDB获取书籍数据失败，使用localStorage备用:",
				error,
			);
		}

		// 备用方案：localStorage
		const data = this.getFromLocalStorage(
			`${FALLBACK_KEYS.BOOK_DATA}-${bookId}`,
			null,
		);
		return data ? [data] : [];
	}

	/**
	 * 阅读进度管理
	 */
	async saveReadingProgress(
		bookId: string,
		progress: Record<string, unknown>,
	): Promise<boolean> {
		const progressData = {
			bookId,
			...progress,
			lastRead: Date.now(),
		};

		let success = false;

		if (this.isIndexedDBSupported()) {
			try {
				await this.performDBOperation(
					STORES.READING_PROGRESS,
					(store) => store.put(progressData),
					"readwrite",
				);
				success = true;
				console.log(`[ClientDB] IndexedDB保存阅读进度: ${bookId}`);
			} catch (error) {
				console.warn("[ClientDB] IndexedDB保存阅读进度失败:", error);
			}
		}

		// 备用方案：localStorage
		const localStorageSuccess = this.saveToLocalStorage(
			`${FALLBACK_KEYS.READING_PROGRESS}-${bookId}`,
			progressData,
		);
		return success || localStorageSuccess;
	}

	async getReadingProgress(bookId: string): Promise<unknown> {
		try {
			if (this.isIndexedDBSupported()) {
				const progress = await this.performDBOperation(
					STORES.READING_PROGRESS,
					(store) => store.get(bookId),
				);
				if (progress) return progress;
			}
		} catch (error) {
			console.warn(
				"[ClientDB] IndexedDB获取阅读进度失败，使用localStorage备用:",
				error,
			);
		}

		return this.getFromLocalStorage(
			`${FALLBACK_KEYS.READING_PROGRESS}-${bookId}`,
			null,
		);
	}

	/**
	 * 数据库维护
	 */
	async clearAllData(): Promise<boolean> {
		let success = true;

		// 清空IndexedDB
		if (this.isIndexedDBSupported()) {
			try {
				const storeNames = Object.values(STORES);

				for (const storeName of storeNames) {
					await this.performDBOperation(
						storeName,
						(store) => store.clear(),
						"readwrite",
					);
				}
				console.log("[ClientDB] IndexedDB数据清空完成");
			} catch (error) {
				console.error("[ClientDB] IndexedDB清空失败:", error);
				success = false;
			}
		}

		// 清空localStorage
		if (typeof window !== "undefined") {
			try {
				Object.values(FALLBACK_KEYS).forEach((key) => {
					(typeof window !== 'undefined' ? localStorage.removeItem : (() => { console.warn('EdgeOne兼容: 服务端不支持localStorage'); return null; }))(key);
				});
				console.log("[ClientDB] localStorage数据清空完成");
			} catch (error) {
				console.error("[ClientDB] localStorage清空失败:", error);
				success = false;
			}
		}

		return success;
	}

	async exportData(): Promise<{
		bookSources: BookSource[];
		aiConfig: unknown;
		userSettings: Record<string, unknown>;
		readingProgress: Record<string, unknown>;
	}> {
		const [bookSources, aiConfig] = await Promise.all([
			this.getBookSources(),
			this.getAIConfig(),
		]);

		// 导出用户设置（这里需要根据实际需要的设置来实现）
		const userSettings: Record<string, unknown> = {};
		const readingProgress: Record<string, unknown> = {};

		return {
			bookSources,
			aiConfig,
			userSettings,
			readingProgress,
		};
	}

	async importData(data: {
		bookSources?: BookSource[];
		aiConfig?: unknown;
		userSettings?: Record<string, unknown>;
		readingProgress?: Record<string, unknown>;
	}): Promise<boolean> {
		let success = true;

		try {
			if (data.bookSources) {
				success = success && (await this.saveBookSources(data.bookSources));
			}

			if (data.aiConfig) {
				success = success && (await this.saveAIConfig(data.aiConfig));
			}

			if (data.userSettings) {
				for (const [key, value] of Object.entries(data.userSettings)) {
					success = success && (await this.saveUserSetting(key, value));
				}
			}

			if (data.readingProgress) {
				for (const [bookId, progress] of Object.entries(data.readingProgress)) {
					success =
						success &&
						(await this.saveReadingProgress(
							bookId,
							progress as Record<string, unknown>,
						));
				}
			}

			console.log("[ClientDB] 数据导入完成，成功:", success);
			return success;
		} catch (error) {
			console.error("[ClientDB] 数据导入失败:", error);
			return false;
		}
	}

	/**
	 * 获取存储统计信息
	 */
	async getStorageStats(): Promise<{
		indexedDBSupported: boolean;
		localStorageSupported: boolean;
		bookSourcesCount: number;
		hasAIConfig: boolean;
		storageSize: {
			indexedDB?: number;
			localStorage?: number;
		};
	}> {
		const indexedDBSupported = this.isIndexedDBSupported();
		const localStorageSupported =
			typeof window !== "undefined" && "localStorage" in window;

		const bookSources = await this.getBookSources();
		const aiConfig = await this.getAIConfig();

		const stats = {
			indexedDBSupported,
			localStorageSupported,
			bookSourcesCount: bookSources.length,
			hasAIConfig: !!aiConfig,
			storageSize: {} as { indexedDB?: number; localStorage?: number },
		};

		// 估算localStorage使用大小
		if (localStorageSupported) {
			let localStorageSize = 0;
			Object.values(FALLBACK_KEYS).forEach((key) => {
				const item = (typeof window !== 'undefined' ? localStorage.getItem : (() => { console.warn('EdgeOne兼容: 服务端不支持localStorage'); return null; }))(key);
				if (item) {
					localStorageSize += item.length;
				}
			});
			stats.storageSize.localStorage = localStorageSize;
		}

		return stats;
	}
}

// 全局单例实例
let clientDB: ClientDatabase | null = null;

/**
 * 获取客户端数据库实例
 */
export function getClientDB(): ClientDatabase {
	if (!clientDB) {
		clientDB = new ClientDatabase();
	}
	return clientDB;
}

// 导出便捷函数，保持与原有API兼容
export async function getBookSources(): Promise<BookSource[]> {
	return getClientDB().getBookSources();
}

export async function saveBookSources(sources: BookSource[]): Promise<boolean> {
	return getClientDB().saveBookSources(sources);
}

export async function getAIConfig(): Promise<unknown> {
	return getClientDB().getAIConfig();
}

export async function saveAIConfig(config: unknown): Promise<boolean> {
	return getClientDB().saveAIConfig(config);
}

export async function getUserSetting<T>(
	key: string,
	defaultValue: T,
): Promise<T> {
	return getClientDB().getUserSetting(key, defaultValue);
}

export async function saveUserSetting<T>(
	key: string,
	value: T,
): Promise<boolean> {
	return getClientDB().saveUserSetting(key, value);
}

// 导出类型和常量
export { ClientDatabase, STORES, FALLBACK_KEYS };
export type { BookSource };
