import { PenTool } from 'lucide-react';

export default function Logo() {
  return (
    <div className="flex items-center gap-2">
      <PenTool className="h-6 w-6 text-primary" />
      <span className="text-xl font-bold tracking-tight text-foreground font-headline">
        正经写作
      </span>
    </div>
  );
}
