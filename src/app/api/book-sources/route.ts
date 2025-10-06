import { type NextRequest, NextResponse } from "next/server";
import type { BookSource } from "@/lib/types";

// 边缘运行时检测
const isEdgeRuntime =
	(process.env?.VERCEL || '') ||
	(process.env?.CLOUDFLARE_WORKERS || '') ||
	(process.env?.EDGE_RUNTIME || '');

// 默认书源数据（作为备用）
const DEFAULT_BOOK_SOURCES: BookSource[] = [];

/**
 * 从外部存储获取书源
 */
async function getBookSourcesFromStorage(): Promise<BookSource[]> {
	try {
		// 尝试从KV存储获取（Cloudflare Workers）
		if (
			(process.env?.CLOUDFLARE_WORKERS || '') &&
			typeof globalThis !== "undefined" &&
			"BOOK_SOURCES_KV" in globalThis
		) {
			// @ts-expect-error - Cloudflare Workers KV
			const data = await globalThis.BOOK_SOURCES_KV.get("book-sources");
			if (data) {
				return JSON.parse(data);
			}
		}

		// 尝试从数据库获取（如果配置了数据库连接）
		if ((process.env?.DATABASE_URL || '')) {
			// 这里可以添加数据库查询逻辑
			console.log("[book-sources-api] 数据库连接已配置，但查询逻辑未实现");
		}

		// 尝试从静态文件获取
		const response = await fetch(
			`${(process.env?.NEXT_PUBLIC_BASE_URL || '') || "http://localhost:3000"}/book_sources.json`,
		);
		if (response.ok) {
			const sources = await response.json();
			return Array.isArray(sources) ? sources : [];
		}

		console.warn("[book-sources-api] 无法从任何存储获取书源，返回空数组");
		return DEFAULT_BOOK_SOURCES;
	} catch (error) {
		console.error("[book-sources-api] 获取书源失败:", error);
		return DEFAULT_BOOK_SOURCES;
	}
}

/**
 * 保存书源到外部存储
 */
async function saveBookSourcesToStorage(
	sources: BookSource[],
): Promise<boolean> {
	try {
		// 保存到KV存储（Cloudflare Workers）
		if (
			(process.env?.CLOUDFLARE_WORKERS || '') &&
			typeof globalThis !== "undefined" &&
			"BOOK_SOURCES_KV" in globalThis
		) {
			// @ts-expect-error - Cloudflare Workers KV
			await globalThis.BOOK_SOURCES_KV.put(
				"book-sources",
				JSON.stringify(sources, null, 2),
			);
			console.log(`[book-sources-api] 已保存 ${sources.length} 个书源到KV存储`);
			return true;
		}

		// 保存到数据库（如果配置了数据库连接）
		if ((process.env?.DATABASE_URL || '')) {
			// 这里可以添加数据库保存逻辑
			console.log("[book-sources-api] 数据库连接已配置，但保存逻辑未实现");
			return false;
		}

		// 边缘运行时中无法写入文件系统
		if (isEdgeRuntime) {
			console.warn("[book-sources-api] 边缘运行时中无法持久化保存，仅内存存储");
			return false;
		}

		// 在服务器环境中尝试写入文件
		const fs = await import("fs/promises");
		const path = await import("path");

		const filePath = path.join(process.cwd(), "book_sources.json");
		await fs.writeFile(filePath, JSON.stringify(sources, null, 2), "utf-8");
		console.log(`[book-sources-api] 已保存 ${sources.length} 个书源到文件`);
		return true;
	} catch (error) {
		console.error("[book-sources-api] 保存书源失败:", error);
		return false;
	}
}

/**
 * 验证书源数据格式
 */
function validateBookSource(source: unknown): source is BookSource {
	if (typeof source !== "object" || source === null) {
		return false;
	}

	const s = source as Record<string, unknown>;
	return (
		typeof s.id === "string" &&
		typeof s.name === "string" &&
		typeof s.url === "string" &&
		s.name.toString().trim() !== "" &&
		s.url.toString().trim() !== ""
	);
}

/**
 * GET - 获取书源列表
 */
