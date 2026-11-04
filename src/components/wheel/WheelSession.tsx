import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Cloud,
  CloudOff,
  Download,
  FileDown,
  FolderOpen,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useWheelSync, rememberSession, type Conflict, type SyncStatus } from "@/lib/wheel/sync";
import {
  DEFAULT_TITLE,
  MAX_SPHERES,
  MIN_SPHERES,
  sKey,
  sphereHasData,
  TEXT_LABELS,
  todayLocal,
  fileSlug,
  type WheelView,
} from "@/lib/wheel/model";
import { parseWheelFile, viewToFile, type WheelFileInput } from "@/lib/wheel/file-schema";
import { createSession, importSession } from "@/lib/wheel/session.functions";
import { downloadBlob } from "@/lib/wheel/download";
import { WheelChart, WheelLegend, type ScoreTarget, type ViewMode } from "./WheelChart";
import { NameInput, SphereCard } from "./SphereCard";
import { SetupForm } from "./SetupForm";

type Confirm = {
  title: string;
  body: string;
  action: string;
  destructive?: boolean;
  onConfirm: () => void;
  secondary?: { label: string; onClick: () => void };
};

function StatusBadge({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, { icon: React.ReactNode; text: string; cls: string }> = {
    loading: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: "Загрузка", cls: "" },
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: "Сохраняется", cls: "" },
    saved: { icon: <Cloud className="h-3.5 w-3.5" />, text: "Сохранено", cls: "text-primary" },
    offline: { icon: <CloudOff className="h-3.5 w-3.5" />, text: "Нет соединения", cls: "text-destructive" },
    local: {
      icon: <CloudOff className="h-3.5 w-3.5" />,
      text: "Нет соединения · изменения сохранены в этом браузере",
      cls: "text-destructive",
    },
  };
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", m.cls)} role="status" aria-live="polite">
      {m.icon}
      {m.text}
    </span>
  );
}

function fieldLabel(k: string, view: WheelView) {
  if (k === "title") return "Название колеса";
  if (k === "firstSteps") return "Первые шаги";
  const [, sid, f] = k.split(":");
  const s = view.spheres.find((x) => x.id === sid);
  const name = s?.name ?? "сфера";
  const fl = f === "name" ? "Название" : TEXT_LABELS[f as keyof typeof TEXT_LABELS] ?? f;
  return `${name} — ${fl}`;
}

