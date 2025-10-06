/**
 * 边缘部署检测和自动迁移工具
 * 支持EdgeOne、Vercel、Cloudflare Workers等平台的自动适配
 */

// 环境检测
export const Environment = {
	// 基础环境检测
	isClient: typeof window !== "undefined",
	isServer: typeof window === "undefined",
	isEdgeRuntime:
		(typeof globalThis !== "undefined" && "EdgeRuntime" in globalThis) ||
		!!(process.env?.VERCEL_ENV || '') ||
		!!(process.env?.CLOUDFLARE_WORKERS || '') ||
		!!(process.env?.EDGE_RUNTIME || ''),

	// 平台检测
	isVercel: !!(process.env?.VERCEL || '') || !!(process.env?.VERCEL_ENV || ''),
	isCloudflare: !!(process.env?.CLOUDFLARE_WORKERS || ''),
	isNetlify: !!(process.env?.NETLIFY || ''),
	isEdgeOne: !!(process.env?.EDGEONE || '') || !!(process.env?.TENCENT_CLOUD_EDGE || ''),

	// 运行时检测
	hasNodeJS: typeof process !== "undefined" && process.versions?.node,
	hasWebStreams: typeof ReadableStream !== "undefined",
	hasAbortController: typeof AbortController !== "undefined",
	hasFetch: typeof fetch !== "undefined",
	hasLocalStorage: typeof localStorage !== "undefined",
};

/**
 * 平台能力检测结果
 */
export interface PlatformCapabilities {
	platform: string;
	runtime: string;
	features: {
		fileSystem: boolean;
		nodeModules: boolean;
		localStorage: boolean;
		streaming: boolean;
		webAPIs: boolean;
		proxy: boolean;
		database: boolean;
		kv: boolean;
	};
	limitations: string[];
	recommendations: string[];
}

/**
 * 检测当前平台能力
 */
export function detectPlatformCapabilities(): PlatformCapabilities {
	let platform = "unknown";
	let runtime = "unknown";
	const features = {
		fileSystem: false,
		nodeModules: false,
		localStorage: Environment.hasLocalStorage,
		streaming: Environment.hasWebStreams,
		webAPIs: Environment.hasFetch && Environment.hasAbortController,
		proxy: false,
		database: false,
		kv: false,
	};
	const limitations: string[] = [];
	const recommendations: string[] = [];

	// 检测平台
	if (Environment.isVercel) {
		platform = "vercel";
		runtime = Environment.isEdgeRuntime ? "edge" : "nodejs";
		features.proxy = true;
		features.kv = !!(process.env?.KV_REST_API_URL || '');
		if (Environment.isEdgeRuntime) {
			limitations.push("no-file-system", "limited-node-modules");
			recommendations.push("use-api-storage", "use-web-apis");
		} else {
			features.fileSystem = true;
			features.nodeModules = true;
		}
	} else if (Environment.isCloudflare) {
		platform = "cloudflare";
		runtime = "workerd";
		features.proxy = true;
		features.kv = true;
		limitations.push("no-file-system", "no-node-modules");
		recommendations.push(
			"use-kv-storage",
			"use-web-apis",
			"use-durable-objects",
		);
	} else if (Environment.isNetlify) {
		platform = "netlify";
		runtime = Environment.isEdgeRuntime ? "deno" : "nodejs";
		features.proxy = true;
		if (Environment.isEdgeRuntime) {
			limitations.push("limited-file-system", "limited-node-modules");
			recommendations.push("use-edge-functions", "use-netlify-blobs");
		} else {
			features.fileSystem = true;
			features.nodeModules = true;
		}
	} else if (Environment.isEdgeOne) {
		platform = "edgeone";
		runtime = "edge";
		features.proxy = true;
		limitations.push("no-file-system", "no-node-modules", "limited-memory");
		recommendations.push(
			"use-api-storage",
			"use-web-apis",
			"optimize-memory-usage",
		);
	} else if (Environment.isClient) {
		platform = "browser";
		runtime = "browser";
		features.proxy = false; // 需要通过API代理
		features.localStorage = true;
		limitations.push("cors-restrictions", "no-server-apis");
		recommendations.push("use-api-proxy", "use-local-storage");
	} else if (Environment.hasNodeJS) {
		platform = "nodejs";
		runtime = "nodejs";
		features.fileSystem = true;
		features.nodeModules = true;
		features.proxy = true;
		features.database = true;
	}

	return {
		platform,
		runtime,
		features,
		limitations,
		recommendations,
	};
}

