"use client";

import {
	Bot,
	CheckCircle2,
	ExternalLink,
	Loader2,
	RefreshCw,
	Settings2,
	Wallet,
	XCircle,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
	AI_PROVIDERS,
	type AIConfig,
	type AIProvider,
	clearAIConfig,
	fetchSiliconFlowModels,
	fetchSiliconFlowUserInfo,
	getAIConfig,
	type SiliconFlowModel,
	type SiliconFlowUserInfo,
	saveAIConfig,
	testAIConnection,
} from "@/lib/ai-client";

interface AISettingsProps {
	trigger?: ReactNode;
	variant?: "default" | "outline" | "ghost" | "secondary";
	showStatus?: boolean;
}

export function AISettings({
	trigger,
	variant = "outline",
	showStatus = true,
}: AISettingsProps) {
	const [open, setOpen] = useState(false);
	const [config, setConfig] = useState<AIConfig>({
		providerId: "siliconflow",
		apiKey: "",
		baseURL: "",
		model: "",
	});
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<{
		valid: boolean;
		error?: string;
	} | null>(null);
	const [isConfigured, setIsConfigured] = useState(false);
	const [siliconFlowModels, setSiliconFlowModels] = useState<
		SiliconFlowModel[]
	>([]);
	const [siliconFlowUserInfo, setSiliconFlowUserInfo] =
		useState<SiliconFlowUserInfo | null>(null);
	const [loadingSiliconFlow, setLoadingSiliconFlow] = useState(false);
	const { toast } = useToast();

	const currentProvider = AI_PROVIDERS.find((p) => p.id === config.providerId);

	useEffect(() => {
		const savedConfig = getAIConfig();
		if (savedConfig) {
			setConfig(savedConfig);
			setIsConfigured(true);
		}
	}, []);

	const loadSiliconFlowInfo = useCallback(async () => {
		if (!config.apiKey) return;

		setLoadingSiliconFlow(true);
		try {
			const [models, userInfo] = await Promise.all([
				fetchSiliconFlowModels(config.apiKey),
				fetchSiliconFlowUserInfo(config.apiKey),
			]);

			setSiliconFlowModels(models);
			setSiliconFlowUserInfo(userInfo);
		} catch (error: unknown) {
			console.error("加载硅基流动信息失败:", error);
		} finally {
			setLoadingSiliconFlow(false);
		}
	}, [config.apiKey]);

	useEffect(() => {
		if (open && config.providerId === "siliconflow" && config.apiKey) {
			loadSiliconFlowInfo();
		}
	}, [open, config.providerId, config.apiKey, loadSiliconFlowInfo]);

	const handleProviderChange = (providerId: string) => {
		const provider = AI_PROVIDERS.find((p) => p.id === providerId);
		if (!provider) return;

		setConfig((prev) => ({
			...prev,
			providerId,
			baseURL: provider.id === "custom" ? prev.baseURL || "" : provider.baseURL,
			model: provider.defaultModel || "",
		}));
		setTestResult(null);
	};

	const handleTest = async () => {
		if (!config.apiKey.trim()) {
			toast({
				title: "请输入API密钥",
				variant: "destructive",
			});
			return;
		}

		if (config.providerId === "custom" && !config.baseURL?.trim()) {
			toast({
				title: "请输入API地址",
				variant: "destructive",
			});
			return;
		}

		setIsTesting(true);
		setTestResult(null);

		try {
			const result = await testAIConnection(config);
			setTestResult(result);

			if (result.valid) {
				toast({
					title: "✅ API密钥有效",
					description: `${currentProvider?.name || "AI提供商"}连接成功！`,
				});
			} else {
				toast({
					title: "❌ API密钥无效",
					description: result.error || "请检查配置是否正确",
					variant: "destructive",
				});
			}
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : "网络连接失败";
			toast({
				title: "测试失败",
				description: errorMessage,
				variant: "destructive",
			});
		} finally {
			setIsTesting(false);
		}
	};

	const handleSave = () => {
		if (!config.apiKey.trim()) {
			toast({
				title: "请输入API密钥",
				variant: "destructive",
			});
			return;
		}

		if (config.providerId === "custom" && !config.baseURL?.trim()) {
			toast({
				title: "请输入API地址",
				variant: "destructive",
			});
			return;
		}

		saveAIConfig(config);
		setIsConfigured(true);
		toast({
			title: "✅ 保存成功",
			description: "AI配置已保存到本地存储",
		});
		setOpen(false);
	};

	const handleClear = () => {
		clearAIConfig();
		setConfig({
			providerId: "siliconflow",
			apiKey: "",
			baseURL: "",
			model: "",
		});
		setIsConfigured(false);
		setTestResult(null);
		setSiliconFlowModels([]);
		setSiliconFlowUserInfo(null);
		toast({
			title: "已清除",
			description: "AI配置已从本地存储中移除",
		});
	};

	const getProviderInstructions = (provider: AIProvider | undefined) => {
		if (!provider) return null;

		const instructions: Record<string, { steps: string[]; url: string }> = {
			siliconflow: {
				steps: [
					"访问 硅基流动官网",
					"注册并登录账号",
					"在控制台创建API密钥",
					"复制密钥到此处",
				],
				url: "https://cloud.siliconflow.cn/i/5rgex13s",
			},
			openai: {
				steps: [
					"访问 OpenAI Platform",
					"登录您的OpenAI账号",
					"在API Keys页面创建新密钥",
					"复制密钥到此处",
				],
				url: "https://platform.openai.com/api-keys",
			},
			zhipu: {
				steps: [
					"访问 智谱AI开放平台",
					"注册并登录账号",
					"在API管理页面创建密钥",
					"复制密钥到此处",
				],
				url: "https://open.bigmodel.cn/usercenter/apikeys",
			},
			moonshot: {
				steps: [
					"访问 Moonshot AI平台",
					"注册并登录账号",
					"在API密钥页面创建新密钥",
					"复制密钥到此处",
				],
				url: "https://platform.moonshot.cn/console/api-keys",
			},
		};

		return instructions[provider.id];
	};

	const providerInstructions = getProviderInstructions(currentProvider);

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
			<DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Bot className="w-5 h-5" />
						AI设置
					</DialogTitle>
					<DialogDescription>
						配置您的AI提供商和API密钥。支持OpenAI、硅基流动、智谱AI等多个提供商。
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* AI提供商选择 */}
					<div className="space-y-2">
						<Label htmlFor="provider">AI提供商</Label>
						<Select
							value={config.providerId}
							onValueChange={handleProviderChange}
						>
							<SelectTrigger>
								<SelectValue placeholder="选择AI提供商" />
							</SelectTrigger>
							<SelectContent>
								{AI_PROVIDERS.map((provider) => (
									<SelectItem key={provider.id} value={provider.id}>
										{provider.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* 自定义API地址 */}
					{config.providerId === "custom" && (
						<div className="space-y-2">
							<Label>API地址</Label>
							<Input
								type="url"
								placeholder="https://api.example.com/v1"
								value={config.baseURL || ""}
								onChange={(e) => {
									setConfig((prev) => ({ ...prev, baseURL: e.target.value }));
									setTestResult(null);
								}}
							/>
						</div>
					)}

					{/* 硅基流动用户余额显示 */}
					{config.providerId === "siliconflow" && siliconFlowUserInfo && (
						<div className="p-3 bg-green-50 dark:bg-green-950 rounded-md space-y-2">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Wallet className="w-4 h-4 text-green-600" />
									<span className="text-sm font-medium text-green-800 dark:text-green-200">
										账户余额
									</span>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={loadSiliconFlowInfo}
									disabled={loadingSiliconFlow}
									className="h-6 px-2"
								>
									{loadingSiliconFlow ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<RefreshCw className="w-3 h-3" />
									)}
								</Button>
							</div>
							<div className="grid grid-cols-2 gap-2 text-xs">
								<div>
									<span className="text-muted-foreground">总余额: </span>
									<span className="font-medium text-green-700 dark:text-green-300">
										¥{siliconFlowUserInfo.totalBalance}
									</span>
								</div>
								<div>
									<span className="text-muted-foreground">可用余额: </span>
									<span className="font-medium text-green-700 dark:text-green-300">
										¥{siliconFlowUserInfo.balance}
									</span>
								</div>
							</div>
						</div>
					)}

					{/* 模型选择 */}
					{currentProvider && (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label htmlFor="model">模型</Label>
								{config.providerId === "siliconflow" && (
									<Button
										variant="ghost"
										size="sm"
										onClick={loadSiliconFlowInfo}
										disabled={loadingSiliconFlow || !config.apiKey}
										className="h-6 px-2 text-xs"
									>
										{loadingSiliconFlow ? (
											<>
												<Loader2 className="w-3 h-3 animate-spin mr-1" />
												刷新中
											</>
										) : (
											<>
												<RefreshCw className="w-3 h-3 mr-1" />
												刷新模型
											</>
										)}
									</Button>
								)}
							</div>
							<Select
								value={config.model}
								onValueChange={(model) => {
									setConfig((prev) => ({ ...prev, model }));
									setTestResult(null);
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="选择模型" />
								</SelectTrigger>
								<SelectContent>
									{config.providerId === "siliconflow" &&
									siliconFlowModels.length > 0
										? siliconFlowModels.map((model) => (
												<SelectItem key={model.id} value={model.id}>
													<div>
														<div className="font-medium">{model.id}</div>
														{model.owned_by && (
															<div className="text-xs text-muted-foreground">
																由 {model.owned_by} 提供
															</div>
														)}
													</div>
												</SelectItem>
											))
										: currentProvider.models.map((model) => (
												<SelectItem key={model.id} value={model.id}>
													<div>
														<div className="font-medium">{model.name}</div>
														{model.description && (
															<div className="text-xs text-muted-foreground">
																{model.description}
															</div>
														)}
													</div>
												</SelectItem>
											))}
								</SelectContent>
							</Select>
							{config.providerId === "siliconflow" &&
								config.apiKey &&
								siliconFlowModels.length === 0 &&
								!loadingSiliconFlow && (
									<p className="text-xs text-muted-foreground">
										请点击"刷新模型"获取最新的可用模型列表
									</p>
								)}
						</div>
					)}

					{/* API密钥输入 */}
					<div className="space-y-2">
						<Label>API密钥</Label>
						<Input
							type="password"
							placeholder={`输入您的${currentProvider?.name || "AI"}API密钥`}
							value={config.apiKey}
							onChange={(e) => {
								setConfig((prev) => ({ ...prev, apiKey: e.target.value }));
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
									API连接成功
								</>
							) : (
								<>
									<XCircle className="w-4 h-4" />
									{testResult.error || "API连接失败"}
								</>
							)}
						</div>
					)}

					{/* 获取API密钥指引 */}
					{providerInstructions && (
						<div className="p-3 bg-muted rounded-md space-y-2">
							<p className="text-sm font-medium">如何获取API密钥？</p>
							<ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
								{providerInstructions.steps.map((step: string) => (
									<li key={step}>{step}</li>
								))}
							</ol>
							<a
								href={providerInstructions.url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
							>
								前往 {currentProvider?.name}
								<ExternalLink className="w-3 h-3" />
							</a>
						</div>
					)}

					{/* 说明 */}
					<div className="text-xs text-muted-foreground space-y-1">
						<p>• API密钥仅保存在您的浏览器中，不会上传到服务器</p>
						<p>• AI功能将使用您的网络环境直接访问提供商API</p>
						<p>• 不同提供商的定价和限制请参考官方文档</p>
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<div className="flex flex-1 gap-2">
						<Button
							variant="outline"
							onClick={handleTest}
							disabled={!config.apiKey.trim() || isTesting}
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
					<Button onClick={handleSave} disabled={!config.apiKey.trim()}>
						保存
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
