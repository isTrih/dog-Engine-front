"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
	checkAndPromptMigration,
	cleanupLegacyGeminiConfig,
	migrateAllGeminiSettings,
} from "@/lib/migrate-ai-config";

interface MigrationNoticeProps {
	/** 是否在页面加载时自动显示 */
	autoShow?: boolean;
	/** 自定义样式类名 */
	className?: string;
}

export function MigrationNotice({
	autoShow = true,
	className = "",
}: MigrationNoticeProps) {
	const [showNotice, setShowNotice] = useState(false);
	const [migrationStatus, setMigrationStatus] = useState<
		"pending" | "migrating" | "success" | "error"
	>("pending");
	const [migrationResult, setMigrationResult] = useState<{
		migratedItems: string[];
		errors: string[];
	} | null>(null);
	const { toast } = useToast();

	useEffect(() => {
		if (!autoShow) return;

		const checkMigration = () => {
			const { needsMigration, canMigrate } = checkAndPromptMigration();

			if (needsMigration && canMigrate) {
				setShowNotice(true);
			}
		};

		// 延迟检查，确保页面已加载完成
		const timer = setTimeout(checkMigration, 1000);
		return () => clearTimeout(timer);
	}, [autoShow]);

	const handleMigrate = async () => {
		setMigrationStatus("migrating");

		try {
			const result = migrateAllGeminiSettings();

			if (result.success) {
				setMigrationStatus("success");
				setMigrationResult(result);
				toast({
					title: "✅ 迁移完成",
					description: `成功迁移 ${result.migratedItems.length} 项设置`,
				});

				// 3秒后自动隐藏通知
				setTimeout(() => {
					setShowNotice(false);
				}, 3000);
			} else {
				setMigrationStatus("error");
				setMigrationResult(result);
				toast({
					title: "❌ 迁移失败",
					description: result.errors[0] || "迁移过程中出现错误",
					variant: "destructive",
				});
			}
		} catch (error) {
			setMigrationStatus("error");
			toast({
				title: "❌ 迁移失败",
				description: "迁移过程中出现意外错误",
				variant: "destructive",
			});
		}
	};

	const handleCleanup = () => {
		try {
			cleanupLegacyGeminiConfig();
			toast({
				title: "✅ 清理完成",
				description: "旧的Gemini配置已清理",
			});
			setShowNotice(false);
		} catch (error) {
			toast({
				title: "❌ 清理失败",
				description: "清理旧配置时出现错误",
				variant: "destructive",
			});
		}
	};

	const handleDismiss = () => {
		setShowNotice(false);
		toast({
			title: "已忽略迁移",
			description: "您可以在AI设置中手动配置新的提供商",
		});
	};

	if (!showNotice) return null;

	const renderMigrationContent = () => {
		switch (migrationStatus) {
			case "pending":
				return (
					<Card className={`border-orange-200 ${className}`}>
						<CardHeader className="pb-3">
							<div className="flex items-center gap-2">
								<AlertTriangle className="w-5 h-5 text-orange-500" />
								<CardTitle className="text-orange-800 dark:text-orange-200">
									AI功能升级通知
								</CardTitle>
								<Button
									variant="ghost"
									size="sm"
									onClick={handleDismiss}
									className="ml-auto h-6 w-6 p-0"
								>
									<X className="w-4 h-4" />
								</Button>
							</div>
							<CardDescription className="text-orange-600 dark:text-orange-300">
								我们检测到您之前使用的是Gemini AI设置。现在支持更多AI提供商！
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<h4 className="font-medium text-sm">🎉 新功能亮点</h4>
								<ul className="text-sm space-y-1 text-muted-foreground">
									<li>• 支持硅基流动、OpenAI、智谱AI、月之暗面等多个提供商</li>
									<li>• 统一的API格式，更好的兼容性</li>
									<li>• 更丰富的模型选择</li>
									<li>• 保持原有功能完全兼容</li>
								</ul>
							</div>

							<Alert>
								<ArrowRight className="w-4 h-4" />
								<AlertTitle>推荐：一键迁移</AlertTitle>
								<AlertDescription>
									我们可以自动将您的Gemini配置迁移到新系统，您也可以手动配置其他AI提供商。
								</AlertDescription>
							</Alert>

							<div className="flex gap-2">
								<Button onClick={handleMigrate} className="flex-1">
									自动迁移设置
								</Button>
								<Button variant="outline" onClick={handleDismiss}>
									稍后手动配置
								</Button>
							</div>
						</CardContent>
					</Card>
				);

			case "migrating":
				return (
					<Card className={`border-blue-200 ${className}`}>
						<CardContent className="pt-6">
							<div className="flex items-center gap-3">
								<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
								<div>
									<p className="font-medium">正在迁移配置...</p>
									<p className="text-sm text-muted-foreground">
										请稍等，正在转换您的AI设置
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				);

			case "success":
				return (
					<Card className={`border-green-200 ${className}`}>
						<CardHeader className="pb-3">
							<div className="flex items-center gap-2">
								<CheckCircle2 className="w-5 h-5 text-green-500" />
								<CardTitle className="text-green-800 dark:text-green-200">
									迁移成功！
								</CardTitle>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setShowNotice(false)}
									className="ml-auto h-6 w-6 p-0"
								>
									<X className="w-4 h-4" />
								</Button>
							</div>
						</CardHeader>
						<CardContent className="space-y-3">
							{migrationResult && (
								<div className="space-y-2">
									<p className="text-sm text-green-600 dark:text-green-400">
										成功迁移了以下设置：
									</p>
									<ul className="text-sm space-y-1">
										{migrationResult.migratedItems.map((item, index) => (
											<li key={index} className="flex items-center gap-2">
												<CheckCircle2 className="w-3 h-3 text-green-500" />
												{item}
											</li>
										))}
									</ul>
								</div>
							)}

							<Alert className="bg-green-50 dark:bg-green-950 border-green-200">
								<AlertDescription className="text-green-700 dark:text-green-300">
									您现在可以在AI设置中配置更多提供商，或继续使用现有配置。
								</AlertDescription>
							</Alert>

							<div className="flex gap-2">
								<Button variant="outline" onClick={handleCleanup} size="sm">
									清理旧配置
								</Button>
								<Button
									variant="ghost"
									onClick={() => setShowNotice(false)}
									size="sm"
								>
									完成
								</Button>
							</div>
						</CardContent>
					</Card>
				);

			case "error":
				return (
					<Card className={`border-red-200 ${className}`}>
						<CardHeader className="pb-3">
							<div className="flex items-center gap-2">
								<AlertTriangle className="w-5 h-5 text-red-500" />
								<CardTitle className="text-red-800 dark:text-red-200">
									迁移失败
								</CardTitle>
								<Button
									variant="ghost"
									size="sm"
									onClick={handleDismiss}
									className="ml-auto h-6 w-6 p-0"
								>
									<X className="w-4 h-4" />
								</Button>
							</div>
						</CardHeader>
						<CardContent className="space-y-3">
							{migrationResult && migrationResult.errors.length > 0 && (
								<div className="space-y-2">
									<p className="text-sm text-red-600 dark:text-red-400">
										迁移过程中出现以下错误：
									</p>
									<ul className="text-sm space-y-1">
										{migrationResult.errors.map((error, index) => (
											<li
												key={index}
												className="text-red-600 dark:text-red-400"
											>
												• {error}
											</li>
										))}
									</ul>
								</div>
							)}

							<Alert className="bg-red-50 dark:bg-red-950 border-red-200">
								<AlertDescription className="text-red-700 dark:text-red-300">
									您可以手动在AI设置中重新配置，或稍后重试自动迁移。
								</AlertDescription>
							</Alert>

							<div className="flex gap-2">
								<Button variant="outline" onClick={handleMigrate} size="sm">
									重试迁移
								</Button>
								<Button variant="ghost" onClick={handleDismiss} size="sm">
									手动配置
								</Button>
							</div>
						</CardContent>
					</Card>
				);

			default:
				return null;
		}
	};

	return renderMigrationContent();
}

// 全局迁移通知Hook
export function useMigrationCheck() {
	const [needsMigration, setNeedsMigration] = useState(false);

	useEffect(() => {
		const { needsMigration: needs } = checkAndPromptMigration();
		setNeedsMigration(needs);
	}, []);

	return { needsMigration };
}
