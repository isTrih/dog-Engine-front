/**
 * @fileOverview 新版AI处理器，替换原来的genkit实现
 * 使用统一的ai-client.ts支持多个AI提供商
 */

import { z } from "zod";
import {
	generateContent,
	generateContentStream,
	getCurrentModel,
	hasAIConfig,
} from "@/lib/ai-client";

/**
 * AI实例，提供统一的接口
 */
export const ai = {
	/**
	 * 定义提示模板（兼容genkit接口）
	 */
	definePrompt: (config: {
		name: string;
		input: { schema: any };
		output?: { schema: any };
		prompt: string;
	}) => {
		return async (
			data: any,
			options?: {
				model?: string;
				config?: {
					temperature?: number;
					maxOutputTokens?: number;
					thinkingConfig?: {
						includeThoughts?: boolean;
						thinkingBudget?: number;
					};
					safetySettings?: Array<{
						category: string;
						threshold: string;
					}>;
				};
			},
		) => {
			// 处理模板字符串，替换占位符
			let processedPrompt = config.prompt;

			// 处理条件块 {{#if variable}}...{{/if}}
			processedPrompt = processedPrompt.replace(
				/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
				(match, varName, content) => {
					return data[varName] ? content : "";
				},
			);

			// 处理变量替换 {{variable}} 和 {{{variable}}}
			processedPrompt = processedPrompt.replace(
				/\{\{\{?(\w+)\}?\}\}/g,
				(match, varName) => {
					return data[varName] || "";
				},
			);

			const model =
				options?.model?.replace("googleai/", "") || getCurrentModel();
			const temperature = options?.config?.temperature ?? 0.7;
			const maxOutputTokens = options?.config?.maxOutputTokens ?? 2048;

			// 构建系统指令（如果有的话）
			const systemInstruction = "";

			try {
				const result = await generateContent(model, processedPrompt, {
					temperature,
					maxOutputTokens,
					systemInstruction: systemInstruction || undefined,
				});

				// 如果有输出schema，尝试解析JSON
				if (config.output?.schema) {
					try {
						const parsed = JSON.parse(result);
						return { output: parsed };
					} catch {
						// 如果解析失败，返回文本结果
						return { text: result };
					}
				}

				return { text: result };
			} catch (error) {
				console.error(`[AI][${config.name}] 生成失败:`, error);
				throw error;
			}
		};
	},

	/**
	 * 定义流程（兼容genkit接口）
	 */
	defineFlow: (
		config: {
			name: string;
			inputSchema: any;
			outputSchema: any;
		},
		handler: (input: any) => Promise<any>,
	) => {
		return async (input: any) => {
			try {
				return await handler(input);
			} catch (error) {
				console.error(`[AI][${config.name}] 流程执行失败:`, error);
				throw error;
			}
		};
	},

	/**
	 * 检查AI配置是否可用
	 */
	isConfigured: () => {
		return hasAIConfig();
	},

	/**
	 * 获取当前模型
	 */
	getCurrentModel: () => {
		return getCurrentModel();
	},

	/**
	 * 直接生成内容的便捷方法
	 */
	generate: async (
		prompt: string,
		options?: {
			model?: string;
			temperature?: number;
			maxOutputTokens?: number;
			systemInstruction?: string;
		},
	) => {
		const model = options?.model?.replace("googleai/", "") || getCurrentModel();
		return await generateContent(model, prompt, options);
	},

	/**
	 * 流式生成内容的便捷方法
	 */
	generateStream: async function* (
		prompt: string,
		options?: {
			model?: string;
			temperature?: number;
			maxOutputTokens?: number;
			systemInstruction?: string;
		},
	) {
		const model = options?.model?.replace("googleai/", "") || getCurrentModel();
		yield* generateContentStream(model, prompt, options);
	},
};

/**
 * 导出兼容接口
 */
export { ai as genkit, z };
export default ai;
