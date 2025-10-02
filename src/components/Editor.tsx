'use client';

import type { Chapter, Book, WorldSetting, Character, CommunityPrompt } from '@/lib/types';
import { respondToPromptInRole } from '@/ai/flows/respond-to-prompt-in-role';
import { listModels, type Model } from '@/ai/flows/list-models';
import { getPrompts } from '@/lib/actions/community';
import { useState, useEffect, useMemo } from 'react';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Bot, Sparkles, Loader2, Settings2, Users, BookOpen, BrainCircuit, ScanLine } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from './ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from './ui/checkbox';
import AiDetector from './AiDetector';
import { GeminiSettings } from './GeminiSettings';
import { 
    generateContent, 
    listGeminiModels, 
    hasApiKey, 
    getDefaultModel,
    type GeminiModel 
} from '@/lib/gemini-client';


interface EditorProps {
  chapter: Chapter;
  updateChapterContent: (chapterId: string, content: string) => void;
  fullContext: {
    book: Book;
    worldSettings: WorldSetting[];
    characters: Character[];
  };
  aiRole: string;
  setAiRole: (role: string) => void;
  aiRoleDisplay: string;
  setAiRoleDisplay: (display: string) => void;
}

const DECONSTRUCT_OUTLINE_KEY = 'deconstruct-outline-result';

