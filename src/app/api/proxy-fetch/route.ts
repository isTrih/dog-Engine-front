import { type NextRequest, NextResponse } from "next/server";

// 边缘运行时检测
const isEdgeRuntime =
	(process.env?.VERCEL || '') ||
	(process.env?.CLOUDFLARE_WORKERS || '') ||
	(process.env?.EDGE_RUNTIME || '');

/**
 * 请求代理接口
 */
interface ProxyRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	timeout?: number;
}

/**
 * 验证URL是否安全
 */
function isUrlSafe(url: string): boolean {
	try {
		const parsedUrl = new URL(url);

		// 只允许HTTP和HTTPS协议
		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			return false;
		}

		// 禁止访问本地地址
		const hostname = parsedUrl.hostname.toLowerCase();
		const blockedHosts = [
			"localhost",
			"127.0.0.1",
			"0.0.0.0",
			"::1",
			"169.254.169.254", // AWS metadata
			"metadata.google.internal", // GCP metadata
		];

		if (blockedHosts.includes(hostname)) {
			return false;
		}

		// 禁止私有网络地址
		if (
			hostname.startsWith("10.") ||
			hostname.startsWith("192.168.") ||
			hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)
		) {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}

/**
 * 创建安全的请求头
 */
function createSafeHeaders(headers: Record<string, string> = {}): HeadersInit {
	const safeHeaders: Record<string, string> = {
		"User-Agent": "Mozilla/5.0 (compatible; EdgeProxy/1.0)",
		Accept: "*/*",
		"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		"Cache-Control": "no-cache",
		Pragma: "no-cache",
	};

	// 允许的请求头白名单
	const allowedHeaders = [
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
	];

	// 只添加安全的请求头
	for (const [key, value] of Object.entries(headers)) {
		const lowerKey = key.toLowerCase();
		if (allowedHeaders.includes(lowerKey) && typeof value === "string") {
			safeHeaders[key] = value;
		}
	}

	return safeHeaders;
}

/**
 * 处理代理请求
 */
async function handleProxyRequest(proxyReq: ProxyRequest): Promise<Response> {
	const { url, method = "GET", headers = {}, body, timeout = 30000 } = proxyReq;

	// 验证URL安全性
	if (!isUrlSafe(url)) {
		throw new Error("不安全的请求URL");
	}

	// 创建请求配置
	const requestInit: RequestInit = {
		method: method.toUpperCase(),
		headers: createSafeHeaders(headers),
		signal: AbortSignal.timeout(timeout),
	};

	// 添加请求体（仅对非GET请求）
	if (body && method.toUpperCase() !== "GET") {
		requestInit.body = body;
	}

	console.log(`[proxy-fetch] ${method} ${url}`);

	try {
		const response = await fetch(url, requestInit);

		// 创建响应头（过滤不安全的头）
		const responseHeaders = new Headers();
		const allowedResponseHeaders = [
			"content-type",
			"content-length",
			"content-encoding",
			"cache-control",
			"expires",
			"last-modified",
			"etag",
		];

		for (const [key, value] of response.headers.entries()) {
			if (allowedResponseHeaders.includes(key.toLowerCase())) {
				responseHeaders.set(key, value);
			}
		}

		// 添加CORS头
		responseHeaders.set("Access-Control-Allow-Origin", "*");
		responseHeaders.set(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, OPTIONS",
		);
		responseHeaders.set(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization",
		);

		console.log(`[proxy-fetch] ${method} ${url} -> ${response.status}`);

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders,
		});
	} catch (error: any) {
		console.error(`[proxy-fetch] ${method} ${url} failed:`, error);

		if (error.name === "AbortError") {
			throw new Error(`请求超时 (${timeout}ms)`);
		}

		throw error;
	}
}

/**
 * POST - 执行代理请求
 */
export async function POST(request: NextRequest) {
	const logPrefix = "[API/proxy-fetch][POST]";

	try {
		const body = await request.json();

		// 验证请求格式
		if (!body || typeof body !== "object") {
			return NextResponse.json(
				{
					success: false,
					error: "请求格式错误",
					message: "请求体必须是JSON对象",
				},
				{ status: 400 },
			);
		}

		const { url } = body;
		if (!url || typeof url !== "string") {
			return NextResponse.json(
				{
					success: false,
					error: "URL参数错误",
					message: "url字段是必需的字符串",
				},
				{ status: 400 },
			);
		}

		console.log(`${logPrefix} 代理请求: ${body.method || "GET"} ${url}`);

		// 执行代理请求
		const response = await handleProxyRequest(body as ProxyRequest);

		return response;
	} catch (error: any) {
		console.error(`${logPrefix} 代理请求失败:`, error);

		const errorMessage = error.message || "代理请求失败";
		const statusCode = errorMessage.includes("超时")
			? 408
			: errorMessage.includes("不安全")
				? 403
				: 500;

		return NextResponse.json(
			{
				success: false,
				error: "代理请求失败",
				message: errorMessage,
				timestamp: new Date().toISOString(),
				runtime: isEdgeRuntime ? "edge" : "nodejs",
			},
			{ status: statusCode },
		);
	}
}

/**
 * GET - 简单的代理请求（通过URL参数）
 */
export async function GET(request: NextRequest) {
	const logPrefix = "[API/proxy-fetch][GET]";

	try {
		const { searchParams } = new URL(request.url);
		const url = searchParams.get("url");

		if (!url) {
			return NextResponse.json(
				{
					success: false,
					error: "URL参数缺失",
					message: "需要提供url查询参数",
				},
				{ status: 400 },
			);
		}

		console.log(`${logPrefix} 简单代理请求: GET ${url}`);

		// 构造代理请求
		const proxyReq: ProxyRequest = {
			url,
			method: "GET",
			headers: {
				Referer: request.headers.get("referer") || "",
				"User-Agent": request.headers.get("user-agent") || "",
			},
		};

		const response = await handleProxyRequest(proxyReq);
		return response;
	} catch (error: any) {
		console.error(`${logPrefix} 简单代理请求失败:`, error);

		const errorMessage = error.message || "代理请求失败";
		const statusCode = errorMessage.includes("超时")
			? 408
			: errorMessage.includes("不安全")
				? 403
				: 500;

		return NextResponse.json(
			{
				success: false,
				error: "代理请求失败",
				message: errorMessage,
				timestamp: new Date().toISOString(),
			},
			{ status: statusCode },
		);
	}
}

/**
 * OPTIONS - 处理CORS预检请求
 */
export async function OPTIONS() {
	return new Response(null, {
		status: 200,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
			"Access-Control-Max-Age": "86400",
		},
	});
}
