"use client";

import copy from "copy-to-clipboard";
import {
	CheckCircle,
	Copy,
	FileScan,
	Loader2,
	WandSparkles,
	XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { listModels } from "@/ai/flows/list-models";
import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { generateContent, getCurrentModel, hasAIConfig } from "@/lib/ai-client";
import type { Book, Chapter, ReviewResult } from "@/lib/types";

const MAX_CHAR_LIMIT = 10000;

export default function ReviewPage() {
	const [books] = useLocalStorage<Book[]>("books", []);
	const { toast } = useToast();

	const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
	const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
		null,
	);
	const [pastedText, setPastedText] = useState("");

	const [isLoading, setIsLoading] = useState(false);
	const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
	const [models, setModels] = useState<
		{ id: string; name: string; displayName?: string }[]
	>([]);
	const [selectedModel, setSelectedModel] = useState<string>("");

	const selectedBook = useMemo(
		() => books.find((b) => b.id === selectedBookId),
		[books, selectedBookId],
	);
	const selectedChapter = useMemo(
		() => selectedBook?.chapters.find((c) => c.id === selectedChapterId),
		[selectedBook, selectedChapterId],
	);

	const manuscript = useMemo(() => {
		if (selectedChapter) return selectedChapter.content;
		return pastedText;
	}, [selectedChapter, pastedText]);

	// load models on mount
	useMemo(() => {
		(async () => {
			try {
				const list = await listModels();
				setModels(list);
				setSelectedModel(getCurrentModel());
			} catch (e) {
				// ignore; models will remain empty, we keep default
				setSelectedModel(getCurrentModel());
			}
		})();
	}, []);

	const handleBookSelect = (bookId: string) => {
		setSelectedBookId(bookId);
		setSelectedChapterId(null);
		setReviewResult(null);
	};

	const handleChapterSelect = (chapterId: string) => {
		setSelectedChapterId(chapterId);
		setReviewResult(null);
	};

	const handlePastedTextChange = (
		e: React.ChangeEvent<HTMLTextAreaElement>,
	) => {
		const text = e.target.value;
		if (text.length <= MAX_CHAR_LIMIT) {
			setPastedText(text);
			setReviewResult(null);
		}
	};

	const handleReview = async () => {
		if (!manuscript.trim()) {
			toast({
				title: "稿件不能为空",
				description: "请输入或选择需要审阅的内容。",
				variant: "destructive",
			});
			return;
		}

		setIsLoading(true);
		setReviewResult(null);

		try {
			if (!hasAIConfig()) {
				toast({
					title: "AI配置未设置",
					description: "请先在设置页面配置AI提供商和API密钥。",
					variant: "destructive",
				});
				return;
			}

			const systemInstruction =
				'你是一个专业的网文编辑，在你的眼中，只有过稿和拒稿。遵循商业网文的审稿标准，基于提供的稿件严格给出结论。输出严格的JSON对象，不要任何解释或附加文本：{"decision":"过稿或拒稿","reason":"详细理由（若过稿只说优点；若拒稿只说问题与修改方向）"}';
			const output = await generateContent(
				selectedModel || getCurrentModel(),
				`【稿件】\n${manuscript}`,
				{ systemInstruction, maxOutputTokens: 1024, temperature: 0.2 },
			);
			let parsed: any;
			try {
				parsed = JSON.parse(output);
			} catch {
				const m = output.match(/```[\s\S]*?\n([\s\S]*?)```/);
				parsed = JSON.parse(m ? m[1] : output);
			}
			const decision = String(parsed.decision || "").includes("过")
				? "过稿"
				: "拒稿";
			const reason = String(parsed.reason || "").trim() || output.trim();
			setReviewResult({ decision: decision as "过稿" | "拒稿", reason });
		} catch (error) {
			console.error("Review failed:", error);
			toast({
				title: "审稿失败",
				description: "AI 在审稿时遇到问题，请稍后再试。",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleCopyReason = () => {
		if (reviewResult?.reason) {
			copy(reviewResult.reason);
			toast({
				title: "复制成功",
				description: "审稿理由已复制到剪贴板。",
			});
		}
	};

	return (
		<div className="flex flex-col min-h-screen bg-background/80">
			<Header />
			<main className="flex-grow container mx-auto p-4 md:p-6 lg:p-8">
				<div className="max-w-2xl mx-auto">
					<Card className="shadow-lg">
						<CardHeader className="text-center">
							<FileScan className="mx-auto h-12 w-12 text-primary" />
							<CardTitle className="text-2xl font-headline mt-2">
								网文审稿
							</CardTitle>
							<CardDescription>
								模拟专业编辑，为你的作品开头提供签约级水准的专业反馈。
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<Tabs defaultValue="paste" className="w-full">
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="paste">粘贴文本</TabsTrigger>
									<TabsTrigger value="select">选择书籍</TabsTrigger>
								</TabsList>
								<TabsContent value="paste" className="mt-4">
									<div className="space-y-2">
										<Label>在此处粘贴您的稿件（开头1-3章为宜）</Label>
										<Textarea
											placeholder="请输入..."
											value={pastedText}
											onChange={handlePastedTextChange}
											className="min-h-[200px] resize-y"
										/>
										<div className="flex justify-between items-center">
											<div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground py-2">
												<Badge variant="outline">起点主编:星河</Badge>
												<Badge variant="outline">起点编辑:无书</Badge>
												<Badge variant="outline">专业审稿模型</Badge>
												<Badge variant="outline">符合商业化审美</Badge>
												<Badge variant="outline">审稿准确率高达80%</Badge>
											</div>
											<p className="text-xs text-muted-foreground text-right shrink-0">
												{pastedText.length} / {MAX_CHAR_LIMIT}
											</p>
										</div>
									</div>
								</TabsContent>
								<TabsContent value="select" className="mt-4">
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>选择书籍</Label>
											<Select
												onValueChange={handleBookSelect}
												value={selectedBookId || ""}
											>
												<SelectTrigger>
													<SelectValue placeholder="选择一本你的著作" />
												</SelectTrigger>
												<SelectContent>
													{books.map((book) => (
														<SelectItem key={book.id} value={book.id}>
															{book.title}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-2">
											<Label>选择章节</Label>
											<Select
												onValueChange={handleChapterSelect}
												value={selectedChapterId || ""}
												disabled={!selectedBook}
											>
												<SelectTrigger>
													<SelectValue placeholder="选择一个章节" />
												</SelectTrigger>
												<SelectContent>
													{selectedBook?.chapters.map((chapter) => (
														<SelectItem key={chapter.id} value={chapter.id}>
															{chapter.title}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								</TabsContent>
							</Tabs>
							{/* Model selection */}
							<div className="grid grid-cols-1 gap-2">
								<div className="space-y-2">
									<Label>选择模型</Label>
									<Select
										onValueChange={setSelectedModel}
										value={selectedModel}
									>
										<SelectTrigger>
											<SelectValue placeholder="选择一个模型" />
										</SelectTrigger>
										<SelectContent>
											{(models.length > 0
												? models
												: [
														{
															id: "deepseek-ai/DeepSeek-V3.1",
															name: "DeepSeek V3.1",
															displayName: "DeepSeek V3.1",
														},
														{
															id: "deepseek-ai/DeepSeek-V2.5",
															name: "DeepSeek V2.5",
															displayName: "DeepSeek V2.5",
														},
													]
											).map((m) => (
												<SelectItem key={m.id} value={m.id}>
													{m.displayName || m.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							<Button
								onClick={handleReview}
								disabled={isLoading || !manuscript.trim()}
								className="w-full text-lg py-6 font-headline"
							>
								{isLoading ? (
									<>
										<Loader2 className="mr-2 h-5 w-5 animate-spin" />{" "}
										正在审稿中...
									</>
								) : (
									<>
										<WandSparkles className="mr-2 h-5 w-5" />
										开始审稿
									</>
								)}
							</Button>

							{reviewResult && (
								<Card
									className={`transition-all duration-500 ${reviewResult.decision === "过稿" ? "bg-green-100/80 dark:bg-green-900/30 border-green-500/50" : "bg-red-100/80 dark:bg-red-900/30 border-red-500/50"}`}
								>
									<CardHeader>
										<div className="flex items-center gap-4">
											{reviewResult.decision === "过稿" ? (
												<CheckCircle className="h-10 w-10 text-green-500 flex-shrink-0" />
											) : (
												<XCircle className="h-10 w-10 text-red-500 flex-shrink-0" />
											)}
											<div>
												<CardTitle
													className={`font-headline text-2xl ${reviewResult.decision === "过稿" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}
												>
													审稿结论：{reviewResult.decision}
												</CardTitle>
												<CardDescription
													className={`${reviewResult.decision === "过稿" ? "text-green-600 dark:text-green-400/80" : "text-red-600 dark:text-red-400/80"}`}
												>
													基于海量过稿数据和编辑经验的综合判断
												</CardDescription>
											</div>
										</div>
									</CardHeader>
									<CardContent className="space-y-3">
										<div className="flex justify-between items-center">
											<Label className="font-headline">审稿理由</Label>
											<Button
												variant="ghost"
												size="sm"
												onClick={handleCopyReason}
											>
												<Copy className="mr-2 h-4 w-4" />
												复制
											</Button>
										</div>
										<div className="p-4 bg-background/50 rounded-md border text-sm text-foreground/80 whitespace-pre-wrap">
											{reviewResult.reason}
										</div>
									</CardContent>
								</Card>
							)}
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}
