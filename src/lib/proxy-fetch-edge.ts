/**
 * 边缘部署兼容的代理请求适配器
 * 支持EdgeOne、Vercel Edge Runtime、Cloudflare Workers等环境
 */

// 环境检测
const isClient = typeof window !== "undefined";
const isEdgeRuntime =
	(typeof globalThis !== "undefined" && "EdgeRuntime" in globalThis) ||
	(process.env?.VERCEL_ENV || '') ||
	(process.env?.CLOUDFLARE_WORKERS || '') ||
	(process.env?.EDGE_RUNTIME || '');

/**
 * 代理配置接口
 */
export interface ProxyConfig {
	url?: string;
	headers?: Record<string, string>;
	timeout?: number;
	retries?: number;
}

/**
 * 代理适配器接口
 */
interface ProxyAdapter {
	fetch(url: string | URL, init?: RequestInit): Promise<Response>;
	testConnection(): Promise<{ success: boolean; message: string }>;
}

/**
 * 直连适配器（无代理）
 */
class DirectAdapter implements ProxyAdapter {
	async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
		return fetch(url, init);
	}

	async testConnection(): Promise<{ success: boolean; message: string }> {
		try {
			const response = await fetch("https://httpbin.org/get", {
				method: "HEAD",
				signal: AbortSignal.timeout(5000),
			});
			return {
				success: response.ok,
				message: response.ok ? "直连成功" : `HTTP ${response.status}`,
			};
		} catch (error: unknown) {
			return {
				success: false,
				message: error instanceof Error ? error.message : "连接失败",
			};
		}
	}
}

/**
 * API转发适配器（通过后端API代理）
 */
class APIProxyAdapter implements ProxyAdapter {
	constructor(private config: ProxyConfig) {}

	async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
		const proxyUrl = "/api/proxy-fetch";

		const proxyRequest = {
			url: url.toString(),
			method: init?.method || "GET",
			headers: init?.headers || {},
			body: init?.body ? await this.serializeBody(init.body) : undefined,
			timeout: this.config.timeout || 30000,
		};

		const response = await fetch(proxyUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...this.config.headers,
			},
			body: JSON.stringify(proxyRequest),
		});

		if (!response.ok) {
			throw new Error(
				`代理请求失败: ${response.status} ${response.statusText}`,
			);
		}

		return response;
	}

	async testConnection(): Promise<{ success: boolean; message: string }> {
		try {
			const response = await this.fetch("https://httpbin.org/get", {
				method: "HEAD",
			});
			return {
				success: response.ok,
				message: response.ok ? "API代理连接成功" : `HTTP ${response.status}`,
			};
		} catch (error: any) {
			return {
				success: false,
				message: error.message || "API代理连接失败",
			};
		}
	}

	private async serializeBody(body: BodyInit): Promise<string> {
		if (typeof body === "string") {
			return body;
		}
		if (body instanceof FormData) {
			const obj: Record<string, string> = {};
			for (const [key, value] of body.entries()) {
				obj[key] = typeof value === "string" ? value : value.toString();
			}
			return JSON.stringify(obj);
		}
		if (body instanceof URLSearchParams) {
			return body.toString();
		}
		if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
			return new Uint8Array(body).toString();
		}
		return JSON.stringify(body);
	}
}

/**
 * CORS代理适配器（通过公共代理服务）
 */
class CORSProxyAdapter implements ProxyAdapter {
	private readonly proxyServices = [
		"https://cors-anywhere.herokuapp.com/",
		"https://api.allorigins.win/raw?url=",
		"https://thingproxy.freeboard.io/fetch/",
	];

	constructor(private config: ProxyConfig) {}

	async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
		const targetUrl = url.toString();
		const errors: string[] = [];