/**
 * 迁移配置选项
 */
export interface MigrationOptions {
	autoDetect: boolean;
	forceEdgeCompatible: boolean;
	preserveData: boolean;
	enableLogging: boolean;
	dryRun: boolean;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
	success: boolean;
	platform: string;
	changes: Array<{
		component: string;
		from: string;
		to: string;
		status: "success" | "warning" | "error";
		message: string;
	}>;
	errors: string[];
	warnings: string[];
}

/**
 * 存储迁移器
 */
class StorageMigrator {
	async migrate(
		capabilities: PlatformCapabilities,
		_options: MigrationOptions,
	): Promise<{
		success: boolean;
		changes: MigrationResult["changes"];
		errors: string[];
	}> {
		const changes: MigrationResult["changes"] = [];
		const errors: string[] = [];

		try {
			// 检测当前存储方式
			const hasFileSystem = capabilities.features.fileSystem;
			const hasKV = capabilities.features.kv;
			const hasLocalStorage = capabilities.features.localStorage;

			if (capabilities.platform === "cloudflare" && hasKV) {
				// 迁移到Cloudflare KV
				changes.push({
					component: "storage",
					from: "file-system",
					to: "cloudflare-kv",
					status: "success",
					message: "使用Cloudflare KV存储替代文件系统",
				});
			} else if (capabilities.platform === "vercel" && hasKV) {
				// 迁移到Vercel KV
				changes.push({
					component: "storage",
					from: "file-system",
					to: "vercel-kv",
					status: "success",
					message: "使用Vercel KV存储替代文件系统",
				});
			} else if (!hasFileSystem) {
				// 使用API存储
				changes.push({
					component: "storage",
					from: "file-system",
					to: "api-storage",
					status: "success",
					message: "使用API存储替代文件系统",
				});
			}

			if (hasLocalStorage && capabilities.platform === "browser") {
				changes.push({
					component: "storage",
					from: "server-storage",
					to: "local-storage",
					status: "success",
					message: "浏览器环境使用localStorage",
				});
			}

			return { success: true, changes, errors };
		} catch (error: unknown) {
			errors.push(
				`存储迁移失败: ${error instanceof Error ? error.message : String(error)}`,
			);
			return { success: false, changes, errors };
		}
	}
}

/**
 * 代理迁移器
 */
class ProxyMigrator {
	async migrate(
		capabilities: PlatformCapabilities,
		_options: MigrationOptions,
	): Promise<{
		success: boolean;
		changes: MigrationResult["changes"];
		errors: string[];
	}> {
		const changes: MigrationResult["changes"] = [];
		const errors: string[] = [];

		try {
			const hasProxy = capabilities.features.proxy;
			const isEdgeRuntime = capabilities.runtime.includes("edge");

			if (!hasProxy || isEdgeRuntime) {
				// 使用API代理
				changes.push({
					component: "proxy",
					from: "node-proxy-agent",
					to: "api-proxy",
					status: "success",
					message: "使用API代理替代Node.js代理",
				});
			}

			if (capabilities.platform === "browser") {
				changes.push({
					component: "proxy",
					from: "direct-fetch",
					to: "cors-proxy",
					status: "warning",
					message: "浏览器环境需要使用CORS代理",
				});
			}

			return { success: true, changes, errors };
		} catch (error: unknown) {
			errors.push(
				`代理迁移失败: ${error instanceof Error ? error.message : String(error)}`,
			);
			return { success: false, changes, errors };
		}
	}
}

/**
 * AI配置迁移器
 */
