"use client";

import {
	ArrowRight,
	Bot,
	CheckCircle2,
	ExternalLink,
	Info,
	Loader2,
	Settings2,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AISettings } from "@/components/AISettings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
	clearApiKey,
	getApiKey,
	hasApiKey,
	saveApiKey,
	testApiKey,
} from "@/lib/gemini-client";

interface GeminiSettingsProps {
	/** 自定义触发按钮 */
	trigger?: React.ReactNode;
	/** 按钮变体 */
	variant?: "default" | "outline" | "ghost" | "secondary";
	/** 是否显示状态图标（已配置/未配置） */
	showStatus?: boolean;
}

export function GeminiSettings({
	trigger,
	variant = "outline",
	showStatus = true,
}: GeminiSettingsProps) {
	const [open, setOpen] = useState(false);
	const [apiKey, setApiKey] = useState("");
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<{
		valid: boolean;
		error?: string;
	} | null>(null);
	const [isConfigured, setIsConfigured] = useState(false);
	const { toast } = useToast();

	// 加载已保存的API密钥
	useEffect(() => {
		const savedKey = getApiKey();
		if (savedKey) {
			setApiKey(savedKey);
			setIsConfigured(true);
		}
	}, [open]);

	const handleTest = async () => {
		if (!apiKey.trim()) {
			toast({
				title: "请输入API密钥",
				variant: "destructive",
			});
			return;
		}

		setIsTesting(true);
		setTestResult(null);

		try {
			const result = await testApiKey(apiKey.trim());
			setTestResult(result);

			if (result.valid) {
				toast({
					title: "✅ API密钥有效",
					description: "您的Gemini API密钥验证成功！",
				});
			} else {
				toast({
					title: "❌ API密钥无效",
					description: result.error || "请检查密钥是否正确",
					variant: "destructive",
				});
			}
		} catch (error: any) {
			toast({
				title: "测试失败",
				description: error.message || "网络连接失败",
				variant: "destructive",
			});
		} finally {
			setIsTesting(false);
		}
	};

	const handleSave = () => {
		if (!apiKey.trim()) {
			toast({
				title: "请输入API密钥",
				variant: "destructive",
			});
			return;
		}

		saveApiKey(apiKey);
		setIsConfigured(true);
		toast({
			title: "✅ 保存成功",
			description: "API密钥已保存到本地存储",
		});
		setOpen(false);
	};

	const handleClear = () => {
		clearApiKey();
		setApiKey("");
		setIsConfigured(false);
		setTestResult(null);
		toast({
			title: "已清除",
			description: "API密钥已从本地存储中移除",
		});
	};

	const defaultTrigger = (
		<Button variant={variant} size="sm" className="gap-2">
			{showStatus && isConfigured ? (
				<Bot className="w-4 h-4 text-green-500" />
			) : (
				<Settings2 className="w-4 h-4" />
			)}
			AI设置
		</Button>
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Bot className="w-5 h-5" />
						Gemini API 设置
					</DialogTitle>
					<DialogDescription>
						配置您的Gemini API密钥以使用AI功能。密钥将保存在浏览器本地存储中。
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* AI升级提醒 */}
					<Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950">
						<Info className="h-4 w-4 text-blue-500" />
						<AlertTitle className="text-blue-800 dark:text-blue-200">
							🎉 AI功能已升级！
						</AlertTitle>
						<AlertDescription className="text-blue-700 dark:text-blue-300 space-y-2">
							<p>现在支持更多AI提供商：硅基流动、OpenAI、智谱AI、月之暗面等</p>
							<div className="flex gap-2 mt-2">
								<AISettings
									trigger={
										<Button variant="outline" size="sm" className="h-7">
											<ArrowRight className="w-3 h-3 mr-1" />
											体验新版AI设置
										</Button>
									}
								/>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 text-xs"
									onClick={() => {
										toast({
											title: "提示",
											description:
												"您可以继续使用Gemini，也可以随时切换到新的AI设置",
										});
									}}
								>
									稍后再说
								</Button>
							</div>
						</AlertDescription>
					</Alert>
					{/* API密钥输入 */}
					<div className="space-y-2">
						<Label htmlFor="api-key">API密钥</Label>
						<Input
							id="api-key"
							type="password"
							placeholder="输入您的Gemini API密钥"
							value={apiKey}
							onChange={(e) => {
								setApiKey(e.target.value);
								setTestResult(null);
							}}
							className="font-mono text-sm"
						/>
						{isConfigured && (
							<p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
								<CheckCircle2 className="w-3 h-3" />
								已配置API密钥
							</p>
						)}
					</div>

					{/* 测试结果 */}
					{testResult && (
						<div
							className={`p-3 rounded-md text-sm flex items-center gap-2 ${
								testResult.valid
									? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
									: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
							}`}
						>
							{testResult.valid ? (
								<>
									<CheckCircle2 className="w-4 h-4" />
									API密钥验证成功
								</>
							) : (
								<>
									<XCircle className="w-4 h-4" />
									{testResult.error || "API密钥无效"}
								</>
							)}
						</div>
					)}

					{/* 获取API密钥指引 */}
					<div className="p-3 bg-muted rounded-md space-y-2">
						<p className="text-sm font-medium">如何获取API密钥？</p>
						<ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
							<li>访问 Google AI Studio</li>
							<li>登录您的Google账号</li>
							<li>在左侧菜单点击"Get API Key"</li>
							<li>创建新的API密钥并复制</li>
						</ol>
						<a
							href="https://aistudio.google.com/app/apikey"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
						>
							前往 Google AI Studio
							<ExternalLink className="w-3 h-3" />
						</a>
					</div>

					{/* 说明 */}
					<div className="text-xs text-muted-foreground space-y-1">
						<p>• API密钥仅保存在您的浏览器中，不会上传到服务器</p>
						<p>• AI功能将使用您的网络环境直接访问Google API</p>
						<p>• 免费额度：每分钟15次请求，每天1500次请求</p>
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<div className="flex flex-1 gap-2">
						<Button
							variant="outline"
							onClick={handleTest}
							disabled={!apiKey.trim() || isTesting}
							className="flex-1"
						>
							{isTesting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									测试中...
								</>
							) : (
								"测试连接"
							)}
						</Button>
						{isConfigured && (
							<Button variant="destructive" onClick={handleClear} size="sm">
								清除
							</Button>
						)}
					</div>
					<Button onClick={handleSave} disabled={!apiKey.trim()}>
						保存
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
