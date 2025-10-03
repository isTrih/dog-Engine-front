'use client';

import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { Book, Chapter, Character, WorldSetting } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Globe, Users, FileText } from 'lucide-react';
import ChapterManager from '@/components/ChapterManager';
import Editor from '@/components/Editor';
import WorldBookManager from '@/components/WorldBookManager';
import CharacterCardManager from '@/components/CharacterCardManager';
import { Skeleton } from '@/components/ui/skeleton';

export default function BookPage() {
  const router = useRouter();
  const params = useParams();
  const bookId = params.bookId as string;

  const [books, setBooks] = useLocalStorage<Book[]>('books', []);
  const [worldSettings, setWorldSettings] = useLocalStorage<WorldSetting[]>('worldSettings', []);
  const [characters, setCharacters] = useLocalStorage<Character[]>('characters', []);
  
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  // Lifted state for AI Assistant
  const [aiRole, setAiRole] = useState('一个有创意的故事作家');
  const [aiRoleDisplay, setAiRoleDisplay] = useState('一个有创意的故事作家');


  const currentBook = useMemo(() => {
    return books.find((b) => b.id === bookId);
  }, [books, bookId]);
  
  useEffect(() => {
    if (currentBook) {
      // If there is no active chapter OR the active chapter is not in the current book's chapter list
      if (!activeChapterId || !currentBook.chapters.some(c => c.id === activeChapterId)) {
        // Set the first chapter as active, or null if there are no chapters
        setActiveChapterId(currentBook.chapters[0]?.id || null);
      }
    } else {
        // if the book is not found (e.g., deleted), clear the active chapter
        setActiveChapterId(null);
    }
  }, [currentBook, activeChapterId]);


  const activeChapter = useMemo(() => {
    if (!currentBook || !activeChapterId) return null;
    return currentBook.chapters.find(c => c.id === activeChapterId) || null;
  }, [currentBook, activeChapterId]);
  
  const setActiveChapter = (chapter: Chapter | null) => {
    setActiveChapterId(chapter ? chapter.id : null);
  };

  const updateChapterContent = (chapterId: string, content: string) => {
    const updatedBooks = books.map((book) => {
      if (book.id === bookId) {
        return {
          ...book,
          chapters: book.chapters.map((ch) =>
            ch.id === chapterId ? { ...ch, content } : ch
          ),
        };
      }
      return book;
    });
    setBooks(updatedBooks);
  };
  
  const updateBook = (updatedBook: Book) => {
    const updatedBooks = books.map(b => b.id === updatedBook.id ? updatedBook : b);
    setBooks(updatedBooks);
  }

  // This state helps prevent a flash of "Not Found" while data loads from localStorage
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
      // The hook now initializes with data, so we can set ready immediately.
      // A small delay might still be good for visual consistency on fast reloads.
      const timer = setTimeout(() => setIsReady(true), 50);
      return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-1/4 mb-4" />
        <div className="flex gap-8">
            <div className="w-1/4">
                <Skeleton className="h-96 w-full" />
            </div>
            <div className="w-3/4">
                <Skeleton className="h-full w-full" />
            </div>
        </div>
      </div>
    );
  }

  if (!currentBook) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
          <p className="text-2xl font-bold">书籍未找到</p>
          <Button onClick={() => router.push('/')} className="mt-4">返回书架</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header>
          <div className="flex items-center gap-2 mr-auto ml-4">
              <h1 className="text-xl font-bold font-headline truncate" title={currentBook.title}>{currentBook.title}</h1>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm"><Globe className="mr-2 h-4 w-4" />世界设定</Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col">
              <SheetHeader>
                <SheetTitle className='font-headline'>世界书</SheetTitle>
              </SheetHeader>
              <WorldBookManager worldSettings={worldSettings} setWorldSettings={setWorldSettings} />
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm"><Users className="mr-2 h-4 w-4" />角色卡</Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col">
              <SheetHeader>
                <SheetTitle className='font-headline'>角色卡片</SheetTitle>
              </SheetHeader>
              <CharacterCardManager 
                characters={characters} 
                setCharacters={setCharacters} 
                chapters={currentBook.chapters}
              />
            </SheetContent>
          </Sheet>
      </Header>
      <main className="flex-grow flex overflow-hidden">
        <div className="w-1/4 lg:w-1/5 border-r overflow-y-auto p-2 bg-card/50">
           <ChapterManager 
            book={currentBook}
            updateBook={updateBook}
            activeChapter={activeChapter}
            setActiveChapter={setActiveChapter}
           />
        </div>
        <div className="w-3/4 lg:w-4/5 flex flex-col overflow-hidden">
          {activeChapter ? (
            <Editor 
              key={activeChapter.id}
              chapter={activeChapter} 
              updateChapterContent={updateChapterContent}
              fullContext={{ book: currentBook, characters, worldSettings }}
              aiRole={aiRole}
              setAiRole={setAiRole}
              aiRoleDisplay={aiRoleDisplay}
              setAiRoleDisplay={setAiRoleDisplay}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
              <FileText className="w-16 h-16 mb-4" />
              <h2 className="text-2xl font-bold font-headline">没有选择章节</h2>
              <p className="mt-2">请在左侧选择一个章节进行编辑，或者创建一个新章节。</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
