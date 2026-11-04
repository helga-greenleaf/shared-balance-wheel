import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { initialFields, isValidScore, MAX_SPHERES, MIN_SPHERES } from "./model";
import { wheelFileSchema } from "./file-schema";

const idSchema = z.string().uuid();
const secretSchema = z.string().min(20).max(200);

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newSecret(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function verify(id: string, secret: string) {
  const db = await admin();
  const { data, error } = await db
    .from("wheel_sessions")
    .select("secret_hash")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Сервер недоступен");
  const h = await sha256(secret);
  if (!data || !safeEqual(data.secret_hash, h)) throw new Error("ACCESS_DENIED");
  return db;
}

async function insertSession(fields: Record<string, unknown>) {
  const db = await admin();
  const secret = newSecret();
  const data: Record<string, { v: unknown; r: number }> = {};
  for (const [k, v] of Object.entries(fields)) data[k] = { v, r: 1 };
  const { data: row, error } = await db
    .from("wheel_sessions")
    .insert({ secret_hash: await sha256(secret), data: data as never, rev: 1 })
    .select("id")
    .single();
  if (error || !row) throw new Error("Не удалось создать сессию");
  return { id: row.id, secret };
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ date: dateSchema }).parse(d))
  .handler(async ({ data }) => insertSession(initialFields(data.date)));

export const importSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => wheelFileSchema.parse(d))
  .handler(async ({ data }) =>
    insertSession(
      initialFields(data.date, data.spheres, {
        title: data.title,
        primary: data.primarySphereId,
        firstSteps: data.firstSteps,
      }),
    ),
  );

export const getSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, secret: secretSchema, sinceRev: z.number().int().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await verify(data.id, data.secret);
    const { data: row, error } = await db
      .from("wheel_sessions")
      .select("rev, data")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Сервер недоступен");
    if (data.sinceRev !== undefined && Number(row.rev) === data.sinceRev)
      return { rev: Number(row.rev), json: null as string | null };
    return { rev: Number(row.rev), json: JSON.stringify(row.data) as string | null };
  });

const TEXT_MAX = 20000;
const opSchema = z
  .object({
    kind: z.enum(["set", "add", "del"]),
    k: z.string().max(80).optional(),
    sid: z.string().uuid().optional(),
    v: z.unknown(),
    base: z.number().int().optional(),
  })
  .superRefine((op, ctx) => {
    const bad = (m: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message: m });
    if (op.kind === "add") {
      if (!op.sid || typeof op.v !== "number") bad("add");
      return;
    }
    if (op.kind === "del") {
      if (!op.sid) bad("del");
      return;
    }
    const k = op.k ?? "";
    const v = op.v;
    if (k === "title" || k === "firstSteps") {
      if (typeof v !== "string" || v.length > TEXT_MAX) bad(k);
    } else if (k === "date") {
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad(k);
    } else if (k === "primary") {
      if (v !== null && !(typeof v === "string" && idSchema.safeParse(v).success)) bad(k);
    } else {
      const m = /^s:([0-9a-f-]{36}):(name|now|after|max|cur|aft)$/.exec(k);
      if (!m) return bad("key");
      if (m[2] === "now" || m[2] === "after") {
        if (v !== null && !isValidScore(v)) bad("score");
      } else if (typeof v !== "string" || v.length > (m[2] === "name" ? 200 : TEXT_MAX)) bad("text");
    }
  });

export const applyOps = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, secret: secretSchema, ops: z.array(opSchema).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await verify(data.id, data.secret);
    const { data: res, error } = await db.rpc("wheel_apply_ops", {
      p_id: data.id,
      p_ops: data.ops as never,
    });
    if (error) throw new Error("Не удалось сохранить");
    return { json: JSON.stringify(res) };
  });

export const LIMITS = { MIN_SPHERES, MAX_SPHERES };