export function WheelSession({ id, secret }: { id: string; secret: string }) {
  const sync = useWheelSync(id, secret);
  const { view } = sync;
  const [mode, setMode] = useState<ViewMode>("now");
  const [target, setTarget] = useState<ScoreTarget>("now");
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [pdf, setPdf] = useState<{ blob: Blob; name: string } | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    rememberSession(id, secret);
  }, [id, secret]);

  useEffect(() => {
    for (const n of sync.takeNotices()) toast.error(n);
  });

  const n = view.spheres.length;
  const selectFromChart = (sid: string) => {
    setSelected(sid);
    cardRefs.current[sid]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const exportJson = () => {
    const snap = sync.snapshot();
    const blob = new Blob([JSON.stringify(viewToFile(snap), null, 2)], { type: "application/json" });
    downloadBlob(blob, `${fileSlug(snap.title)}_${snap.date || "bez-daty"}.json`);
    toast.success("Файл сохранён");
  };

  const goTo = (nid: string, nsecret: string) => {
    rememberSession(nid, nsecret);
    window.location.assign(`/s/${nid}#k=${nsecret}`);
  };

  const startOver = () =>
    setConfirm({
      title: "Начать заново?",
      body: "Будет создано новое пустое колесо с новой ссылкой. Текущая сессия не удаляется: по старой ссылке её можно открыть снова. Сначала можно сохранить текущую работу в файл.",
      action: "Начать заново",
      secondary: { label: "Сохранить файл", onClick: exportJson },
      onConfirm: async () => {
        setBusy("new");
        try {
          const r = await createSession({ data: { date: todayLocal() } });
          goTo(r.id, r.secret);
        } catch {
          toast.error("Не удалось создать новую сессию. Проверьте соединение.");
          setBusy(null);
        }
      },
    });

  const onFile = async (file: File) => {
    const text = await file.text();
    const res = parseWheelFile(text);
    if (!res.ok) {
      toast.error(`Файл не загружен. ${res.error} Текущая работа не изменена.`, { duration: 8000 });
      return;
    }
    const data: WheelFileInput = res.data;
    if (!view.setupDone) {
      setBusy("import");
      try {
        const r = await importSession({ data });
        goTo(r.id, r.secret);
      } catch {
        toast.error("Не удалось загрузить файл. Список сфер не изменён.");
        setBusy(null);
      }
      return;
    }
    setConfirm({
      title: "Открыть файл как новую сессию?",
      body: `«${data.title}» откроется как отдельная сессия с новой ссылкой. Текущая сессия не изменится. Перед переходом можно сохранить текущую работу.`,
      action: "Открыть",
      secondary: { label: "Сохранить файл", onClick: exportJson },
      onConfirm: async () => {
        setBusy("import");
        try {
          const r = await importSession({ data });
          goTo(r.id, r.secret);
        } catch {
          toast.error("Не удалось загрузить файл на сервер. Текущая работа не изменена.");
          setBusy(null);
        }
      },
    });
  };

  const makePdf = async () => {
    setBusy("pdf");
    try {
      const snap = sync.snapshot();
      const { buildPdf, pdfFileName } = await import("@/lib/wheel/pdf");
      const bytes = await buildPdf(snap);
      setPdf({ blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), name: pdfFileName(snap) });
    } catch (e) {
      console.error(e);
      toast.error("Не удалось создать PDF");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/s/${id}#k=${secret}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована", {
        description: "Любой, у кого есть ссылка, может просматривать и редактировать это колесо.",
      });
    } catch {
      window.prompt("Скопируйте ссылку. Любой, у кого есть ссылка, может просматривать и редактировать это колесо.", url);
    }
  };

  const copyScores = () => {
    const apply = () => {
      for (const s of view.spheres) sync.set(sKey(s.id, "after"), s.now);
      toast.success("Текущие оценки скопированы в «После продвижения»");
    };
    if (view.spheres.some((s) => s.after !== null))
      setConfirm({
        title: "Заменить оценки «После продвижения»?",
        body: "Во втором наборе уже есть оценки. Они будут заменены текущими. Описания не изменятся.",
        action: "Заменить",
        onConfirm: apply,
      });
    else apply();
  };

  const requestDelete = (sid: string) => {
    const s = view.spheres.find((x) => x.id === sid);
    if (!s) return;
    if (n <= MIN_SPHERES) return;
    if (!sphereHasData(s)) return sync.deleteSphere(sid);
    setConfirm({
      title: `Удалить сферу «${s.name}»?`,
      body: "Будут удалены её оценки в обоих состояниях и все описания. Это действие нельзя отменить.",
      action: "Удалить",
      destructive: true,
      onConfirm: () => sync.deleteSphere(sid),
    });
  };

  if (sync.error === "denied")
    return (
      <Centered title="Нет доступа">
        Ссылка неверна или ключ доступа повреждён. Попросите у участника сессии полную ссылку.
      </Centered>
    );
  if (sync.error === "load")
    return (
      <Centered title="Не удалось загрузить колесо">
        Проверьте соединение и обновите страницу. Новое колесо не создавалось, данные сессии не изменены.
        <div className="mt-4">
          <Button onClick={() => window.location.reload()}>Обновить</Button>
        </div>
      </Centered>
    );
  if (!sync.loaded)
    return (
      <Centered title="Загружаем колесо…">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </Centered>
    );

  // Fresh sessions first collect the sphere list; old sessions and imports
  // have no "setup" flag and go straight to the working interface.
  if (!view.setupDone)
    return (
      <SetupForm
        initialList={view.setupList}
        busy={setupBusy}
        importBusy={busy === "import"}
        onLoadFile={(file) => { void onFile(file); }}
        onListChange={(names) => sync.set("setupList", names)}
        onComplete={async (names) => {
          setSetupBusy(true);
          try {
            await sync.completeSetup(names);
          } catch {
            toast.error("Не удалось сохранить список сфер. Проверьте соединение и попробуйте снова.");
          } finally {
            setSetupBusy(false);
          }
        }}
      />
    );

  const hasAnyAfter = view.spheres.some((s) => s.now !== null);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <NameInput
              ariaLabel="Название колеса"
              value={view.title}
              onChange={(v) => sync.set("title", v.trim() ? v : DEFAULT_TITLE)}
              className="w-full max-w-xl rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-serif text-2xl font-semibold tracking-tight hover:border-border focus:border-input focus:bg-card focus:outline-none"
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1.5">
              <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                Дата составления
                <input
                  type="date"
                  value={view.date}
                  onChange={(e) => e.target.value && sync.set("date", e.target.value)}
                  className="rounded-md border border-input bg-card px-2 py-0.5 text-sm text-foreground"
                />
              </label>
              <StatusBadge status={sync.status} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="default" size="sm" onClick={share}>
              <Share2 /> Поделиться
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson}>
              <Save /> Сохранить
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <FolderOpen /> Загрузить
            </Button>
            <Button variant="outline" size="sm" onClick={makePdf} disabled={busy === "pdf"}>
              {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />} Скачать PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={startOver} disabled={busy === "new"}>
              <RotateCcw /> Начать заново
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onFile(f);
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border bg-card p-3 shadow-soft sm:px-4 sm:py-3">
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[auto_1fr]">
              <div className="inline-flex rounded-lg border bg-muted p-0.5" role="tablist" aria-label="Режим просмотра">
                {(
                  [
                    ["now", "Сейчас"],
                    ["after", "Развитие"],
                    ["both", "Оба"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm transition-colors",
                      mode === m ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
                <div className={cn("inline-flex items-center justify-self-end gap-2 text-sm", mode !== "both" && "invisible")} aria-hidden={mode !== "both"}>
                  <span className="whitespace-nowrap text-muted-foreground">Редактировать:</span>
                  <div className="inline-flex rounded-lg border p-0.5">
                    {(
                      [
                        ["now", "Сейчас"],
                        ["after", "Развитие"],
                      ] as const
                    ).map(([t, label]) => (
                      <button
                        key={t}
                        aria-pressed={target === t}
                        aria-label={`Редактировать: ${label}`}
                        disabled={mode !== "both"}
                        onClick={() => setTarget(t)}
                        className={cn(
                          "rounded-md px-2.5 py-1 transition-colors",
                          target === t
                            ? t === "now"
                              ? "bg-wheel-now text-primary-foreground"
                              : "bg-wheel-after text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
            </div>
            <div className="mt-2">
              <WheelChart
                spheres={view.spheres}
                mode={mode}
                target={target}
                primary={view.primary}
                selectedId={selected}
                onSelect={selectFromChart}
                onScore={(sid, t, v) => sync.set(sKey(sid, t), v)}
                onRename={(sid, name) => sync.set(sKey(sid, "name"), name)}
              />
            </div>
            <WheelLegend mode={mode} />
          </div>

          <div className="rounded-2xl border bg-card p-3 shadow-soft sm:p-4">
            <label htmlFor="first-steps" className="font-serif text-lg font-medium">
              Первые шаги
            </label>
            <Textarea
              id="first-steps"
              value={view.firstSteps}
              onChange={(e) => sync.set("firstSteps", e.target.value)}
              placeholder="С чего вы начнёте?"
              className="mt-2 min-h-[96px] max-h-[360px] resize-y bg-card"
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">
              Сферы
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyScores} disabled={!hasAnyAfter} title="Однократно скопировать оценки «Сейчас» во второй набор">
                Скопировать текущие оценки
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAll((x) => !x);
                  setCollapsed({});
                }}
              >
                {showAll ? "Скрыть описания" : "Показать описания"}
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {view.spheres.map((s, i) => (
              <SphereCard
                key={s.id}
                ref={(el) => {
                  cardRefs.current[s.id] = el;
                }}
                sphere={s}
                index={i}
                selected={selected === s.id}
                primary={view.primary === s.id}
                expanded={collapsed[s.id] === undefined ? showAll : !collapsed[s.id]}
                canDelete={n > MIN_SPHERES}
                onToggleExpand={() =>
                  setCollapsed((c) => {
                    const cur = c[s.id] === undefined ? showAll : !c[s.id];
                    return { ...c, [s.id]: cur };
                  })
                }
                onSelect={() => setSelected(s.id)}
                onSet={(f, v) => sync.set(sKey(s.id, f), v)}
                onTogglePrimary={() => sync.set("primary", view.primary === s.id ? null : s.id)}
                onDelete={() => requestDelete(s.id)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="outline" onClick={() => setSelected(sync.addSphere())} disabled={n >= MAX_SPHERES}>
              <Plus /> Добавить сферу
            </Button>
            <span className="text-xs text-muted-foreground">
              {n >= MAX_SPHERES
                ? "Достигнут максимум — 15 сфер."
                : n <= MIN_SPHERES
                  ? "Минимум 6 сфер: удаление станет доступно после добавления новой."
                  : `Можно от ${MIN_SPHERES} до ${MAX_SPHERES} сфер.`}
            </span>
          </div>
        </section>
      </main>

      <ConflictDialog conflicts={sync.conflicts} view={view} onResolve={sync.resolveConflict} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            {confirm?.secondary && (
              <Button variant="outline" onClick={confirm.secondary.onClick}>
                <Download /> {confirm.secondary.label}
              </Button>
            )}
            <AlertDialogAction
              className={confirm?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              {confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pdf} onOpenChange={(o) => !o && setPdf(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PDF готов</AlertDialogTitle>
            <AlertDialogDescription>{pdf?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Закрыть</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pdf) downloadBlob(pdf.blob, pdf.name);
                setPdf(null);
              }}
            >
              <Download className="mr-1 h-4 w-4" /> Скачать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConflictDialog({
  conflicts,
  view,
  onResolve,
}: {
  conflicts: Conflict[];
  view: WheelView;
  onResolve: (k: string, keep: "mine" | "theirs") => void;
}) {
  const c = conflicts[0];
  return (
    <AlertDialog open={!!c}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Поле изменили одновременно</AlertDialogTitle>
          <AlertDialogDescription>
            Другой участник изменил «{c ? fieldLabel(c.k, view) : ""}», пока вы его редактировали. Выберите, какой текст оставить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {c && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Версия другого участника</div>
              <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-2 text-sm">{String(c.theirs ?? "") || "—"}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Ваша версия</div>
              <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-2 text-sm">{String(c.mine ?? "") || "—"}</div>
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => c && onResolve(c.k, "theirs")}>
            Оставить версию участника
          </Button>
          <Button onClick={() => c && onResolve(c.k, "mine")}>Оставить мою</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="mt-3 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
