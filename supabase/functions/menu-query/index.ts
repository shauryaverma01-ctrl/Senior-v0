// menu-query v2 — during-call menu lookup tool.
// Filters: tags (any/all), exclude_allergens, category, subcategory, spice range,
// price range, query_text (free-text), signature_only.
// All inputs accept string-coerced values for Ringg's dynamic-variable picker.
// Returns dishes ranked by signature > match_count > name, plus matched_count
// so the agent can phrase responses naturally ("we have 12 mild dishes, 3 best ones are…").

import { z } from "https://esm.sh/zod@3.23.8";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Ringg sends literal "{{var_name}}" template strings when a dynamic variable
// isn't filled by the LLM. Treat those as "not provided" everywhere.
function unfilled(s: string): boolean {
  return /^\s*\{\{.*\}\}\s*$/.test(s);
}

// Ringg's dynamic-variable picker sends everything as strings. Coerce to expected types.
const arrayLike = z.preprocess((v) => {
  if (Array.isArray(v)) return v.filter((x) => typeof x !== "string" || !unfilled(x));
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!s || unfilled(s)) return undefined;
  if (s.startsWith("[")) { try { return JSON.parse(s); } catch { /* fall through */ } }
  return s.split(",").map((x) => x.trim()).filter((x) => x && !unfilled(x));
}, z.array(z.string()).optional());

const boolLike = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (!t || unfilled(t)) return undefined;
    return t === "true" || t === "yes" || t === "1";
  }
  return v;
}, z.boolean().optional());

const intLike = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || unfilled(t)) return undefined;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return v;
}, z.number().int().optional());

const numLike = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || unfilled(t)) return undefined;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return v;
}, z.number().optional());

const stringLike = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return (t === "" || unfilled(t)) ? undefined : t;
}, z.string().optional());

const matchModeLike = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const t = v.trim().toLowerCase();
  if (t === "" || unfilled(t) || t === "all" || t === "and") return "all";
  if (t === "any" || t === "or") return "any";
  return t;
}, z.enum(["any", "all"]).default("all"));

const QuerySchema = z.object({
  restaurant_id: z.string().uuid(),
  tags: arrayLike,
  match_mode: matchModeLike,
  exclude_allergens: arrayLike,
  category: stringLike,
  subcategory: stringLike,
  spice_max: intLike.refine((n) => n === undefined || (n >= 0 && n <= 5), "spice_max 0-5"),
  spice_min: intLike.refine((n) => n === undefined || (n >= 0 && n <= 5), "spice_min 0-5"),
  price_max: numLike.refine((n) => n === undefined || n >= 0, "price_max >= 0"),
  price_min: numLike.refine((n) => n === undefined || n >= 0, "price_min >= 0"),
  query_text: stringLike,
  signature_only: boolLike,
  available_only: boolLike,
  limit: intLike.refine((n) => n === undefined || (n >= 1 && n <= 20), "limit 1-20"),
});

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Strip "[290 g]" / "[400 ml]" weight markers from dish names + descriptions —
// they're voice noise.
function clean(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return j(405, { ok: false, reason: "method_not_allowed", dishes: [], matched_count: 0 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return j(200, { ok: false, reason: "bad_json", dishes: [], matched_count: 0 }); }

  const parsed = QuerySchema.safeParse(body);
  if (!parsed.success) {
    console.log({ event: "menu_query_invalid", issues: parsed.error.issues });
    return j(200, { ok: false, reason: "invalid_input", issues: parsed.error.issues, dishes: [], matched_count: 0 });
  }
  const f = parsed.data;

  const t0 = Date.now();
  const { data, error } = await sb().rpc("query_menu", {
    p_restaurant_id: f.restaurant_id,
    p_tags: f.tags && f.tags.length > 0 ? f.tags : null,
    p_match_mode: f.match_mode ?? "all",
    p_exclude_allergens: f.exclude_allergens && f.exclude_allergens.length > 0 ? f.exclude_allergens : null,
    p_category: f.category ?? null,
    p_subcategory: f.subcategory ?? null,
    p_spice_max: f.spice_max ?? null,
    p_spice_min: f.spice_min ?? null,
    p_price_max: f.price_max ?? null,
    p_price_min: f.price_min ?? null,
    p_query_text: f.query_text ?? null,
    p_signature_only: f.signature_only ?? false,
    p_available_only: f.available_only ?? true,
    p_limit: f.limit ?? 5,
  });
  const ms = Date.now() - t0;

  if (error) {
    console.error("query_menu_err", error);
    return j(200, { ok: false, reason: "query_failed", dishes: [], matched_count: 0 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const dishes = rows.map((r) => ({
    name: clean(r.name as string),
    category: r.category,
    subcategory: r.subcategory,
    description: clean(r.description as string),
    price_inr: r.price_inr,
    spice_level: r.spice_level,
    tags: r.tags,
    is_signature: r.is_special,
  }));

  console.log({ event: "menu_query_done", count: dishes.length, ms, filters: {
    tags: f.tags, exclude: f.exclude_allergens, category: f.category, subcategory: f.subcategory,
    spice_max: f.spice_max, query_text: f.query_text, signature_only: f.signature_only,
  }});

  return j(200, {
    ok: true,
    matched_count: dishes.length,
    showing: dishes.length,
    dishes,
  });
});

function j(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
