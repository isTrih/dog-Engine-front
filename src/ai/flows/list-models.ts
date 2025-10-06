"use server";

/**
 * @fileOverview 使用新版AI客户端获取可用的AI模型列表
 */

import {
	AI_PROVIDERS,
	fetchSiliconFlowModels,
	getAIConfig,
	getCurrentProvider,
} from "@/lib/ai-client";

export interface Model {
	id: string;
	name: string;
	displayName?: string;
	description?: string;
}

/**
 * 获取当前AI提供商的模型列表
 */
export async function listModels(): Promise<Model[]> {
	try {
		const config = getAIConfig();
		const provider = getCurrentProvider();

		if (!config || !provider) {
			console.warn("AI配置未设置，返回默认模型列表");
			return getDefaultModels();
		}

		// 如果是硅基流动，尝试获取实时模型列表
		if (provider.id === "siliconflow" && config.apiKey) {
			try {
				const siliconModels = await fetchSiliconFlowModels(config.apiKey);
				return siliconModels.map((model) => ({
					id: model.id,
					name: model.id.split("/").pop() || model.id,
					displayName: model.id,
					description: `模型: ${model.id}`,
				}));
			} catch (error) {
				console.warn("获取硅基流动模型列表失败，使用预定义列表:", error);
			}
		}

		// 使用提供商的预定义模型列表
		return provider.models.map((model) => ({
			id: model.id,
			name: model.name,
			displayName: model.name,
			description: model.description,
		}));
	} catch (error) {
		console.error("获取模型列表失败:", error);
		return getDefaultModels();
	}
}

/**
 * 获取默认模型列表（当配置不可用时）
 */
function getDefaultModels(): Model[] {
	return [
		{
			id: "deepseek-ai/DeepSeek-V3.1",
			name: "DeepSeek V3.1",
			displayName: "DeepSeek V3.1",
			description: "最新的DeepSeek模型",
		},
		{
			id: "deepseek-ai/DeepSeek-V2.5",
			name: "DeepSeek V2.5",
			displayName: "DeepSeek V2.5",
			description: "DeepSeek V2.5模型",
		},
		{
			id: "Qwen/Qwen2.5-72B-Instruct",
			name: "Qwen 2.5 72B",
			displayName: "Qwen 2.5 72B",
			description: "阿里巴巴通义千问模型",
		},
		{
			id: "gpt-4o-mini",
			name: "GPT-4o Mini",
			displayName: "GPT-4o Mini",
			description: "OpenAI GPT-4o Mini模型",
		},
	];
}

/**
 * 获取模型的显示名称
 */
export async function getModelDisplayName(modelId: string): Promise<string> {
	// 移除提供商前缀（如果存在）
	const cleanId = modelId.replace(/^googleai\//, "");

	// 简化显示名称
	const nameMap: Record<string, string> = {
		"gemini-2.5-flash": "Gemini 2.5 Flash",
		"gemini-2.5-pro": "Gemini 2.5 Pro",
		"gemini-1.5-flash": "Gemini 1.5 Flash",
		"gemini-1.5-pro": "Gemini 1.5 Pro",
		"deepseek-ai/DeepSeek-V3.1": "DeepSeek V3.1",
		"deepseek-ai/DeepSeek-V2.5": "DeepSeek V2.5",
		"Qwen/Qwen2.5-72B-Instruct": "Qwen 2.5 72B",
		"gpt-4o": "GPT-4o",
		"gpt-4o-mini": "GPT-4o Mini",
	};

	return nameMap[cleanId] || nameMap[modelId] || cleanId;
}
