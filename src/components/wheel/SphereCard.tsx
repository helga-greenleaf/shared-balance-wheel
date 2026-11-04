import { forwardRef, useState } from "react";
import { ChevronDown, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDiff,
  SPHERE_TEXT_FIELDS,
  TEXT_HINTS,
  TEXT_LABELS,
  UNTITLED,
  type Score,
  type Sphere,
} from "@/lib/wheel/model";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  sphere: Sphere;
  index: number;
  selected: boolean;
  primary: boolean;
  expanded: boolean;
  canDelete: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onSet: (field: "name" | "now" | "after" | "max" | "cur" | "aft", v: unknown) => void;
  onTogglePrimary: () => void;
  onDelete: () => void;
}

export function NameInput({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={ariaLabel}
      className={className}
      value={draft ?? value}
      maxLength={200}
      onFocus={(e) => {
        setDraft(value);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={() => {
        if (!draft?.trim()) onChange(UNTITLED);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function ScoreRow({
  label,
  value,
  onChange,
  variant,
}: {
  label: string;
  value: Score;
  onChange: (v: Score) => void;
  variant: "now" | "after";
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-[8.5rem] shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, k) => k + 1).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              "h-7 w-7 rounded-md border text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === v
                ? variant === "now"
                  ? "border-wheel-now bg-wheel-now text-primary-foreground"
                  : "border-wheel-after bg-wheel-after text-primary-foreground"
                : "border-border bg-card hover:bg-accent",
              variant === "after" && value !== v && "border-dashed",
            )}
          >
            {v}
          </button>
        ))}
        <button
          type="button"
          aria-label={`Очистить: ${label}`}
          disabled={value === null}
          onClick={() => onChange(null)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export const SphereCard = forwardRef<HTMLDivElement, Props>(function SphereCard(
  { sphere, index, selected, primary, expanded, canDelete, onToggleExpand, onSelect, onSet, onTogglePrimary, onDelete },
  ref,
) {
  const diff = formatDiff(sphere.now, sphere.after);
  const filled = SPHERE_TEXT_FIELDS.filter((f) => sphere[f].trim()).length;
  return (
    <div
      ref={ref}
      onFocusCapture={onSelect}
      className={cn(
        "rounded-xl border bg-card p-4 shadow-soft transition-colors",
        selected && "border-ring ring-1 ring-ring",
        primary && "bg-[color-mix(in_oklab,var(--highlight)_45%,var(--card))]",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <NameInput
          ariaLabel={`Название сферы ${index + 1}`}
          value={sphere.name}
          onChange={(v) => onSet("name", v)}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-serif text-base font-medium hover:border-border focus:border-input focus:bg-card focus:outline-none"
        />
        <button
          type="button"
          onClick={onTogglePrimary}
          aria-pressed={primary}
          title={primary ? "Снять выбор основной сферы" : "Сделать основной сферой продвижения"}
          className={cn(
            "rounded-md p-1.5 hover:bg-accent",
            primary ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Star className={cn("h-4 w-4", primary && "fill-current")} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? "Удалить сферу" : "Нельзя удалить: минимум 6 сфер"}
          aria-label="Удалить сферу"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {primary && <div className="ml-7 mt-0.5 text-xs font-medium text-primary">Основная сфера продвижения</div>}

      <div className="ml-7 mt-3 space-y-2">
        <ScoreRow label="Сейчас" variant="now" value={sphere.now} onChange={(v) => onSet("now", v)} />
        <ScoreRow label="После продвижения" variant="after" value={sphere.after} onChange={(v) => onSet("after", v)} />
        {diff !== null && <div className="text-xs text-muted-foreground">Разница: {diff}</div>}
      </div>

      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="ml-7 mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        {expanded ? "Свернуть описания" : `Описания${filled ? ` (${filled} из 3)` : ""}`}
      </button>

      {expanded && (
        <div className="ml-7 mt-3 space-y-3">
          {SPHERE_TEXT_FIELDS.map((f) => (
            <label key={f} className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">{TEXT_LABELS[f]}</span>
              <Textarea
                value={sphere[f]}
                placeholder={TEXT_HINTS[f]}
                onChange={(e) => onSet(f, e.target.value)}
                className="min-h-[72px] max-h-[320px] resize-y bg-card text-sm"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
});