		// 尝试多个代理服务
		for (const proxyService of this.proxyServices) {
			try {
				const proxyUrl = proxyService.includes("?url=")
					? `${proxyService}${encodeURIComponent(targetUrl)}`
					: `${proxyService}${targetUrl}`;

				const response = await fetch(proxyUrl, {
					...init,
					headers: {
						...init?.headers,
						...this.config.headers,
					},
					signal: AbortSignal.timeout(this.config.timeout || 30000),
				});

				if (response.ok) {
					return response;
				}
				errors.push(`${proxyService}: HTTP ${response.status}`);
			} catch (error: unknown) {
				errors.push(
					`${proxyService}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		throw new Error(`所有代理服务都失败: ${errors.join(", ")}`);
	}

	async testConnection(): Promise<{ success: boolean; message: string }> {
		try {
			const response = await this.fetch("https://httpbin.org/get", {
				method: "HEAD",
			});
			return {
				success: response.ok,
				message: response.ok ? "CORS代理连接成功" : `HTTP ${response.status}`,
			};
		} catch (error: unknown) {
			return {
				success: false,
				message: error instanceof Error ? error.message : "CORS代理连接失败",
			};
		}
	}
}

/**
 * 边缘函数代理适配器
 */
class EdgeFunctionAdapter implements ProxyAdapter {
	constructor(private config: ProxyConfig) {}

	async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
		// 在边缘函数中，直接使用fetch但添加自定义headers
		const enhancedInit: RequestInit = {
			...init,
			headers: {
				...init?.headers,
				...this.config.headers,
				"User-Agent": "Mozilla/5.0 (compatible; EdgeProxy/1.0)",
			},
		};

		// 添加超时控制
		if (this.config.timeout) {
			enhancedInit.signal = AbortSignal.timeout(this.config.timeout);
		}

		return fetch(url, enhancedInit);
	}

	async testConnection(): Promise<{ success: boolean; message: string }> {
		try {
			const response = await this.fetch("https://httpbin.org/get", {
				method: "HEAD",
			});
			return {
				success: response.ok,
				message: response.ok ? "边缘函数请求成功" : `HTTP ${response.status}`,
			};
		} catch (error: unknown) {
			return {
				success: false,
				message: error instanceof Error ? error.message : "边缘函数请求失败",
			};
		}
	}
}

/**
 * 获取适合当前环境的代理适配器
 */
function getProxyAdapter(config: ProxyConfig = {}): ProxyAdapter {
	// 检查是否配置了代理URL
	if (config.url) {
		// 如果是API端点，使用API代理
		if (config.url.startsWith("/api/")) {
			return new APIProxyAdapter(config);
		}
		// 如果是CORS代理服务，使用CORS代理
		if (config.url.includes("cors") || config.url.includes("proxy")) {
			return new CORSProxyAdapter(config);
		}
	}

	// 客户端环境
	if (isClient) {
		// 浏览器中优先使用API代理
		return new APIProxyAdapter(config);
	}

	// 边缘运行时环境
	if (isEdgeRuntime) {
		return new EdgeFunctionAdapter(config);
	}

	// 默认直连
	return new DirectAdapter();
}

// 全局代理实例
let proxyInstance: ProxyAdapter | null = null;
let currentConfig: ProxyConfig = {};

/**
 * 配置代理设置
 */
export function configureProxy(config: ProxyConfig): void {
	currentConfig = { ...config };
	proxyInstance = null; // 重置实例以使用新配置
}

/**
 * 获取代理配置
 */
export function getProxyConfig(): ProxyConfig {
	// 尝试从环境变量或localStorage读取配置
	if (isClient) {
		const saved = (typeof window !== 'undefined' ? localStorage.getItem : (() => { console.warn('EdgeOne兼容: 服务端不支持localStorage'); return null; }))("proxy-config");
		if (saved) {
			try {
				return { ...currentConfig, ...JSON.parse(saved) };
			} catch (error) {
				console.warn("解析代理配置失败:", error);
			}
		}
	}

	return currentConfig;
}

/**
 * 保存代理配置
 */
export function saveProxyConfig(config: ProxyConfig): void {
	if (isClient) {
		(typeof window !== 'undefined' ? localStorage.setItem : (() => { console.warn('EdgeOne兼容: 服务端不支持localStorage'); return null; }))("proxy-config", JSON.stringify(config));
	}
	configureProxy(config);
}

/**
 * 创建支持代理的fetch函数
 */
export function createProxyFetch() {
	return (
		url: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> => {
		if (!proxyInstance) {
			const config = getProxyConfig();
			proxyInstance = getProxyAdapter(config);
		}
		const urlString = typeof url === "string" ? url : url.toString();
		return proxyInstance.fetch(urlString, init);
	};
}

/**
 * 获取全局代理fetch实例
 */
let cachedProxyFetch: typeof fetch | null = null;

export function getProxyFetch(): typeof fetch {
	if (!cachedProxyFetch) {
		cachedProxyFetch = createProxyFetch();
	}
	return cachedProxyFetch;
}

/**
 * 重置代理fetch实例
 */
export function resetProxyFetch(): void {
	cachedProxyFetch = null;
	proxyInstance = null;
}

/**
 * 测试代理连接
 */
export async function testProxyConnection(): Promise<{
	success: boolean;
	message: string;
	adapter: string;
	config: ProxyConfig;
}> {
	const config = getProxyConfig();
	const adapter = getProxyAdapter(config);
	const result = await adapter.testConnection();

	return {
		...result,
		adapter: adapter.constructor.name,
		config,
	};
}

/**
 * 检测最佳代理方案
 */
export async function detectBestProxy(): Promise<{
	recommended: string;
	results: Array<{
		adapter: string;
		success: boolean;
		message: string;
		latency?: number;
	}>;
}> {
	const adapters = [
		{ name: "DirectAdapter", adapter: new DirectAdapter() },
		{ name: "APIProxyAdapter", adapter: new APIProxyAdapter({}) },
		{ name: "CORSProxyAdapter", adapter: new CORSProxyAdapter({}) },
		{ name: "EdgeFunctionAdapter", adapter: new EdgeFunctionAdapter({}) },
	];

	const results = [];
	let bestAdapter = "DirectAdapter";
	let bestLatency = Infinity;

	for (const { name, adapter } of adapters) {
		const startTime = Date.now();
		try {
			const result = await Promise.race([
				adapter.testConnection(),
				new Promise<{ success: boolean; message: string }>((_, reject) =>
					setTimeout(() => reject(new Error("超时")), 10000),
				),
			]);
			const latency = Date.now() - startTime;

			results.push({
				adapter: name,
				success: result.success,
				message: result.message,
				latency,
			});

			if (result.success && latency < bestLatency) {
				bestLatency = latency;
				bestAdapter = name;
			}
		} catch (error: unknown) {
			results.push({
				adapter: name,
				success: false,
				message: error instanceof Error ? error.message : "测试失败",
				latency: Date.now() - startTime,
			});
		}
	}

	return {
		recommended: bestAdapter,
		results,
	};
}

/**
 * 按源重写URL（支持代理基址）
 */
export function rewriteViaProxyBase(url: string, proxyBase?: string): string {
	const base = proxyBase?.trim();
	if (!base) return url;

	try {
		if (base.includes("{url}")) {
			return base.replace("{url}", encodeURIComponent(url));
		}
		if (base.endsWith("/")) {
			return base + encodeURIComponent(url);
		}
		return `${base}/${encodeURIComponent(url)}`;
	} catch (error) {
		console.warn("URL重写失败:", error);
		return url;
	}
}

/**
 * 获取环境信息
 */
export function getEnvironmentInfo(): {
	isClient: boolean;
	isEdgeRuntime: boolean;
	platform: string;
	features: string[];
} {
	const features = [];

	if (typeof fetch !== "undefined") features.push("fetch");
	if (typeof AbortSignal !== "undefined") features.push("AbortSignal");
	if (typeof Headers !== "undefined") features.push("Headers");
	if (typeof Request !== "undefined") features.push("Request");
	if (typeof Response !== "undefined") features.push("Response");

	return {
		isClient,
		isEdgeRuntime: !!isEdgeRuntime,
		platform: isClient ? "browser" : isEdgeRuntime ? "edge" : "server",
		features,
	};
}
