/**
 * @fileOverview 通用AI客户端，支持OpenAI API格式的所有提供商
 * 包括OpenAI、硅基流动、智谱AI、月之暗面等
 */

// AI提供商配置
export interface AIProvider {
	id: string;
	name: string;
	baseURL: string;
	defaultModel: string;
	models: AIModel[];
}

export interface AIModel {
	id: string;
	name: string;
	description?: string;
	maxTokens?: number;
}

export interface AIMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface AIGenerateRequest {
	model: string;
	messages: AIMessage[];
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
}

export interface AIGenerateResponse {
	choices: Array<{
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

// 硅基流动API响应接口
export interface SiliconFlowModel {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}

export interface SiliconFlowModelsResponse {
	object: string;
	data: SiliconFlowModel[];
}

export interface SiliconFlowUserInfo {
	id: string;
	name: string;
	image: string;
	email: string;
	isAdmin: boolean;
	balance: string;
	status: string;
	introduction: string;
	role: string;
	chargeBalance: string;
	totalBalance: string;
}

export interface SiliconFlowUserResponse {
	code: number;
	message: string;
	status: boolean;
	data: SiliconFlowUserInfo;
}

// 预定义的AI提供商配置
export const AI_PROVIDERS: AIProvider[] = [
	{
		id: "siliconflow",
		name: "硅基流动",
		baseURL: "https://api.siliconflow.cn/v1",
		defaultModel: "deepseek-ai/DeepSeek-V3.1",
		models: [
			{
				id: "deepseek-ai/DeepSeek-V3.1",
				name: "DeepSeek V3.1",
				maxTokens: 8192,
			},
			{
				id: "deepseek-ai/DeepSeek-V2.5",
				name: "DeepSeek V2.5",
				maxTokens: 8192,
			},
			{
				id: "Qwen/Qwen2.5-72B-Instruct",
				name: "Qwen 2.5 72B",
				maxTokens: 8192,
			},
			{
				id: "meta-llama/Meta-Llama-3.1-70B-Instruct",
				name: "Llama 3.1 70B",
				maxTokens: 8192,
			},
		],
	},
	{
		id: "openai",
		name: "OpenAI",
		baseURL: "https://api.openai.com/v1",
		defaultModel: "gpt-4o-mini",
		models: [
			{ id: "gpt-4o", name: "GPT-4o", maxTokens: 4096 },
			{ id: "gpt-4o-mini", name: "GPT-4o Mini", maxTokens: 4096 },
			{ id: "gpt-4-turbo", name: "GPT-4 Turbo", maxTokens: 4096 },
			{ id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", maxTokens: 4096 },
		],
	},
	{
		id: "zhipu",
		name: "智谱AI",
		baseURL: "https://open.bigmodel.cn/api/paas/v4",
		defaultModel: "glm-4-plus",
		models: [
			{ id: "glm-4-plus", name: "GLM-4 Plus", maxTokens: 8192 },
			{ id: "glm-4-0520", name: "GLM-4", maxTokens: 8192 },
			{ id: "glm-4-air", name: "GLM-4 Air", maxTokens: 8192 },
			{ id: "glm-4-airx", name: "GLM-4 AirX", maxTokens: 8192 },
		],
	},
	{
		id: "moonshot",
		name: "月之暗面",
		baseURL: "https://api.moonshot.cn/v1",
		defaultModel: "moonshot-v1-8k",
		models: [
			{ id: "moonshot-v1-8k", name: "Moonshot v1 8K", maxTokens: 8192 },
			{ id: "moonshot-v1-32k", name: "Moonshot v1 32K", maxTokens: 32768 },
			{ id: "moonshot-v1-128k", name: "Moonshot v1 128K", maxTokens: 131072 },
		],
	},
	{
		id: "custom",
		name: "自定义",
		baseURL: "",
		defaultModel: "",
		models: [],
	},
];

/**
 * AI配置接口
 */
export interface AIConfig {
	providerId: string;
	apiKey: string;
	baseURL?: string;
	model?: string;
}

/**
 * 调试模式检查
 */
function isAIDebugEnabled(): boolean {
	if (typeof window === "undefined") return false;
	const v = localStorage.getItem("ai-debug");
	return v === "1" || v === "true" || v === "on";
}

/**
 * 获取超时时间
 */
function getAITimeoutMs(): number {
	if (typeof window === "undefined") return 30000;
	const raw = localStorage.getItem("ai-timeout-ms");
	const n = raw ? parseInt(raw, 10) : 30000;
	return Number.isFinite(n) && n >= 5000 ? n : 30000;
}

/**
 * 获取重试次数
 */
function getAIRetries(): number {
	if (typeof window === "undefined") return 1;
	const raw = localStorage.getItem("ai-retries");
	const n = raw ? parseInt(raw, 10) : 1;
	return Number.isFinite(n) && n >= 0 && n <= 3 ? n : 1;
}

/**
 * 创建带超时的AbortSignal (兼容性处理)
 */
function createTimeoutSignal(timeoutMs: number): AbortSignal {
	const controller = new AbortController();
	setTimeout(() => controller.abort(), timeoutMs);
	return controller.signal;
}

/**
 * 获取AI配置
 */
export function getAIConfig(): AIConfig | null {
	if (typeof window === "undefined") return null;

	const config = localStorage.getItem("ai-config");
	if (!config) return null;

	try {
		return JSON.parse(config);
	} catch {
		return null;
	}
}

/**
 * 保存AI配置
 */
export function saveAIConfig(config: AIConfig): void {
	if (typeof window === "undefined") return;
	localStorage.setItem("ai-config", JSON.stringify(config));
}

/**
 * 清除AI配置
 */
export function clearAIConfig(): void {
	if (typeof window === "undefined") return;
	localStorage.removeItem("ai-config");
}

/**
 * 检查是否已配置AI
 */
export function hasAIConfig(): boolean {
	const config = getAIConfig();
	return !!(config?.apiKey && config?.providerId);
}

/**
 * 获取当前提供商
 */
export function getCurrentProvider(): AIProvider | null {
	const config = getAIConfig();
	if (!config) return null;

	const provider = AI_PROVIDERS.find((p) => p.id === config.providerId);
	if (!provider) return null;

	// 如果是自定义提供商，使用配置中的baseURL
	if (provider.id === "custom" && config.baseURL) {
		return {
			...provider,
			baseURL: config.baseURL,
			defaultModel: config.model || "",
		};
	}

	return provider;
}

/**
 * 获取当前模型
 */
export function getCurrentModel(): string {
	const config = getAIConfig();
	const provider = getCurrentProvider();

	if (!config || !provider) return "";

	return config.model || provider.defaultModel;
}

/**
 * 获取硅基流动模型列表
 */
export async function fetchSiliconFlowModels(
	apiKey: string,
): Promise<SiliconFlowModel[]> {
	try {
		const response = await fetch("https://api.siliconflow.cn/v1/models", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			throw new Error(`API错误: ${response.status}`);
		}

		const data: SiliconFlowModelsResponse = await response.json();

		// 只返回聊天模型（过滤掉图像生成等其他类型的模型）
		return data.data.filter(
			(model) =>
				!model.id.includes("stable-diffusion") &&
				!model.id.includes("flux") &&
				!model.id.includes("whisper") &&
				model.id.includes("/"), // 通常聊天模型都有组织/模型名的格式
		);
	} catch (error: unknown) {
		const errorMessage =
			error instanceof Error ? error.message : "获取模型列表失败";
		console.error("获取硅基流动模型列表失败:", error);
		throw new Error(errorMessage);
	}
}

/**
 * 获取硅基流动用户信息和余额
 */
export async function fetchSiliconFlowUserInfo(
	apiKey: string,
): Promise<SiliconFlowUserInfo> {
	try {
		const response = await fetch("https://api.siliconflow.cn/v1/user/info", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});

		if (!response.ok) {
			throw new Error(`API错误: ${response.status}`);
		}

		const data: SiliconFlowUserResponse = await response.json();

		if (data.code !== 20000 || !data.status) {
			throw new Error(data.message || "获取用户信息失败");
		}

		return data.data;
	} catch (error: unknown) {
		const errorMessage =
			error instanceof Error ? error.message : "获取用户信息失败";
		console.error("获取硅基流动用户信息失败:", error);
		throw new Error(errorMessage);
	}
}

/**
 * 测试API连接
 */
export async function testAIConnection(
	config: AIConfig,
): Promise<{ valid: boolean; error?: string }> {
	try {
		const provider = AI_PROVIDERS.find((p) => p.id === config.providerId);
		if (!provider) {
			return { valid: false, error: "不支持的提供商" };
		}

		const baseURL =
			config.providerId === "custom" ? config.baseURL : provider.baseURL;
		if (!baseURL) {
			return { valid: false, error: "请配置API地址" };
		}

		const testModel = config.model || provider.defaultModel;
		if (!testModel) {
			return { valid: false, error: "请选择模型" };
		}

		const response = await fetch(`${baseURL}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
			},
			body: JSON.stringify({
				model: testModel,
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 10,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				valid: false,
				error: `API错误: ${response.status} ${errorText}`,
			};
		}

		const data = await response.json();
		if (!data.choices || !data.choices[0]) {
			return { valid: false, error: "API返回格式错误" };
		}

		return { valid: true };
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : "连接失败";
		return { valid: false, error: errorMessage };
	}
}

/**
 * 生成内容 (兼容原Gemini接口)
 */
export async function generateContent(
	modelId: string,
	prompt: string,
	options?: {
		temperature?: number;
		maxOutputTokens?: number;
		systemInstruction?: string;
		apiKey?: string;
	},
): Promise<string> {
	const config = getAIConfig();
	if (!config) {
		throw new Error("请先配置AI提供商");
	}

	const provider = getCurrentProvider();
	if (!provider) {
		throw new Error("无效的AI提供商配置");
	}

	const messages: AIMessage[] = [];

	// 添加系统指令
	if (options?.systemInstruction) {
		messages.push({
			role: "system",
			content: options.systemInstruction,
		});
	}

	// 添加用户提示
	messages.push({
		role: "user",
		content: prompt,
	});

	const requestBody: AIGenerateRequest = {
		model: modelId,
		messages,
		temperature: options?.temperature ?? 0.7,
		max_tokens: options?.maxOutputTokens ?? 2048,
	};

	try {
		if (isAIDebugEnabled()) {
			console.debug("[AI][request]", {
				provider: provider.name,
				modelId,
				temperature: requestBody.temperature,
				maxTokens: requestBody.max_tokens,
				messageCount: messages.length,
			});
		}

		const timeoutMs = getAITimeoutMs();
		const retries = getAIRetries();
		let response: Response | null = null;
		let lastError: unknown = null;

		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				if (isAIDebugEnabled() && retries > 0) {
					console.debug("[AI][attempt]", {
						attempt: attempt + 1,
						retries: retries + 1,
						timeoutMs,
					});
				}

				response = await fetch(`${provider.baseURL}/chat/completions`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${config.apiKey}`,
					},
					body: JSON.stringify(requestBody),
					signal: createTimeoutSignal(timeoutMs),
				});
				break; // success
			} catch (e: unknown) {
				lastError = e;
				if (
					attempt === retries ||
					(e instanceof Error && e.name === "AbortError")
				) {
					throw e;
				}

				// 等待重试
				const delay = Math.min(1000 * 2 ** attempt, 5000);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		if (!response) {
			throw lastError || new Error("请求失败");
		}

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`API错误 ${response.status}: ${errorText}`);
		}

		const data: AIGenerateResponse = await response.json();

		if (isAIDebugEnabled()) {
			console.debug("[AI][response]", {
				status: response.status,
				usage: data.usage,
				choicesCount: data.choices?.length,
			});
		}

		if (!data.choices || !data.choices[0] || !data.choices[0].message) {
			throw new Error("AI返回格式错误");
		}

		return data.choices[0].message.content || "";
	} catch (error: unknown) {
		if (isAIDebugEnabled()) {
			console.error("[AI][error]", error);
		}

		if (error instanceof Error && error.name === "AbortError") {
			const timeoutMs = getAITimeoutMs();
			throw new Error(`请求超时 (${timeoutMs}ms)`);
		}

		throw error;
	}
}

