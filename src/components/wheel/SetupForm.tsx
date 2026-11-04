import { useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_SPHERES, MIN_SPHERES } from "@/lib/wheel/model";
import { WheelHelp } from "./WheelHelp";

interface Props {
  /** Synced draft list from the shared session (may be empty). */
  initialList: string[];
  busy: boolean;
  importBusy: boolean;
  onLoadFile: (file: File) => void;
  onListChange: (names: string[]) => void;
  onComplete: (names: string[]) => void;
}

const withMinRows = (list: string[]): string[] => {
  const rows = list.slice(0, MAX_SPHERES);
  while (rows.length < MIN_SPHERES) rows.push("");
  return rows;
};

/**
 * Initial step for a fresh session: collect 6–15 sphere names before the
 * wheel is shown. The draft list syncs between participants and survives
 * page reloads (through the session's local backup).
 */
export function SetupForm({ initialList, busy, importBusy, onLoadFile, onListChange, onComplete }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[]>(() => withMinRows(initialList));
  const lastSent = useRef<string[]>(rows);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusNext = useRef<number | null>(null);

  // Adopt remote edits from the other participant, but never clobber what
  // this participant is typing right now.
  useEffect(() => {
    if (JSON.stringify(initialList) !== JSON.stringify(lastSent.current)) {
      lastSent.current = initialList;
      setRows(withMinRows(initialList));
    }
  }, [initialList]);

  useEffect(() => {
    if (focusNext.current !== null) {
      inputRefs.current[focusNext.current]?.focus();
      focusNext.current = null;
    }
  }, [rows]);

  const emit = (next: string[]) => {
    setRows(next);
    lastSent.current = next;
    onListChange(next);
  };
  const setRow = (i: number, v: string) => emit(rows.map((r, j) => (j === i ? v : r)));
  const addRow = () => {
    if (rows.length >= MAX_SPHERES) return;
    focusNext.current = rows.length;
    emit([...rows, ""]);
  };
  const removeRow = (i: number) => {
    if (rows.length <= MIN_SPHERES) return;
    emit(rows.filter((_, j) => j !== i));
  };

  const ready = rows.every((r) => r.trim().length > 0);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Какие сферы включим в колесо?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Назовите от {MIN_SPHERES} до {MAX_SPHERES} сфер жизни. Оценки и описания появятся на следующем шаге.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy || importBusy}>
          {importBusy ? <Loader2 className="animate-spin" /> : <FolderOpen />} Загрузить
        </Button>
        <WheelHelp />
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onLoadFile(file);
          }} />

        <div className="mt-6 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                value={r}
                maxLength={200}
                placeholder={`Сфера ${i + 1}`}
                aria-label={`Название сферы ${i + 1}`}
                onChange={(e) => setRow(i, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={rows.length <= MIN_SPHERES}
                title={rows.length <= MIN_SPHERES ? `Минимум ${MIN_SPHERES} сфер` : "Убрать строку"}
                aria-label={`Убрать строку ${i + 1}`}
                className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={addRow} disabled={rows.length >= MAX_SPHERES}>
            <Plus /> Добавить
          </Button>
          <span className="text-xs text-muted-foreground">
            {rows.length >= MAX_SPHERES
              ? `Достигнут максимум — ${MAX_SPHERES} сфер.`
              : rows.length <= MIN_SPHERES
                ? `Минимум ${MIN_SPHERES} сфер.`
                : `Можно от ${MIN_SPHERES} до ${MAX_SPHERES} сфер.`}
          </span>
        </div>

        <div className="mt-6">
          <Button className="w-full" disabled={!ready || busy || importBusy} onClick={() => onComplete(rows.map((r) => r.trim()))}>
            {busy && <Loader2 className="animate-spin" />} Заполнить
          </Button>
          {!ready && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Заполните названия всех сфер, чтобы продолжить.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