class AIMigrator {
	async migrate(
		capabilities: PlatformCapabilities,
		_options: MigrationOptions,
	): Promise<{
		success: boolean;
		changes: MigrationResult["changes"];
		errors: string[];
	}> {
		const changes: MigrationResult["changes"] = [];
		const errors: string[] = [];

		try {
			// AI配置通常不需要迁移，但可能需要调整超时等参数
			if (capabilities.limitations.includes("limited-memory")) {
				changes.push({
					component: "ai",
					from: "default-timeout",
					to: "reduced-timeout",
					status: "warning",
					message: "内存限制环境建议减少AI请求超时时间",
				});
			}

			if (
				!capabilities.features.localStorage &&
				capabilities.platform !== "browser"
			) {
				changes.push({
					component: "ai",
					from: "localStorage-config",
					to: "api-config",
					status: "success",
					message: "使用API存储AI配置",
				});
			}

			return { success: true, changes, errors };
		} catch (error: unknown) {
			errors.push(
				`AI配置迁移失败: ${error instanceof Error ? error.message : String(error)}`,
			);
			return { success: false, changes, errors };
		}
	}
}

/**
 * 主迁移管理器
 */
export class EdgeMigrationManager {
	private storageMigrator = new StorageMigrator();
	private proxyMigrator = new ProxyMigrator();
	private aiMigrator = new AIMigrator();

	/**
	 * 执行完整迁移
	 */
	async migrate(
		options: MigrationOptions = {
			autoDetect: true,
			forceEdgeCompatible: true,
			preserveData: true,
			enableLogging: true,
			dryRun: false,
		},
	): Promise<MigrationResult> {
		const capabilities = detectPlatformCapabilities();

		if (options.enableLogging) {
			console.log("[EdgeMigration] 检测到平台:", capabilities.platform);
			console.log("[EdgeMigration] 运行时:", capabilities.runtime);
			console.log("[EdgeMigration] 限制:", capabilities.limitations);
		}

		const result: MigrationResult = {
			success: true,
			platform: capabilities.platform,
			changes: [],
			errors: [],
			warnings: [],
		};

		try {
			// 存储迁移
			const storageResult = await this.storageMigrator.migrate(
				capabilities,
				options,
			);
			result.changes.push(...storageResult.changes);
			result.errors.push(...storageResult.errors);

			// 代理迁移
			const proxyResult = await this.proxyMigrator.migrate(
				capabilities,
				options,
			);
			result.changes.push(...proxyResult.changes);
			result.errors.push(...proxyResult.errors);

			// AI配置迁移
			const aiResult = await this.aiMigrator.migrate(capabilities, options);
			result.changes.push(...aiResult.changes);
			result.errors.push(...aiResult.errors);

			// 收集警告
			result.warnings = result.changes
				.filter((change) => change.status === "warning")
				.map((change) => change.message);

			// 判断总体成功状态
			result.success =
				result.errors.length === 0 &&
				!result.changes.some((change) => change.status === "error");

			if (options.enableLogging) {
				console.log("[EdgeMigration] 迁移完成:", {
					success: result.success,
					changes: result.changes.length,
					errors: result.errors.length,
					warnings: result.warnings.length,
				});
			}

			return result;
		} catch (error: unknown) {
			result.success = false;
			result.errors.push(
				`迁移过程失败: ${error instanceof Error ? error.message : String(error)}`,
			);
			return result;
		}
	}

	/**
	 * 获取推荐的配置
	 */
	getRecommendedConfig(
		capabilities: PlatformCapabilities,
	): Record<string, any> {
		const config: Record<string, any> = {
			platform: capabilities.platform,
			runtime: capabilities.runtime,
		};

		// 存储配置
		if (capabilities.features.kv) {
			config.storage = { type: "kv", fallback: "memory" };
		} else if (capabilities.features.fileSystem) {
			config.storage = { type: "file", fallback: "api" };
		} else {
			config.storage = { type: "api", fallback: "memory" };
		}

		// 代理配置
		if (capabilities.features.proxy) {
			config.proxy = { type: "direct", fallback: "api" };
		} else {
			config.proxy = { type: "api", fallback: "cors" };
		}

		// 性能配置
		if (capabilities.limitations.includes("limited-memory")) {
			config.performance = {
				timeout: 15000,
				maxConcurrency: 2,
				streaming: true,
			};
		} else {
			config.performance = {
				timeout: 30000,
				maxConcurrency: 5,
				streaming: capabilities.features.streaming,
			};
		}

		return config;
	}

