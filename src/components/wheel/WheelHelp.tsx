import { CircleHelp } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { helpContent } from "./help-content";

function Emphasis({ text }: { text: string }) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part,
  );
}

/** Uncontrolled dialog state stays local and never enters the session snapshot. */
export function WheelHelp() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button ref={triggerRef} variant="outline" size="sm"><CircleHelp /> Как заполнять</Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        closeLabel="Закрыть инструкцию"
        className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-lg p-0 [&>button]:text-muted-foreground"
        onCloseAutoFocus={(event) => {
          // Returning focus must not scroll the underlying workspace.
          event.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12 text-left">
          <DialogTitle className="font-serif text-2xl">Как заполнять</DialogTitle>
        </DialogHeader>
        <div data-help-scroll className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 pt-5 text-base leading-7 sm:px-8">
          {helpContent.map((block, i) => block.kind === "heading" ? (
            <h2 key={i} className="mb-3 mt-7 font-serif text-xl font-semibold leading-7">{block.text}</h2>
          ) : block.kind === "question" ? (
            <div key={i} className="mb-4 whitespace-pre-line rounded-md border-l-2 border-primary/40 bg-muted px-4 py-3">
              <Emphasis text={block.text} />
            </div>
          ) : (
            <p key={i} className="mb-4 whitespace-pre-line"><Emphasis text={block.text} /></p>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}