import { z } from "zod";
import { MAX_SPHERES, MIN_SPHERES, type WheelView } from "./model";

export const FILE_FORMAT = "koleso-balansa";
export const FILE_VERSION = 1;

const score = z.number().int().min(1).max(10).nullable();
const text = z.string().max(20000);

export const wheelFileSchema = z
  .object({
    format: z.literal(FILE_FORMAT),
    version: z.literal(FILE_VERSION),
    title: z.string().max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    primarySphereId: z.string().uuid().nullable(),
    additionalSphereIds: z.array(z.string().uuid()).max(2).optional().default([]),
    firstSteps: text,
    spheres: z
      .array(
        z.object({
          id: z.string().uuid(),
          order: z.number().int(),
          name: z.string().max(200),
          scoreNow: score,
          scoreAfter: score,
          maxResult: text,
          whereNow: text,
          afterProgress: text,
        }),
      )
      .min(MIN_SPHERES)
      .max(MAX_SPHERES),
  })
  .superRefine((d, ctx) => {
    const ids = new Set(d.spheres.map((s) => s.id));
    if (ids.size !== d.spheres.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Повторяющиеся ID сфер" });
    if (d.primarySphereId && !ids.has(d.primarySphereId))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Основная сфера не найдена" });
    if (new Set(d.additionalSphereIds).size !== d.additionalSphereIds.length || d.additionalSphereIds.some((id) => !ids.has(id) || id === d.primarySphereId))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Дополнительные сферы должны быть различными и отличаться от основной" });
  })
  .transform((d) => ({
    title: d.title,
    date: d.date,
    primarySphereId: d.primarySphereId,
    additionalSphereIds: d.additionalSphereIds,
    firstSteps: d.firstSteps,
    spheres: [...d.spheres]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        name: s.name,
        now: s.scoreNow,
        after: s.scoreAfter,
        max: s.maxResult,
        cur: s.whereNow,
        aft: s.afterProgress,
      })),
  }));

export type WheelFileInput = z.input<typeof wheelFileSchema>;

export function viewToFile(v: WheelView): WheelFileInput {
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    title: v.title,
    date: v.date,
    primarySphereId: v.primary,
    additionalSphereIds: v.additional,
    firstSteps: v.firstSteps,
    spheres: v.spheres.map((s, i) => ({
      id: s.id,
      order: i + 1,
      name: s.name,
      scoreNow: s.now,
      scoreAfter: s.after,
      maxResult: s.max,
      whereNow: s.cur,
      afterProgress: s.aft,
    })),
  };
}

/** Returns a human-readable Russian error, or the validated file. */
export function parseWheelFile(text: string):
  | { ok: true; data: WheelFileInput }
  | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Файл не является корректным JSON." };
  }
  const o = json as Record<string, unknown>;
  if (!o || typeof o !== "object" || o["format"] !== FILE_FORMAT)
    return { ok: false, error: "Это не файл «Колеса баланса»." };
  if (o["version"] !== FILE_VERSION)
    return { ok: false, error: `Неподдерживаемая версия формата: ${String(o["version"])}.` };
  const r = wheelFileSchema.safeParse(json);
  if (!r.success) {
    const issue = r.error.issues[0];
    if (!issue) return { ok: false, error: "Некорректный файл." };
    const path = issue.path.join(".");
    if (path === "spheres" && (issue.code === "too_small" || issue.code === "too_big"))
      return { ok: false, error: `Число сфер должно быть от ${MIN_SPHERES} до ${MAX_SPHERES}.` };
    if (/score/.test(path))
      return { ok: false, error: "Оценки должны быть целыми числами от 1 до 10 или пустыми." };
    const fieldNames: Record<string, string> = {
      title: "название",
      date: "дата",
      firstSteps: "первые шаги",
      primarySphereId: "основная сфера",
      additionalSphereIds: "дополнительные сферы",
      maxResult: "максимальный результат",
      whereNow: "где я сейчас",
      afterProgress: "развитие",
      name: "название сферы",
    };
    const last = String(issue.path[issue.path.length - 1] ?? "");
    const where = fieldNames[last] ?? (path || "структура");
    return { ok: false, error: `Ошибка в данных файла: некорректное значение в поле «${where}».` };
  }
  return { ok: true, data: json as WheelFileInput };
}
