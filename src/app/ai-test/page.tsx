"use client";

import { Bot, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { AISettings } from "@/components/AISettings";
import { MigrationNotice } from "@/components/MigrationNotice";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
	generateContent,
	generateContentStream,
	getCurrentModel,
	getCurrentProvider,
	hasAIConfig,
} from "@/lib/ai-client";

export default function AITestPage() {
	const [prompt, setPrompt] = useState("");
	const [result, setResult] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const { toast } = useToast();

	const currentProvider = getCurrentProvider();
	const currentModel = getCurrentModel();
	const hasConfig = hasAIConfig();

	const handleGenerate = async () => {
		if (!prompt.trim()) {
			toast({
				title: "请输入提示词",
				variant: "destructive",
			});
			return;
		}

		if (!hasConfig) {
			toast({
				title: "请先配置AI",
				description: "点击右上角的AI设置按钮配置您的AI提供商",
				variant: "destructive",
			});
			return;
		}

		setIsGenerating(true);
		setResult("");

		try {
			const response = await generateContent(currentModel, prompt, {
				temperature: 0.7,
				maxOutputTokens: 1000,
			});

			setResult(response);
			toast({
				title: "✅ 生成完成",
				description: "AI内容生成成功",
			});
		} catch (error: any) {
			toast({
				title: "❌ 生成失败",
				description: error.message || "请检查AI配置是否正确",
				variant: "destructive",
			});
		} finally {
			setIsGenerating(false);
		}
	};

	const handleStreamGenerate = async () => {
		if (!prompt.trim()) {
			toast({
				title: "请输入提示词",
				variant: "destructive",
			});
			return;
		}

		if (!hasConfig) {
			toast({
				title: "请先配置AI",
				description: "点击右上角的AI设置按钮配置您的AI提供商",
				variant: "destructive",
			});
			return;
		}

		setIsStreaming(true);
		setResult("");

		try {
			const stream = generateContentStream(currentModel, prompt, {
				temperature: 0.7,
				maxOutputTokens: 1000,
			});

			for await (const chunk of stream) {
				setResult((prev) => prev + chunk);
			}

			toast({
				title: "✅ 流式生成完成",
				description: "AI内容流式生成成功",
			});
		} catch (error: any) {
			toast({
				title: "❌ 生成失败",
				description: error.message || "请检查AI配置是否正确",
				variant: "destructive",
			});
		} finally {
			setIsStreaming(false);
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto py-8 px-4">
				<div className="max-w-4xl mx-auto space-y-6">
					{/* 页面标题 */}
					<div className="text-center space-y-2">
						<h1 className="text-3xl font-bold flex items-center justify-center gap-2">
							<Bot className="w-8 h-8 text-primary" />
							AI功能测试
						</h1>
						<p className="text-muted-foreground">
							测试新的多提供商AI功能，支持硅基流动、OpenAI、智谱AI等
						</p>
					</div>

					{/* 迁移通知 */}
					<MigrationNotice />

					{/* 配置状态 */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Sparkles className="w-5 h-5" />
								当前配置
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{hasConfig ? (
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<Label>提供商:</Label>
										<span className="font-medium text-green-600">
											{currentProvider?.name || "未知"}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<Label>模型:</Label>
										<span className="font-medium text-green-600">
											{currentModel || "未选择"}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<Label>状态:</Label>
										<span className="text-sm text-green-600">✅ 已配置</span>
									</div>
								</div>
							) : (
								<div className="text-center py-4">
									<p className="text-muted-foreground mb-3">
										请先配置AI提供商才能使用功能
									</p>
									<AISettings
										trigger={
											<Button>
												<Bot className="w-4 h-4 mr-2" />
												配置AI
											</Button>
										}
									/>
								</div>
							)}
						</CardContent>
					</Card>

					{/* 测试区域 */}
					<Card>
						<CardHeader>
							<CardTitle>AI生成测试</CardTitle>
							<CardDescription>
								输入提示词测试AI生成功能，支持普通生成和流式生成
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="prompt">提示词</Label>
								<Textarea
									id="prompt"
									placeholder="例如：请写一个关于科幻的短篇小说开头..."
									value={prompt}
									onChange={(e) => setPrompt(e.target.value)}
									rows={4}
								/>
							</div>

							<div className="flex gap-2">
								<Button
									onClick={handleGenerate}
									disabled={isGenerating || isStreaming || !hasConfig}
									className="flex-1"
								>
									{isGenerating ? (
										<>
											<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
											生成中...
										</>
									) : (
										<>
											<Send className="w-4 h-4 mr-2" />
											普通生成
										</>
									)}
								</Button>
								<Button
									variant="outline"
									onClick={handleStreamGenerate}
									disabled={isGenerating || isStreaming || !hasConfig}
									className="flex-1"
								>
									{isStreaming ? (
										<>
											<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
											流式生成中...
										</>
									) : (
										<>
											<Sparkles className="w-4 h-4 mr-2" />
											流式生成
										</>
									)}
								</Button>
							</div>

							{result && (
								<div className="space-y-2">
									<Label>生成结果</Label>
									<div className="p-4 bg-muted rounded-md">
										<pre className="whitespace-pre-wrap font-sans text-sm">
											{result}
										</pre>
									</div>
								</div>
							)}
						</CardContent>
					</Card>

					{/* 使用说明 */}
					<Card>
						<CardHeader>
							<CardTitle>使用说明</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="space-y-2">
								<h4 className="font-medium">支持的AI提供商</h4>
								<ul className="text-sm space-y-1 text-muted-foreground ml-4">
									<li>• 硅基流动 - 免费额度充足，推荐使用</li>
									<li>• OpenAI - 官方GPT模型，质量高</li>
									<li>• 智谱AI - 国产GLM模型，中文友好</li>
									<li>• 月之暗面 - Moonshot模型，长文本支持好</li>
									<li>• 自定义 - 支持兼容OpenAI API的其他提供商</li>
								</ul>
							</div>
							<div className="space-y-2">
								<h4 className="font-medium">功能特点</h4>
								<ul className="text-sm space-y-1 text-muted-foreground ml-4">
									<li>• 统一API格式，兼容性好</li>
									<li>• 支持流式输出，实时显示</li>
									<li>• 自动重试机制，提高成功率</li>
									<li>• 配置保存在本地，隐私安全</li>
								</ul>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