export async function GET(_request: NextRequest) {
	const logPrefix = "[API/book-sources][GET]";

	try {
		console.log(`${logPrefix} 获取书源列表`);

		const sources = await getBookSourcesFromStorage();
		const validSources = sources.filter(validateBookSource);

		console.log(`${logPrefix} 返回 ${validSources.length} 个有效书源`);

		return NextResponse.json({
			success: true,
			sources: validSources,
			count: validSources.length,
			timestamp: new Date().toISOString(),
			runtime: isEdgeRuntime ? "edge" : "nodejs",
		});
	} catch (error: unknown) {
		console.error(`${logPrefix} 获取书源失败:`, error);

		return NextResponse.json(
			{
				success: false,
				error: "获取书源列表失败",
				message: error instanceof Error ? error.message : "未知错误",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}

/**
 * POST - 保存书源列表
 */
export async function POST(request: NextRequest) {
	const logPrefix = "[API/book-sources][POST]";

	try {
		const body = await request.json();
		const { sources } = body;

		if (!Array.isArray(sources)) {
			return NextResponse.json(
				{
					success: false,
					error: "请求格式错误",
					message: "sources字段必须是数组",
				},
				{ status: 400 },
			);
		}

		// 验证所有书源
		const validSources = sources.filter(validateBookSource);
		const invalidCount = sources.length - validSources.length;

		if (invalidCount > 0) {
			console.warn(`${logPrefix} 跳过 ${invalidCount} 个无效书源`);
		}

		console.log(`${logPrefix} 尝试保存 ${validSources.length} 个书源`);

		const saveSuccess = await saveBookSourcesToStorage(validSources);

		if (saveSuccess) {
			console.log(`${logPrefix} 成功保存 ${validSources.length} 个书源`);

			return NextResponse.json({
				success: true,
				message: "书源保存成功",
				saved: validSources.length,
				skipped: invalidCount,
				timestamp: new Date().toISOString(),
			});
		} else {
			console.error(`${logPrefix} 保存书源失败`);

			return NextResponse.json(
				{
					success: false,
					error: "保存书源失败",
					message: "无法写入存储",
					processed: validSources.length,
					skipped: invalidCount,
				},
				{ status: 500 },
			);
		}
	} catch (error: unknown) {
		console.error(`${logPrefix} 处理请求失败:`, error);

		return NextResponse.json(
			{
				success: false,
				error: "处理请求失败",
				message: error instanceof Error ? error.message : "未知错误",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}

/**
 * PUT - 更新单个书源
 */
export async function PUT(request: NextRequest) {
	const logPrefix = "[API/book-sources][PUT]";

	try {
		const body = await request.json();
		const { id, source } = body;

		if (!id || !source) {
			return NextResponse.json(
				{
					success: false,
					error: "请求格式错误",
					message: "需要id和source字段",
				},
				{ status: 400 },
			);
		}

		if (!validateBookSource(source)) {
			return NextResponse.json(
				{
					success: false,
					error: "书源格式错误",
					message: "书源数据不完整或格式不正确",
				},
				{ status: 400 },
			);
		}

		console.log(`${logPrefix} 更新书源: ${id}`);

		const sources = await getBookSourcesFromStorage();
		const sourceIndex = sources.findIndex((s) => s.id === id);

		if (sourceIndex === -1) {
			return NextResponse.json(
				{
					success: false,
					error: "书源不存在",
					message: `找不到ID为 ${id} 的书源`,
				},
				{ status: 404 },
			);
		}

		sources[sourceIndex] = { ...source, id }; // 确保ID不变
		const saveSuccess = await saveBookSourcesToStorage(sources);

		if (saveSuccess) {
			console.log(`${logPrefix} 成功更新书源: ${id}`);

			return NextResponse.json({
				success: true,
				message: "书源更新成功",
				source: sources[sourceIndex],
				timestamp: new Date().toISOString(),
			});
		} else {
			return NextResponse.json(
				{
					success: false,
					error: "更新书源失败",
					message: "无法保存到存储",
				},
				{ status: 500 },
			);
		}
	} catch (error: unknown) {
		console.error(`${logPrefix} 更新书源失败:`, error);

		return NextResponse.json(
			{
				success: false,
				error: "更新书源失败",
				message: error instanceof Error ? error.message : "未知错误",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}

/**
 * DELETE - 删除书源
 */
export async function DELETE(request: NextRequest) {
	const logPrefix = "[API/book-sources][DELETE]";

	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");

		if (!id) {
			return NextResponse.json(
				{
					success: false,
					error: "请求参数错误",
					message: "需要提供书源ID",
				},
				{ status: 400 },
			);
		}

		console.log(`${logPrefix} 删除书源: ${id}`);

		const sources = await getBookSourcesFromStorage();
		const sourceIndex = sources.findIndex((s) => s.id === id);

		if (sourceIndex === -1) {
			return NextResponse.json(
				{
					success: false,
					error: "书源不存在",
					message: `找不到ID为 ${id} 的书源`,
				},
				{ status: 404 },
			);
		}

		const deletedSource = sources.splice(sourceIndex, 1)[0];
		const saveSuccess = await saveBookSourcesToStorage(sources);

		if (saveSuccess) {
			console.log(`${logPrefix} 成功删除书源: ${id}`);

			return NextResponse.json({
				success: true,
				message: "书源删除成功",
				deleted: deletedSource,
				remaining: sources.length,
				timestamp: new Date().toISOString(),
			});
		} else {
			return NextResponse.json(
				{
					success: false,
					error: "删除书源失败",
					message: "无法保存到存储",
				},
				{ status: 500 },
			);
		}
	} catch (error: unknown) {
		console.error(`${logPrefix} 删除书源失败:`, error);

		return NextResponse.json(
			{
				success: false,
				error: "删除书源失败",
				message: error instanceof Error ? error.message : "未知错误",
				timestamp: new Date().toISOString(),
			},
			{ status: 500 },
		);
	}
}
