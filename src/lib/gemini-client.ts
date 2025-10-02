/**
 * @fileOverview 前端直调Gemini API工具库
 * 用户可以使用自己的API密钥，通过自己的网络访问Gemini API
 * 完全绕过后端代理问题
 */

export interface GeminiModel {
    id: string;
    name: string;
    displayName: string;
    description?: string;
}

export interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export interface GeminiGenerateRequest {
    contents: GeminiMessage[];
    generationConfig?: {
        temperature?: number;
        maxOutputTokens?: number;
        topP?: number;
        topK?: number;
    };
    safetySettings?: Array<{
        category: string;
        threshold: string;
    }>;
}

export interface GeminiGenerateResponse {
    candidates: Array<{
        content: {
            parts: Array<{ text: string }>;
            role: string;
        };
        finishReason: string;
    }>;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

/**
 * 从localStorage获取API密钥
 */
export function getApiKey(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('gemini-api-key');
}

/**
 * 保存API密钥到localStorage
 */
export function saveApiKey(apiKey: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('gemini-api-key', apiKey.trim());
}

/**
 * 清除API密钥
 */
export function clearApiKey(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('gemini-api-key');
}

/**
 * 检查是否已配置API密钥
 */
export function hasApiKey(): boolean {
    const key = getApiKey();
    return !!key && key.length > 0;
}

/**
 * 获取可用的Gemini模型列表
 */
export async function listGeminiModels(apiKey?: string): Promise<GeminiModel[]> {
    const key = apiKey || getApiKey();
    if (!key) {
        throw new Error('请先配置Gemini API密钥');
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`获取模型列表失败: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        return data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => ({
                id: m.name.replace('models/', ''),
                name: m.name.replace('models/', ''),
                displayName: m.displayName,
                description: m.description,
            }))
            .sort((a: GeminiModel, b: GeminiModel) => a.displayName.localeCompare(b.displayName));
    } catch (error: any) {
        console.error('Failed to fetch models:', error);
        // 返回默认模型列表作为fallback
        return [
            { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
            { id: 'gemini-1.5-flash', name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
            { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
        ];
    }
}

/**
 * 调用Gemini API生成内容
 */
export async function generateContent(
    modelId: string,
    prompt: string,
    options?: {
        temperature?: number;
        maxOutputTokens?: number;
        systemInstruction?: string;
        apiKey?: string;
    }
): Promise<string> {
    const key = options?.apiKey || getApiKey();
    if (!key) {
        throw new Error('请先配置Gemini API密钥');
    }

    const messages: GeminiMessage[] = [];
    
    // 如果有系统指令，作为第一条用户消息
    if (options?.systemInstruction) {
        messages.push({
            role: 'user',
            parts: [{ text: options.systemInstruction }],
        });
    }
    
    // 添加用户提示
    messages.push({
        role: 'user',
        parts: [{ text: prompt }],
    });

    const requestBody: GeminiGenerateRequest = {
        contents: messages,
        generationConfig: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxOutputTokens ?? 2048,
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        ],
    };

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', errorText);
            throw new Error(`API调用失败: ${response.status}`);
        }

        const data: GeminiGenerateResponse = await response.json();
        
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('API未返回有效内容');
        }

        const text = data.candidates[0].content.parts
            .map(part => part.text)
            .join('');

        return text;
    } catch (error: any) {
        console.error('Failed to generate content:', error);
        throw error;
    }
}

/**
 * 测试API密钥是否有效
 */
export async function testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (!response.ok) {
            const errorText = await response.text();
            return {
                valid: false,
                error: `API密钥无效 (${response.status})`,
            };
        }

        return { valid: true };
    } catch (error: any) {
        return {
            valid: false,
            error: error.message || '网络请求失败',
        };
    }
}

/**
 * 默认推荐的模型配置
 */
export const DEFAULT_MODELS = {
    FAST: 'gemini-2.5-flash',
    POWERFUL: 'gemini-2.5-pro',
} as const;

/**
 * 获取推荐的默认模型
 */
export function getDefaultModel(): string {
    return DEFAULT_MODELS.FAST;
}

