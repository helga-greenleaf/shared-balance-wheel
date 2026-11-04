import { Button } from "@/components/ui/button";
import { Globe, Send } from "lucide-react";

export function WheelFooter() {
  return (
    <footer className="mx-auto mt-10 w-full max-w-[1400px] shrink-0 px-4 sm:px-6">
      <div className="flex flex-col gap-5 border-t py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Автор инструмента</p>
          <p className="mt-1 font-serif text-lg font-medium">Анна Доманицкая</p>
        </div>
        <nav aria-label="Ссылки автора" className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Button asChild variant="link" className="h-auto rounded-sm p-0 text-base font-normal hover:text-foreground focus-visible:ring-2 focus-visible:ring-offset-4">
            <a href="https://make-it-done.pro/" target="_blank" rel="noopener noreferrer"><Globe aria-hidden="true" /> Мой сайт</a>
          </Button>
          <Button asChild variant="link" className="h-auto rounded-sm p-0 text-base font-normal hover:text-foreground focus-visible:ring-2 focus-visible:ring-offset-4">
            <a href="https://t.me/catsandcoaching" target="_blank" rel="noopener noreferrer"><Send aria-hidden="true" /> Канал в Telegram</a>
          </Button>
        </nav>
      </div>
    </footer>
  );
}