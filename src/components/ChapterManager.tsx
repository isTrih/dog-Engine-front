'use client';

import type { Book, Chapter } from '@/lib/types';
import { Button } from './ui/button';
import { Plus, Trash2, FileText, Edit, Download } from 'lucide-react';
import { cn, generateUUID } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useState } from 'react';

interface ChapterManagerProps {
  book: Book;
  updateBook: (book: Book) => void;
  activeChapter: Chapter | null;
  setActiveChapter: (chapter: Chapter | null) => void;
}

export default function ChapterManager({ book, updateBook, activeChapter, setActiveChapter }: ChapterManagerProps) {
  const [isRenaming, setIsRenaming] = useState<Chapter | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const handleAddChapter = () => {
    const newChapter: Chapter = {
      id: generateUUID(),
      title: `新章节 ${book.chapters.length + 1}`,
      content: '',
    };
    const updatedBook = { ...book, chapters: [...book.chapters, newChapter] };
    updateBook(updatedBook);
    setActiveChapter(newChapter);
  };

  const handleDeleteChapter = (chapterId: string) => {
    const updatedChapters = book.chapters.filter((c) => c.id !== chapterId);
    const updatedBook = { ...book, chapters: updatedChapters };
    updateBook(updatedBook);
    if (activeChapter?.id === chapterId) {
      setActiveChapter(updatedChapters.length > 0 ? updatedChapters[0] : null);
    }
  };
  
  const handleRenameChapter = () => {
    if (!isRenaming || !newChapterTitle.trim()) return;

    const updatedChapters = book.chapters.map(c => 
      c.id === isRenaming.id ? { ...c, title: newChapterTitle.trim() } : c
    );
    const updatedBook = { ...book, chapters: updatedChapters };
    updateBook(updatedBook);
    if (activeChapter?.id === isRenaming.id) {
        setActiveChapter(updatedChapters.find(c => c.id === isRenaming.id) || null);
    }
    handleCloseRenameDialog();
  };

  const handleCloseRenameDialog = () => {
    setIsRenaming(null);
    setNewChapterTitle('');
  }

  const openRenameDialog = (chapter: Chapter, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRenaming(chapter);
    setNewChapterTitle(chapter.title);
  }

  const fetchIntoEditor = async (chapter: Chapter, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!book.sourceId || !chapter.url) return;
    try {
      const res = await fetch(`/api/bookstore/chapter?url=${encodeURIComponent(chapter.url)}&sourceId=${book.sourceId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success) return;
      const updatedChapters = book.chapters.map(c => c.id === chapter.id ? { ...c, content: data.chapter.content, title: chapter.title || data.chapter.title } : c);
      const updatedBook = { ...book, chapters: updatedChapters };
      updateBook(updatedBook);
      setActiveChapter(updatedChapters.find(c => c.id === chapter.id) || null);
    } catch (e) {
      // ignore
    }
  }

  return (
    <div className="flex flex-col h-full">
        <div className="p-2 flex-shrink-0">
            <Button onClick={handleAddChapter} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                新建章节
            </Button>
        </div>
        <div className="flex-grow overflow-y-auto">
            {book.chapters.length > 0 ? (
                <ul className="space-y-1 p-2">
                {book.chapters.map((chapter) => (
                    <li key={chapter.id}>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveChapter(chapter)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveChapter(chapter); }}
                        className={cn(
                        'w-full text-left p-2 rounded-md flex items-center justify-between group cursor-pointer',
                        activeChapter?.id === chapter.id
                            ? 'bg-primary/20 text-primary-foreground'
                            : 'hover:bg-accent/50'
                        )}
                    >
                        <span className="truncate pr-2">{chapter.title}</span>
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                           {chapter.url && book.sourceId && (
                             <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => fetchIntoEditor(chapter, e)} title="抓取章节内容">
                                <Download className="h-4 w-4" />
                              </Button>
                           )}
                           <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => openRenameDialog(chapter, e)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>确定要删除此章节吗？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        此操作无法撤销。章节内容将被永久删除。
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteChapter(chapter.id)} className="bg-destructive hover:bg-destructive/90">删除</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                    </li>
                ))}
                </ul>
            ) : (
                <div className="text-center p-4 text-muted-foreground text-sm">
                    暂无章节
                </div>
            )}
        </div>
        <Dialog open={!!isRenaming} onOpenChange={(open) => !open && handleCloseRenameDialog()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>重命名章节</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="chapter-name">新章节名</Label>
                    <Input id="chapter-name" value={newChapterTitle} onChange={e => setNewChapterTitle(e.target.value)} />
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary" onClick={handleCloseRenameDialog}>取消</Button>
                    </DialogClose>
                    <Button onClick={handleRenameChapter}>保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