/**
 * 流式生成内容
 */
export async function* generateContentStream(
	modelId: string,
	prompt: string,
	options?: {
		temperature?: number;
		maxOutputTokens?: number;
		systemInstruction?: string;
		apiKey?: string;
	},
): AsyncGenerator<string> {
	const config = getAIConfig();
	if (!config) {
		throw new Error("请先配置AI提供商");
	}

	const provider = getCurrentProvider();
	if (!provider) {
		throw new Error("无效的AI提供商配置");
	}

	const messages: AIMessage[] = [];

	// 添加系统指令
	if (options?.systemInstruction) {
		messages.push({
			role: "system",
			content: options.systemInstruction,
		});
	}

	// 添加用户提示
	messages.push({
		role: "user",
		content: prompt,
	});

	const requestBody: AIGenerateRequest = {
		model: modelId,
		messages,
		temperature: options?.temperature ?? 0.7,
		max_tokens: options?.maxOutputTokens ?? 2048,
		stream: true,
	};

	const response = await fetch(`${provider.baseURL}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`API错误 ${response.status}: ${errorText}`);
	}

	if (!response.body) {
		throw new Error("响应体为空");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream: true });
			const lines = chunk.split("\n").filter((line) => line.trim());

			for (const line of lines) {
				if (line.startsWith("data: ")) {
					const data = line.slice(6);
					if (data === "[DONE]") return;

					try {
						const parsed = JSON.parse(data);
						const content = parsed.choices?.[0]?.delta?.content;
						if (content) {
							yield content;
						}
					} catch {
						// 忽略解析错误
					}
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

// 为了兼容现有代码，导出一些Gemini相关的别名
export const getApiKey = () => getAIConfig()?.apiKey || null;
export const saveApiKey = (apiKey: string) => {
	const config = getAIConfig() || { providerId: "siliconflow", apiKey: "" };
	saveAIConfig({ ...config, apiKey });
};
export const clearApiKey = clearAIConfig;
export const hasApiKey = hasAIConfig;
export const getDefaultModel = getCurrentModel;

// Gemini模型类型兼容
export interface GeminiModel {
	id: string;
	name: string;
	displayName: string;
	description?: string;
}

export const listGeminiModels = async (): Promise<GeminiModel[]> => {
	const provider = getCurrentProvider();
	if (!provider) return [];

	return provider.models.map((model) => ({
		id: model.id,
		name: model.name,
		displayName: model.name,
		description: model.description,
	}));
};

export const testApiKey = async (
	apiKey: string,
): Promise<{ valid: boolean; error?: string }> => {
	const config = getAIConfig();
	if (!config) return { valid: false, error: "请先配置AI提供商" };

	return testAIConnection({ ...config, apiKey });
};
