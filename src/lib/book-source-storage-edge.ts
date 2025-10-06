/**
 * 边缘部署兼容的书源存储管理
 * 支持EdgeOne等边缘平台，使用数据库或外部存储替代文件系统
 */

import type { BookSource } from "./types";

// 检测运行环境
const isClient = typeof window !== "undefined";
const isEdgeRuntime =
	(process.env?.VERCEL || '') ||
	(process.env?.CLOUDFLARE_WORKERS || '') ||
	(process.env?.EDGE_RUNTIME || '');

/**
 * 存储适配器接口
 */
interface StorageAdapter {
	getBookSources(): Promise<BookSource[]>;
	saveBookSources(sources: BookSource[]): Promise<boolean>;
}

/**
 * EdgeOne客户端数据库适配器（使用IndexedDB + localStorage备用）
 */
class EdgeOneClientDBAdapter implements StorageAdapter {
	private clientDB: any;

	constructor() {
		// 动态导入客户端数据库，避免服务端引用问题
		if (typeof window !== "undefined") {
			import("./client-database").then((module) => {
				this.clientDB = module.getClientDB();
			});
		}
	}

	private async ensureClientDB() {
		if (!this.clientDB && typeof window !== "undefined") {
			const module = await import("./client-database");
			this.clientDB = module.getClientDB();
		}
		return this.clientDB;
	}

	async getBookSources(): Promise<BookSource[]> {
		try {
			const db = await this.ensureClientDB();
			if (db) {
				const sources = await db.getBookSources();
				console.log(`[EdgeOneClientDB] 获取到 ${sources.length} 个书源`);

				// 如果没有书源，尝试从默认配置初始化
				if (sources.length === 0) {
					const defaultSources = await this.loadDefaultSources();
					if (defaultSources.length > 0) {
						await db.saveBookSources(defaultSources);
						return defaultSources;
					}
				}

				return sources;
			}
		} catch (error) {
			console.error("[EdgeOneClientDB] 读取书源失败:", error);
		}

		// 最终备用方案：空数组
		return [];
	}

	async saveBookSources(sources: BookSource[]): Promise<boolean> {
		try {
			const db = await this.ensureClientDB();
			if (db) {
				const success = await db.saveBookSources(sources);
				if (success) {
					console.log(`[EdgeOneClientDB] 保存了 ${sources.length} 个书源`);
				}
				return success;
			}
		} catch (error) {
			console.error("[EdgeOneClientDB] 保存书源失败:", error);
		}
		return false;
	}

	private async loadDefaultSources(): Promise<BookSource[]> {
		try {
			// 从静态资源加载默认书源
			const response = await fetch("/book_sources.json");
			if (response.ok) {
				const sources = await response.json();
				console.log(
					`[EdgeOneClientDB] 从默认配置加载了 ${sources.length} 个书源`,
				);
				return Array.isArray(sources) ? sources : [];
			}
		} catch (error) {
			console.warn("[EdgeOneClientDB] 无法加载默认书源:", error);
		}
		return [];
	}
}

/**
 * 边缘运行时存储适配器（使用外部API）
 */
class EdgeStorageAdapter implements StorageAdapter {
	private readonly apiBase = "/api/book-sources";

