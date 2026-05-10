// menu-query — during-call tool. Queries the restaurant menu graph by
// category, tags, allergens, spice level, availability. Read-only.
// Latency budget: <500ms per F3 (SENIOR_V0_STRATEGY.html section 21).
// See SENIOR_V0_STRATEGY_ADDENDUM_RESTAURANT_BRAIN.md IDEA 22 for the contract.

import { z } from "https://esm.sh/zod@3.23.8";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const QuerySchema = z.object({
  restaurant_id: z.string().uuid(),
  tags: z.array(z.string()).optional(),
  exclude_allergens: z.array(z.string()).optional(),
  category: z.string().optional(),
  spice_max: z.number().int().min(0).max(5).optional(),
  available_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, reason: "method_not_allowed", dishes: [] });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(200, { ok: false, reason: "bad_json", dishes: [] });
  }

  const parsed = QuerySchema.safeParse(body);
  if (!parsed.success) {
    console.log({ event: "menu_query_invalid", issues: parsed.error.issues });
    return json(200, { ok: false, reason: "invalid_input", dishes: [] });
  }
  const f = parsed.data;

  const t0 = Date.now();
  const { data, error } = await sb().rpc("query_menu", {
    p_restaurant_id: f.restaurant_id,
    p_tags: f.tags ?? null,
    p_exclude_allergens: f.exclude_allergens ?? null,
    p_category: f.category ?? null,
    p_spice_max: f.spice_max ?? null,
    p_available_only: f.available_only ?? true,
    p_limit: f.limit ?? 5,
  });
  const ms = Date.now() - t0;

  if (error) {
    console.error("query_menu_err", error);
    return json(200, { ok: false, reason: "query_failed", dishes: [] });
  }

  const dishes = (data ?? []) as Array<Record<string, unknown>>;
  console.log({ event: "menu_query_done", count: dishes.length, ms, restaurant_id: f.restaurant_id });
  return json(200, { ok: true, dishes });
});

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
