'use client';

import type { Character } from '@/lib/types';
import { useState } from 'react';
import { generateUUID } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Plus, Trash2, Edit } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface CharacterCardManagerProps {
  characters: Character[];
  setCharacters: (characters: Character[]) => void;
}

export default function CharacterCardManager({ characters, setCharacters }: CharacterCardManagerProps) {
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Character | null>(null);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const resetForm = () => {
    setName('');
    setDescription('');
    setEditingItem(null);
  };

  const handleSave = () => {
    if (!name.trim() || !description.trim()) return;

    if (editingItem) {
      const updated = characters.map(item =>
        item.id === editingItem.id ? { ...item, name, description } : item
      );
      setCharacters(updated);
    } else {
      const newItem: Character = {
        id: generateUUID(),
        name: name.trim(),
        description: description.trim(),
        enabled: true,
      };
      setCharacters([...characters, newItem]);
    }
    resetForm();
    setIsNewItemDialogOpen(false);
  };

  const handleEditClick = (character: Character) => {
    setEditingItem(character);
    setName(character.name);
    setDescription(character.description);
    setIsNewItemDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setCharacters(characters.filter(item => item.id !== id));
  };

  const handleToggle = (id: string, enabled: boolean) => {
    setCharacters(
      characters.map(item => (item.id === id ? { ...item, enabled } : item))
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-1">
        <Dialog open={isNewItemDialogOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsNewItemDialogOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              添加新角色
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? '编辑角色' : '添加新角色'}</DialogTitle>
              <DialogDescription>
                创建或修改你的角色卡。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">角色名</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="description">角色设定</Label>
                <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">取消</Button>
              </DialogClose>
              <Button onClick={handleSave}>{editingItem ? '保存更改' : '创建'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-grow my-4">
        {characters.length > 0 ? (
            <Accordion type="multiple" className="w-full px-1">
            {characters.map(character => (
                <AccordionItem value={character.id} key={character.id}>
                 <div className="flex items-center w-full pr-4">
                    <Switch
                        className="mt-4 ml-4"
                        checked={character.enabled}
                        onCheckedChange={checked => handleToggle(character.id, checked)}
                        onClick={e => e.stopPropagation()}
                    />
                    <AccordionTrigger className='font-headline'>
                        <span className="truncate">{character.name}</span>
                    </AccordionTrigger>
                </div>
                <AccordionContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap px-2">{character.description}</p>
                    <div className="flex justify-end gap-2 mt-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEditClick(character)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive/70 hover:text-destructive" onClick={() => handleDelete(character.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                </AccordionContent>
                </AccordionItem>
            ))}
            </Accordion>
        ) : (
            <div className="text-center text-muted-foreground p-8">
                <p>还没有角色卡。</p>
                <p>点击上方按钮添加第一个吧！</p>
            </div>
        )}
      </ScrollArea>
    </div>
  );
}