export default function Editor({ 
    chapter, 
    updateChapterContent, 
    fullContext,
    aiRole,
    setAiRole,
    aiRoleDisplay,
    setAiRoleDisplay,
}: EditorProps) {
  const [content, setContent] = useState(chapter.content);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [isModelListLoading, setIsModelListLoading] = useState(true);
  const [communityPrompts, setCommunityPrompts] = useState<CommunityPrompt[]>([]);
  const [isCommunityPromptsLoading, setIsCommunityPromptsLoading] = useState(true);
  const [useFrontendApi, setUseFrontendApi] = useState(true); // 使用前端API

  const [selectedModel, setSelectedModel] = useState('');
  const [temperature, setTemperature] = useState([0.7]);
  const [maxTokens, setMaxTokens] = useState([2048]);
  
  const [includeThoughts, setIncludeThoughts] = useState(true);
  const [thinkingBudget, setThinkingBudget] = useState([-1]);


  const [contextChapterIds, setContextChapterIds] = useState<Set<string>>(new Set());
  
  const otherChapters = useMemo(() => {
    return fullContext.book.chapters.filter(c => c.id !== chapter.id);
  }, [fullContext.book.chapters, chapter.id]);
  
  // Sync editor content with the active chapter prop
  useEffect(() => {
    setContent(chapter.content);
  }, [chapter]);


  useEffect(() => {
    const outline = localStorage.getItem(DECONSTRUCT_OUTLINE_KEY);
    if (outline) {
      setPrompt(outline);
      localStorage.removeItem(DECONSTRUCT_OUTLINE_KEY);
      setIsAiDialogOpen(true); // Open the dialog automatically
      toast({
        title: '细纲已应用',
        description: '从书城拆解的细纲已自动填充到指令框中。'
      })
    }
  }, []);


  useEffect(() => {
    async function fetchInitialData() {
      // 加载AI模型列表
      try {
        setIsModelListLoading(true);
        
        // 始终使用前端API加载模型
        if (hasApiKey()) {
          const models = await listGeminiModels();
          setAvailableModels(models);
          const flashModel = models.find(m => m.id.includes('gemini-2.5-flash') || m.id.includes('2.5-flash'));
          if (flashModel) {
              setSelectedModel(flashModel.id);
          } else if (models.length > 0) {
              setSelectedModel(models[0].id);
          }
        } else {
          // 未配置API密钥时使用默认列表
          const defaultModels: GeminiModel[] = [
            { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
          ];
          setAvailableModels(defaultModels);
          setSelectedModel(getDefaultModel());
        }
      } catch (error) {
        console.error("Failed to fetch models:", error);
        toast({
            title: '模型列表加载失败',
            description: '无法从API获取语言模型列表，将使用默认模型。',
            variant: 'destructive',
        });
         setSelectedModel(getDefaultModel());
      } finally {
        setIsModelListLoading(false);
      }
      
      // 加载社区提示
      try {
        setIsCommunityPromptsLoading(true);
        const prompts = await getPrompts();
        setCommunityPrompts(prompts);
      } catch (error) {
         console.error("Failed to fetch community prompts:", error);
         toast({
            title: '社区设定加载失败',
            description: '无法加载社区分享的角色设定。',
            variant: 'destructive',
        });
      } finally {
        setIsCommunityPromptsLoading(false);
      }
    }
    fetchInitialData();
  }, [toast]);


  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    updateChapterContent(chapter.id, e.target.value);
  };
  
  const handleCommunityPromptSelect = (promptId: string) => {
    const selected = communityPrompts.find(p => p.id === promptId);
    if (selected) {
        setAiRole(selected.prompt);
        setAiRoleDisplay(selected.name); // Show name in input
    }
  }

  const handleAiRoleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAiRoleDisplay(e.target.value); // Update display value
    setAiRole(e.target.value); // Also update the actual role value
  }
  
  const handleContextChapterToggle = (chapterId: string) => {
    setContextChapterIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(chapterId)) {
            newSet.delete(chapterId);
        } else {
            newSet.add(chapterId);
        }
        return newSet;
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: '提示不能为空',
        description: '请输入一些内容来引导AI。',
        variant: 'destructive',
      });
      return;
    }

    // 检查API密钥
    if (!hasApiKey()) {
      toast({
        title: '请先配置API密钥',
        description: '请点击右上角AI设置按钮配置您的Gemini API密钥',
        variant: 'destructive',
      });
      return;
    }
    
    setIsLoading(true);
    setIsAiDialogOpen(false);
    try {
      
      const characterContext = fullContext.characters
        .filter(c => c.enabled)
        .map(c => `角色名: ${c.name}\n设定: ${c.description}`)
        .join('\n\n');

      const worldBookContext = fullContext.worldSettings
        .filter(ws => ws.enabled && content.includes(ws.keyword))
        .map(ws => `关键词: ${ws.keyword}\n设定: ${ws.description}`)
        .join('\n\n');
      
      const otherChaptersContext = fullContext.book.chapters
        .filter(c => contextChapterIds.has(c.id))
        .map(c => `--- Begin Chapter: ${c.title} ---\n${c.content}\n--- End Chapter: ${c.title} ---`)
        .join('\n\n');

      const fullChapterContext = `${content}\n\n${otherChaptersContext}`;

      // 构建系统指令
      const systemInstruction = `你是一个专业的网络小说写作助手。

${aiRole ? `你的角色设定：${aiRole}\n` : ''}
${characterContext ? `\n=== 角色设定 ===\n${characterContext}\n` : ''}
${worldBookContext ? `\n=== 世界设定 ===\n${worldBookContext}\n` : ''}
${fullChapterContext ? `\n=== 当前章节内容 ===\n${fullChapterContext}\n` : ''}

请根据用户的指令和以上上下文信息进行创作。`;

      // 使用前端API调用Gemini
      const result = await generateContent(
        selectedModel,
        prompt,
        {
          temperature: temperature[0],
          maxOutputTokens: maxTokens[0],
          systemInstruction,
        }
      );
      
      setContent(result);
      updateChapterContent(chapter.id, result);
      setPrompt('');

    } catch (error: any) {
      console.error('AI generation failed:', error);
      toast({
        title: '生成失败',
        description: error.message || 'AI生成内容时出现错误，请稍后再试。',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const budgetValue = thinkingBudget[0];
  const budgetLabel = budgetValue === -1 ? '动态' : budgetValue === 0 ? '关闭' : budgetValue;


  return (
    <div className="flex flex-col h-full bg-background relative">
        <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-2xl font-bold font-headline">{chapter.title}</h2>
            <div className='flex items-center gap-2'>
                <GeminiSettings showStatus={true} />
                <AiDetector text={content} />
            </div>
        </div>
        <ScrollArea className="flex-grow">
            <Textarea
                value={content}
                onChange={handleContentChange}
                placeholder="在这里开始你的故事..."
                className="w-full h-full text-base resize-none border-0 focus:ring-0 focus-visible:ring-0 p-6 bg-transparent"
                style={{minHeight: 'calc(100vh - 200px)'}}
            />
        </ScrollArea>
        
        <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
            <DialogTrigger asChild>
                 <Button className="absolute bottom-6 right-6 rounded-full h-12 w-12 shadow-lg">
                    <Sparkles className="h-6 w-6" />
                 </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-headline text-lg"><Bot /> AI 写作助手</DialogTitle>
                    <DialogDescription>
                        配置 AI 的行为，然后让它帮你继续创作。
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-6 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="ai-role">AI 角色设定</Label>
                            <div className="flex gap-2">
                                <Input 
                                    id="ai-role" 
                                    value={aiRoleDisplay} 
                                    onChange={handleAiRoleInputChange}
                                    placeholder="例如：一个愤世嫉俗的侦探"
                                    className="flex-grow"
                                />
                                <Select onValueChange={handleCommunityPromptSelect} disabled={isCommunityPromptsLoading}>
                                    <SelectTrigger className="w-[130px] flex-shrink-0">
                                        <SelectValue placeholder={
                                            <div className='flex items-center gap-2'>
                                                <Users className="h-4 w-4"/>
                                                <span>社区设定</span>
                                            </div>
                                        } />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {isCommunityPromptsLoading ? (
                                            <SelectItem value="loading" disabled>加载中...</SelectItem>
                                        ) : (
                                            communityPrompts.map(prompt => (
                                                <SelectItem key={prompt.id} value={prompt.id}>{prompt.name}</SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="ai-prompt">你的指令</Label>
                            <Textarea 
                                id="ai-prompt"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="接下来会发生什么？"
                                rows={4}
                            />
                        </div>
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="context-chapters">
                                <AccordionTrigger>
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="h-4 w-4" />
                                        上下文章节 ({contextChapterIds.size})
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-2">
                                    <ScrollArea className="h-40 w-full rounded-md border p-2">
                                        <div className="space-y-2">
                                        {otherChapters.length > 0 ? otherChapters.map(chap => (
                                            <div key={chap.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`context-${chap.id}`}
                                                    checked={contextChapterIds.has(chap.id)}
                                                    onCheckedChange={() => handleContextChapterToggle(chap.id)}
                                                />
                                                <label
                                                    htmlFor={`context-${chap.id}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                >
                                                    {chap.title}
                                                </label>
                                            </div>
                                        )) : (
                                            <p className="text-sm text-muted-foreground text-center p-4">没有其他章节可供选择。</p>
                                        )}
                                        </div>
                                    </ScrollArea>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="item-1">
                                <AccordionTrigger>
                                    <div className="flex items-center gap-2">
                                        <Settings2 className="h-4 w-4" />
                                        高级设置
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="pt-4 space-y-6">
                                    <div className="grid gap-2">
                                        <Label>语言模型</Label>
                                        <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isModelListLoading}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={isModelListLoading ? "加载中..." : "选择一个模型"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableModels.map(model => (
                                                    <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            {hasApiKey() ? (
                                                <span className="text-green-600 dark:text-green-400">✓ 使用您的API密钥</span>
                                            ) : (
                                                <span className="text-amber-600 dark:text-amber-400">⚠ 请先配置API密钥</span>
                                            )}
                                        </p>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>温度 (Temperature): {temperature[0].toFixed(2)}</Label>
                                        <Slider
                                            value={temperature}
                                            onValueChange={setTemperature}
                                            max={1}
                                            step={0.05}
                                        />
                                        <p className="text-xs text-muted-foreground">值越低，结果越确定；值越高，结果越有创意。</p>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>最长输出: {maxTokens[0]} tokens</Label>
                                        <Slider
                                            value={maxTokens}
                                            onValueChange={setMaxTokens}
                                            max={8192}
                                            step={128}
                                            min={256}
                                        />
                                        <p className="text-xs text-muted-foreground">控制单次生成内容的最大长度。</p>
                                    </div>

                                    <div className="space-y-4 rounded-md border p-4">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="include-thoughts" className="flex items-center gap-2">
                                                <BrainCircuit className="h-4 w-4" />
                                                包含思考过程
                                            </Label>
                                            <Switch
                                                id="include-thoughts"
                                                checked={includeThoughts}
                                                onCheckedChange={setIncludeThoughts}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>思考预算: {budgetLabel}</Label>
                                            <Slider
                                                value={thinkingBudget}
                                                onValueChange={setThinkingBudget}
                                                max={8192}
                                                step={128}
                                                min={-1}
                                                disabled={!includeThoughts}
                                            />
                                            <p className="text-xs text-muted-foreground">指导AI思考的Token量。-1为动态，0为关闭。</p>
                                        </div>
                                    </div>

                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary">取消</Button>
                    </DialogClose>
                    <Button onClick={handleGenerate} disabled={isLoading || !prompt.trim()}>
                        {isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        生成内容
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        {isLoading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-sm z-10">
                <div className="flex items-center gap-2 text-lg font-semibold">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    AI 思考中...
                </div>
            </div>
        )}
    </div>
  );
}