	async getBookSources(): Promise<BookSource[]> {
		try {
			const response = await fetch(`${this.apiBase}`, {
				method: "GET",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				console.warn(`[EdgeStorage] API返回错误: ${response.status}`);
				return await this.getFallbackSources();
			}

			const data = await response.json();
			const sources = Array.isArray(data) ? data : data.sources || [];
			return sources.filter((s: BookSource) => s.name && s.url);
		} catch (error) {
			console.error("[EdgeStorage] 获取书源失败:", error);
			return await this.getFallbackSources();
		}
	}

	async saveBookSources(sources: BookSource[]): Promise<boolean> {
		try {
			const response = await fetch(`${this.apiBase}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sources }),
			});

			if (response.ok) {
				console.log(`[EdgeStorage] 保存了 ${sources.length} 个书源`);
				return true;
			} else {
				console.error(`[EdgeStorage] 保存失败: ${response.status}`);
				return false;
			}
		} catch (error) {
			console.error("[EdgeStorage] 保存书源失败:", error);
			return false;
		}
	}

	private async getFallbackSources(): Promise<BookSource[]> {
		try {
			// 尝试从静态资源获取默认书源
			const response = await fetch("/book_sources.json");
			if (response.ok) {
				const sources = await response.json();
				return Array.isArray(sources) ? sources : [];
			}
		} catch (error) {
			console.warn("[EdgeStorage] 备用方案也失败:", error);
		}
		return [];
	}
}

/**
 * KV存储适配器（用于Cloudflare Workers等）
 */
class KVStorageAdapter implements StorageAdapter {
	private readonly kvKey = "book-sources";

	async getBookSources(): Promise<BookSource[]> {
		try {
			// @ts-expect-error - Cloudflare Workers KV
			const data = await BOOK_SOURCES_KV?.get(this.kvKey);
			if (data) {
				const sources = JSON.parse(data) as BookSource[];
				return sources.filter((s) => s.name && s.url);
			}
			return [];
		} catch (error) {
			console.error("[KVStorage] 读取书源失败:", error);
			return [];
		}
	}

	async saveBookSources(sources: BookSource[]): Promise<boolean> {
		try {
			// @ts-expect-error - Cloudflare Workers KV
			await BOOK_SOURCES_KV?.put(this.kvKey, JSON.stringify(sources, null, 2));
			console.log(`[KVStorage] 保存了 ${sources.length} 个书源`);
			return true;
		} catch (error) {
			console.error("[KVStorage] 保存书源失败:", error);
			return false;
		}
	}
}

/**
 * 内存存储适配器（临时方案）
 */
class MemoryStorageAdapter implements StorageAdapter {
	private sources: BookSource[] = [];
	private initialized = false;

	async getBookSources(): Promise<BookSource[]> {
		if (!this.initialized) {
			await this.initialize();
		}
		return [...this.sources];
	}

	async saveBookSources(sources: BookSource[]): Promise<boolean> {
		this.sources = [...sources];
		console.log(`[MemoryStorage] 保存了 ${sources.length} 个书源 (仅内存)`);
		return true;
	}

	private async initialize() {
		try {
			// 尝试从默认配置初始化
			const response = await fetch("/book_sources.json");
			if (response.ok) {
				const sources = await response.json();
				this.sources = Array.isArray(sources) ? sources : [];
			}
		} catch (error) {
			console.warn("[MemoryStorage] 初始化失败:", error);
		}
		this.initialized = true;
	}
}

/**
 * 获取适合当前环境的存储适配器
 */
function getStorageAdapter(): StorageAdapter {
	// EdgeOne等边缘部署平台 - 优先使用客户端数据库
	if (isClient || isEdgeRuntime) {
		return new EdgeOneClientDBAdapter();
	}

	// Cloudflare Workers环境
	if ((process.env?.CLOUDFLARE_WORKERS || '')) {
		return new KVStorageAdapter();
	}

	// 传统服务器环境 - 使用API存储
	if (!isClient && !isEdgeRuntime) {
		return new EdgeStorageAdapter();
	}

	// 备用方案：内存存储
	return new MemoryStorageAdapter();
}

// 全局存储实例
let storageInstance: StorageAdapter | null = null;

function getStorage(): StorageAdapter {
	if (!storageInstance) {
		storageInstance = getStorageAdapter();
	}
	return storageInstance;
}

/**
 * 获取所有书源
 */
export async function getBookSources(): Promise<BookSource[]> {
	const storage = getStorage();
	const sources = await storage.getBookSources();
	console.log(`[book-source-storage-edge] 📖 获取到 ${sources.length} 个书源`);
	return sources;
}

/**
 * 保存书源列表
 */
export async function saveBookSources(sources: BookSource[]): Promise<boolean> {
	const storage = getStorage();
	const success = await storage.saveBookSources(sources);

	if (success) {
		console.log(
			`[book-source-storage-edge] ✅ 成功保存 ${sources.length} 个书源`,
		);
	} else {
		console.error(
			`[book-source-storage-edge] ❌ 保存 ${sources.length} 个书源失败`,
		);
	}

	return success;
}

/**
 * 重置存储适配器（用于测试或环境切换）
 */
export function resetStorageAdapter(): void {
	storageInstance = null;
}

/**
 * 获取当前存储类型信息
 */
export function getStorageInfo(): {
	type: string;
	isClient: boolean;
	isEdgeRuntime: boolean;
	platform: string;
	features: string[];
	env: Record<string, string>;
} {
	const storage = getStorage();

	// 检测平台和功能
	let platform = "unknown";
	const features: string[] = [];

	if ((process.env?.EDGEONE || '') || (process.env?.TENCENT_CLOUD_EDGE || '')) {
		platform = "edgeone";
		features.push("client-database", "indexeddb", "localstorage");
	} else if ((process.env?.VERCEL || '')) {
		platform = "vercel";
		features.push("edge-runtime", "kv-storage");
	} else if ((process.env?.CLOUDFLARE_WORKERS || '')) {
		platform = "cloudflare";
		features.push("kv-storage", "durable-objects");
	} else if (isClient) {
		platform = "browser";
		features.push("client-database", "indexeddb", "localstorage");
	} else {
		platform = "nodejs";
		features.push("file-system", "database");
	}

	// 检测浏览器功能
	if (typeof window !== "undefined") {
		if ("indexedDB" in window) features.push("indexeddb");
		if ("localStorage" in window) features.push("localstorage");
		if ("serviceWorker" in navigator) features.push("service-worker");
	}

	return {
		type: storage.constructor.name,
		isClient,
		isEdgeRuntime: !!isEdgeRuntime,
		platform,
		features: [...new Set(features)], // 去重
		env: {
			VERCEL: (process.env?.VERCEL || '') || "",
			CLOUDFLARE_WORKERS: (process.env?.CLOUDFLARE_WORKERS || '') || "",
			EDGE_RUNTIME: (process.env?.EDGE_RUNTIME || '') || "",
			EDGEONE: (process.env?.EDGEONE || '') || "",
			TENCENT_CLOUD_EDGE: (process.env?.TENCENT_CLOUD_EDGE || '') || "",
		},
	};
}

/**
 * 测试存储功能
 */
export async function testStorage(): Promise<{
	read: boolean;
	write: boolean;
	clientDB: boolean;
	indexedDB: boolean;
	localStorage: boolean;
	storageStats?: any;
	info: ReturnType<typeof getStorageInfo>;
}> {
	const info = getStorageInfo();
	let read = false;
	let write = false;
	let clientDB = false;
	let indexedDB = false;
	let localStorage = false;
	let storageStats: any;

	try {
		// 测试读取
		const sources = await getBookSources();
		read = Array.isArray(sources);

		// 测试客户端数据库功能
		if (typeof window !== "undefined") {
			try {
				const { getClientDB } = await import("./client-database");
				const db = getClientDB();
				const stats = await db.getStorageStats();
				storageStats = stats;
				clientDB = true;
				indexedDB = (stats as { indexedDBSupported: boolean })
					.indexedDBSupported;
				localStorage = (stats as { localStorageSupported: boolean })
					.localStorageSupported;
			} catch (error) {
				console.warn("[testStorage] 客户端数据库测试失败:", error);
			}
		}

		// 测试写入
		const testSource: BookSource = {
			id: "test-" + Date.now(),
			name: "测试书源",
			url: "https://example.com",
			enabled: false,
			group: "测试",
			comment: "存储测试",
			exploreUrl: "[]",
			loginUrl: "",
			bookUrlPattern: "",
			header: "",
			searchUrl: "",
			rules: {
				search: {
					bookList: "div.book-item",
					name: ".book-title",
					bookUrl: ".book-link",
				},
				find: {
					bookList: "div.book-item",
					name: ".book-title",
					bookUrl: ".book-link",
				},
				bookInfo: {
					name: "h1.title",
					author: ".author",
					intro: ".intro",
				},
				toc: {
					chapterList: ".chapter-list li",
					chapterName: "a",
					chapterUrl: "a",
				},
				content: {
					content: ".chapter-content",
				},
			},
		};

		const updatedSources = [...sources, testSource];
		write = await saveBookSources(updatedSources);

		// 清理测试数据
		if (write) {
			await saveBookSources(sources);
		}
	} catch (error) {
		console.error("[testStorage] 测试失败:", error);
	}

	return {
		read,
		write,
		clientDB,
		indexedDB,
		localStorage,
		storageStats,
		info,
	};
}
