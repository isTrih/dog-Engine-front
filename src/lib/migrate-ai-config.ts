/**
 * @fileOverview AI配置迁移工具
 * 从旧的Gemini配置迁移到新的通用AI配置
 */

import { type AIConfig, getAIConfig, saveAIConfig } from "./ai-client";

/**
 * 检查是否存在旧的Gemini配置
 */
export function hasLegacyGeminiConfig(): boolean {
	if (typeof window === "undefined") return false;
	return !!localStorage.getItem("gemini-api-key");
}

/**
 * 获取旧的Gemini配置
 */
export function getLegacyGeminiConfig(): {
	apiKey: string;
	model?: string;
} | null {
	if (typeof window === "undefined") return null;

	const apiKey = localStorage.getItem("gemini-api-key");
	if (!apiKey) return null;

	// 尝试获取保存的模型设置
	const savedSettings = localStorage.getItem("gemini-settings");
	let model = "gemini-2.5-flash"; // 默认模型

	if (savedSettings) {
		try {
			const settings = JSON.parse(savedSettings);
			model = settings.model || model;
		} catch {
			// 忽略解析错误，使用默认值
		}
	}

	return { apiKey, model };
}

/**
 * 将Gemini配置转换为通用AI配置
 */
export function convertGeminiToAIConfig(geminiConfig: {
	apiKey: string;
	model?: string;
}): AIConfig {
	// 创建一个临时的Gemini提供商配置
	const geminiProvider = {
		id: "gemini",
		name: "Google Gemini",
		baseURL: "https://generativelanguage.googleapis.com/v1beta",
		defaultModel: "gemini-2.5-flash",
	};

	// 将模型名称映射到新格式
	const modelMapping: Record<string, string> = {
		"gemini-pro": "gemini-1.5-pro",
		"gemini-pro-vision": "gemini-1.5-pro",
		"gemini-flash": "gemini-2.5-flash",
		"gemini-2.5-flash": "gemini-2.5-flash",
		"gemini-2.5-pro": "gemini-2.5-pro",
	};

	const mappedModel =
		modelMapping[geminiConfig.model || ""] ||
		geminiConfig.model ||
		geminiProvider.defaultModel;

	return {
		providerId: "gemini",
		apiKey: geminiConfig.apiKey,
		baseURL: geminiProvider.baseURL,
		model: mappedModel,
	};
}

/**
 * 执行迁移
 */
export function migrateGeminiConfig(): boolean {
	try {
		// 检查是否已经有新配置
		const existingConfig = getAIConfig();
		if (existingConfig) {
			console.log("AI配置已存在，跳过迁移");
			return false;
		}

		// 获取旧配置
		const legacyConfig = getLegacyGeminiConfig();
		if (!legacyConfig) {
			console.log("未找到Gemini配置，跳过迁移");
			return false;
		}

		// 转换并保存新配置
		const newConfig = convertGeminiToAIConfig(legacyConfig);
		saveAIConfig(newConfig);

		console.log("Gemini配置迁移完成:", newConfig);
		return true;
	} catch (error) {
		console.error("迁移Gemini配置失败:", error);
		return false;
	}
}

/**
 * 清理旧的Gemini配置
 * 注意：只有在确认新配置工作正常后才调用此函数
 */
export function cleanupLegacyGeminiConfig(): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.removeItem("gemini-api-key");
		localStorage.removeItem("gemini-settings");
		localStorage.removeItem("gemini-debug");
		localStorage.removeItem("gemini-timeout-ms");
		localStorage.removeItem("gemini-retries");
		localStorage.removeItem("gemini-safety");

		console.log("旧的Gemini配置已清理");
	} catch (error) {
		console.error("清理旧配置失败:", error);
	}
}

/**
 * 自动迁移检查
 * 在应用启动时调用，自动检测并提示用户迁移
 */
export function checkAndPromptMigration(): {
	needsMigration: boolean;
	canMigrate: boolean;
	legacyConfig?: { apiKey: string; model?: string };
} {
	const needsMigration = hasLegacyGeminiConfig();
	const existingConfig = getAIConfig();
	const canMigrate = needsMigration && !existingConfig;
	const legacyConfig = needsMigration ? getLegacyGeminiConfig() : undefined;

	return {
		needsMigration,
		canMigrate,
		legacyConfig: legacyConfig || undefined,
	};
}

/**
 * 批量迁移所有相关设置
 */
export function migrateAllGeminiSettings(): {
	success: boolean;
	migratedItems: string[];
	errors: string[];
} {
	const migratedItems: string[] = [];
	const errors: string[] = [];

	try {
		// 迁移主配置
		if (migrateGeminiConfig()) {
			migratedItems.push("API配置");
		}

		// 迁移调试设置
		if (typeof window !== "undefined") {
			const debugSetting = localStorage.getItem("gemini-debug");
			if (debugSetting) {
				localStorage.setItem("ai-debug", debugSetting);
				migratedItems.push("调试设置");
			}

			// 迁移超时设置
			const timeoutSetting = localStorage.getItem("gemini-timeout-ms");
			if (timeoutSetting) {
				localStorage.setItem("ai-timeout-ms", timeoutSetting);
				migratedItems.push("超时设置");
			}

			// 迁移重试设置
			const retrySetting = localStorage.getItem("gemini-retries");
			if (retrySetting) {
				localStorage.setItem("ai-retries", retrySetting);
				migratedItems.push("重试设置");
			}
		}

		return {
			success: migratedItems.length > 0,
			migratedItems,
			errors,
		};
	} catch (error) {
		errors.push(
			`迁移失败: ${error instanceof Error ? error.message : String(error)}`,
		);
		return {
			success: false,
			migratedItems,
			errors,
		};
	}
}
