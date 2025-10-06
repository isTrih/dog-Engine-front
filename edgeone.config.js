/**
 * EdgeOne平台专用部署配置
 * 腾讯云EdgeOne边缘计算平台优化配置
 */

module.exports = {
	// EdgeOne平台标识
	platform: "edgeone",

	// 运行时配置
	runtime: {
		type: "edge",
		version: "1.0",
		memory: 128, // MB
		timeout: 30, // 秒
		regions: ["ap-guangzhou", "ap-shanghai", "ap-beijing"], // 边缘节点区域
	},

	// 存储配置 - 使用客户端数据库
	storage: {
		primary: "client-database",
		fallback: "memory",
		config: {
			indexedDB: {
				enabled: true,
				dbName: "DogEngineDB",
				version: 1,
				stores: [
					"bookSources",
					"aiConfig",
					"userSettings",
					"bookData",
					"readingProgress",
				],
			},
			localStorage: {
				enabled: true,
				prefix: "dog-engine-",
				maxSize: "5MB", // localStorage限制
			},
		},
	},

	// 网络配置
	network: {
		// 代理配置
		proxy: {
			enabled: true,
			type: "api-proxy", // 使用API代理替代Node.js代理
			endpoint: "/api/proxy-fetch",
			timeout: 30000,
			retries: 2,
		},

		// CORS配置
		cors: {
			enabled: true,
			origins: ["*"],
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			headers: ["Content-Type", "Authorization", "X-Requested-With"],
		},

		// 请求限制
		rateLimit: {
			enabled: true,
			requests: 1000, // 每分钟请求数
			burst: 50, // 突发请求数
		},
	},

	// 安全配置
	security: {
		// 内容安全策略
		csp: {
			enabled: true,
			directives: {
				"default-src": ["'self'"],
				"script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
				"style-src": ["'self'", "'unsafe-inline'"],
				"img-src": ["'self'", "data:", "https:"],
				"connect-src": ["'self'", "https:", "wss:"],
				"font-src": ["'self'", "data:"],
				"media-src": ["'self'"],
				"object-src": ["'none'"],
				"frame-src": ["'none'"],
			},
		},

		// URL验证
		urlValidation: {
			enabled: true,
			allowedProtocols: ["http", "https"],
			blockedHosts: [
				"localhost",
				"127.0.0.1",
				"0.0.0.0",
				"::1",
				"169.254.169.254", // AWS metadata
				"metadata.google.internal", // GCP metadata
			],
			blockedNetworks: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
		},

		// 请求头过滤
		headerFilter: {
			enabled: true,
			allowedRequestHeaders: [
				"accept",
				"accept-language",
				"authorization",
				"cache-control",
				"content-type",
				"cookie",
				"origin",
				"referer",
				"user-agent",
				"x-requested-with",
			],
			allowedResponseHeaders: [
				"content-type",
				"content-length",
				"content-encoding",
				"cache-control",
				"expires",
				"last-modified",
				"etag",
			],
		},
	},

	// 性能优化
	performance: {
		// 缓存配置
		cache: {
			enabled: true,
			strategies: {
				bookSources: {
					type: "stale-while-revalidate",
					ttl: 3600, // 1小时
					staleTime: 86400, // 24小时
				},
				aiConfig: {
					type: "no-cache",
				},
				staticAssets: {
					type: "cache-first",
					ttl: 2592000, // 30天
				},
			},
		},

		// 压缩配置
		compression: {
			enabled: true,
			algorithms: ["gzip", "brotli"],
			threshold: 1024, // 1KB以上才压缩
			level: 6, // 压缩级别 1-9
		},

		// 流式处理
		streaming: {
			enabled: true,
			chunkSize: 8192, // 8KB
			bufferSize: 65536, // 64KB
		},

		// 内存优化
		memory: {
			gcInterval: 30000, // 30秒GC一次
			maxHeapSize: 100, // MB
			maxConcurrency: 10, // 最大并发数
		},
	},

	// 功能配置
	features: {
		// AI功能
		ai: {
			enabled: true,
			providers: ["siliconflow", "openai", "zhipu", "moonshot"],
			defaultProvider: "siliconflow",
			timeout: 30000,
			maxTokens: 4096,
			streaming: true,
		},

		// 书源功能
		bookSources: {
			enabled: true,
			maxSources: 1000,
			validation: true,
			autoImport: true,
			backup: true,
		},

		// 阅读功能
		reading: {
			enabled: true,
			progressTracking: true,
			bookmarks: true,
			notes: true,
			sync: false, // EdgeOne环境不支持云同步
		},

		// 社区功能
		community: {
			enabled: true,
			maxPrompts: 100,
			sharing: true,
			moderation: true,
		},
	},

	// 环境变量映射
	environment: {
		production: {
			NODE_ENV: "production",
			EDGE_RUNTIME: "edgeone",
			EDGEONE: "1",
			TENCENT_CLOUD_EDGE: "1",
			// EdgeOne特定环境变量
			EDGEONE_REGION: process.env.EDGEONE_REGION || "ap-guangzhou",
			EDGEONE_ZONE_ID: process.env.EDGEONE_ZONE_ID,
			EDGEONE_API_TOKEN: process.env.EDGEONE_API_TOKEN,
		},
		development: {
			NODE_ENV: "development",
			EDGE_RUNTIME: "edgeone",
			DEBUG: "1",
		},
	},

	// 构建配置
	build: {
		target: "es2020",
		format: "esm",
		minify: true,
		sourcemap: false,

		// 代码分割
		splitting: {
			enabled: true,
			chunks: {
				common: ["react", "react-dom"],
				ai: ["ai-client", "gemini-client"],
				bookSources: ["book-source-*"],
				ui: ["components/**"],
			},
		},

		// 树摇优化
		treeShaking: {
			enabled: true,
			sideEffects: false,
		},

		// 资源优化
		assets: {
			inlineLimit: 4096, // 4KB以下内联
			assetsDir: "assets",
			publicPath: "/",
		},
	},

	// 路由配置
	routes: {
		// API路由配置为边缘函数
		api: {
			runtime: "edge",
			regions: ["ap-guangzhou", "ap-shanghai", "ap-beijing"],
			routes: {
				"/api/book-sources": {
					methods: ["GET", "POST", "PUT", "DELETE"],
					timeout: 30,
					memory: 128,
				},
				"/api/proxy-fetch": {
					methods: ["GET", "POST", "OPTIONS"],
					timeout: 60,
					memory: 256,
				},
				"/api/test-proxy": {
					methods: ["GET"],
					timeout: 10,
					memory: 64,
				},
				"/api/bookstore/ai-detector": {
					methods: ["POST"],
					timeout: 30,
					memory: 128,
				},
			},
		},

		// 静态资源路由
		static: {
			"/book_sources.json": {
				cache: "public, max-age=3600",
			},
			"/_next/static/**": {
				cache: "public, max-age=31536000, immutable",
			},
			"/favicon.ico": {
				cache: "public, max-age=86400",
			},
		},

		// 页面路由
		pages: {
			"/": {
				prerender: false,
				ssr: true,
			},
			"/books/**": {
				prerender: false,
				ssr: true,
			},
			"/bookstore/**": {
				prerender: false,
				ssr: true,
			},
		},
	},

	// 监控配置
	monitoring: {
		// 日志配置
		logging: {
			enabled: true,
			level: "info",
			format: "json",
			fields: ["timestamp", "level", "message", "region", "requestId"],

			// EdgeOne日志服务
			destination: {
				type: "edgeone-cls", // 腾讯云日志服务
				project: process.env.CLS_PROJECT_ID,
				logset: process.env.CLS_LOGSET_ID,
				topic: process.env.CLS_TOPIC_ID,
			},
		},

		// 指标收集
		metrics: {
			enabled: true,
			collect: ["requests", "errors", "latency", "memory", "cpu"],
			interval: 60, // 秒

			// EdgeOne监控服务
			destination: {
				type: "edgeone-monitor",
				namespace: "EdgeFunction",
				region: process.env.EDGEONE_REGION,
			},
		},

		// 错误追踪
		errorTracking: {
			enabled: true,
			sampleRate: 1.0,
			maxErrors: 100,

			// 错误上报
			destination: {
				type: "edgeone-error-report",
				endpoint: process.env.ERROR_REPORT_ENDPOINT,
			},
		},
	},

	// 健康检查
	healthCheck: {
		enabled: true,
		path: "/api/health",
		interval: 30, // 秒
		timeout: 5, // 秒
		checks: [
			"storage-connection",
			"ai-provider-availability",
			"memory-usage",
			"response-time",
		],
	},

	// 备份和恢复
	backup: {
		enabled: true,
		strategy: "client-export",
		schedule: "manual", // EdgeOne环境手动备份
		retention: 30, // 天

		// 数据导出格式
		format: {
			type: "json",
			compression: "gzip",
			encryption: false, // 客户端加密
		},
	},

	// 开发工具
	devTools: {
		enabled: process.env.NODE_ENV === "development",

		// 热重载
		hotReload: {
			enabled: true,
			port: 9002,
		},

		// 调试工具
		debug: {
			enabled: true,
			panels: ["storage", "network", "performance", "ai"],
		},

		// 模拟数据
		mockData: {
			enabled: true,
			bookSources: true,
			aiResponses: true,
		},
	},
};
