import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { initialFields, isValidScore, MAX_SPHERES, MIN_SPHERES, sKey, type Doc } from "./model";
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
  // New sessions start with the explicit sphere-list step: no spheres yet.
  .handler(async ({ data }) => insertSession(initialFields(data.date, [], { setup: false })));

const nameListSchema = z.array(z.string().trim().min(1).max(200)).min(MIN_SPHERES).max(MAX_SPHERES);

/**
 * Finishes the initial sphere-list step. Idempotent: if another participant
 * already completed setup, the current document is returned unchanged and no
 * duplicate spheres are created.
 */
export const completeSetup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, secret: secretSchema, names: nameListSchema }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await verify(data.id, data.secret);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: row, error } = await db
        .from("wheel_sessions")
        .select("rev, data")
        .eq("id", data.id)
        .single();
      if (error || !row) throw new Error("Сервер недоступен");
      const doc = (row.data ?? {}) as Doc;
      if (doc["setup"]?.v !== false)
        return { json: JSON.stringify({ rev: Number(row.rev), data: doc }) };
      const next: Doc = { ...doc };
      data.names.forEach((name, i) => {
        const sid = crypto.randomUUID();
        next[sKey(sid, "pos")] = { v: i + 1, r: 1 };
        next[sKey(sid, "name")] = { v: name, r: 1 };
      });
      next["setup"] = { v: true, r: (doc["setup"]?.r ?? 0) + 1 };
      delete next["setupList"];
      const rev = Number(row.rev) + 1;
      const { data: upd } = await db
        .from("wheel_sessions")
        .update({ data: next as never, rev })
        .eq("id", data.id)
        .eq("rev", row.rev)
        .select("rev")
        .maybeSingle();
      if (upd) return { json: JSON.stringify({ rev, data: next }) };
      // Someone else saved concurrently — re-read and retry.
    }
    throw new Error("Не удалось сохранить");
  });

export const importSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => wheelFileSchema.parse(d))
  .handler(async ({ data }) =>
    insertSession(
      initialFields(data.date, data.spheres, {
        title: data.title,
        primary: data.primarySphereId,
        additional: data.additionalSphereIds,
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
    } else if (k === "setup") {
      if (typeof v !== "boolean") bad(k);
    } else if (k === "setupList") {
      if (!Array.isArray(v) || v.length > MAX_SPHERES || v.some((x) => typeof x !== "string" || x.length > 200))
        bad(k);
    } else {
      const m = /^s:([0-9a-f-]{36}):(name|now|after|max|cur|aft|additional)$/.exec(k);
      if (!m) return bad("key");
      if (m[2] === "additional") {
        if (typeof v !== "boolean") bad("additional");
      } else if (m[2] === "now" || m[2] === "after") {
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