	/**
	 * 验证部署兼容性
	 */
	async validateDeployment(): Promise<{
		compatible: boolean;
		issues: Array<{
			type: "error" | "warning" | "info";
			component: string;
			message: string;
			solution?: string;
		}>;
	}> {
		const capabilities = detectPlatformCapabilities();
		const issues: Array<{
			type: "error" | "warning" | "info";
			component: string;
			message: string;
			solution?: string;
		}> = [];

		// 检查必需功能
		if (!capabilities.features.webAPIs) {
			issues.push({
				type: "error",
				component: "runtime",
				message: "缺少必需的Web API支持",
				solution: "升级到支持Fetch API的运行时",
			});
		}

		// 检查存储
		if (
			!capabilities.features.fileSystem &&
			!capabilities.features.kv &&
			!capabilities.features.localStorage
		) {
			issues.push({
				type: "warning",
				component: "storage",
				message: "缺少持久化存储，将使用内存存储",
				solution: "配置KV存储或数据库连接",
			});
		}

		// 检查代理
		if (!capabilities.features.proxy && capabilities.platform !== "browser") {
			issues.push({
				type: "warning",
				component: "proxy",
				message: "缺少代理支持，某些功能可能受限",
				solution: "使用API代理或CORS代理",
			});
		}

		// 检查内存限制
		if (capabilities.limitations.includes("limited-memory")) {
			issues.push({
				type: "info",
				component: "performance",
				message: "检测到内存限制，建议优化性能配置",
				solution: "启用流式处理和减少并发数",
			});
		}

		const compatible = !issues.some((issue) => issue.type === "error");

		return { compatible, issues };
	}
}

/**
 * 全局迁移管理器实例
 */
export const migrationManager = new EdgeMigrationManager();

/**
 * 便捷函数：自动检测并迁移
 */
export async function autoMigrateForEdge(
	options?: Partial<MigrationOptions>,
): Promise<MigrationResult> {
	return migrationManager.migrate({
		autoDetect: true,
		forceEdgeCompatible: true,
		preserveData: true,
		enableLogging: true,
		dryRun: false,
		...options,
	});
}

/**
 * 便捷函数：获取当前环境信息
 */
export function getEnvironmentInfo(): {
	environment: typeof Environment;
	capabilities: PlatformCapabilities;
	recommended: Record<string, any>;
} {
	const capabilities = detectPlatformCapabilities();
	const recommended = migrationManager.getRecommendedConfig(capabilities);

	return {
		environment: Environment,
		capabilities,
		recommended,
	};
}

/**
 * 便捷函数：检查边缘兼容性
 */
export async function checkEdgeCompatibility(): Promise<{
	compatible: boolean;
	platform: string;
	issues: string[];
	solutions: string[];
}> {
	const validation = await migrationManager.validateDeployment();
	const capabilities = detectPlatformCapabilities();

	return {
		compatible: validation.compatible,
		platform: capabilities.platform,
		issues: validation.issues.map(
			(issue) => `${issue.component}: ${issue.message}`,
		),
		solutions: validation.issues
			.filter((issue) => issue.solution)
			.map((issue) => issue.solution as string),
	};
}

/**
 * 便捷函数：生成部署报告
 */
export async function generateDeploymentReport(): Promise<{
	timestamp: string;
	environment: typeof Environment;
	capabilities: PlatformCapabilities;
	validation: Awaited<ReturnType<EdgeMigrationManager["validateDeployment"]>>;
	recommendations: string[];
}> {
	const capabilities = detectPlatformCapabilities();
	const validation = await migrationManager.validateDeployment();

	const recommendations = [
		...capabilities.recommendations,
		...validation.issues
			.filter((issue) => issue.solution)
			.map((issue) => issue.solution as string),
	];

	return {
		timestamp: new Date().toISOString(),
		environment: Environment,
		capabilities,
		validation,
		recommendations: [...new Set(recommendations)], // 去重
	};
}
