#!/usr/bin/env bash
# Fetches TBDC menu from Google Sheets, calls Claude Sonnet 4.6 to enrich
# each dish with tags + allergens + spice_level + cuisine via tool use,
# wipes existing TBDC dishes, and bulk-seeds the menu graph.
#
# WARNING: DELETES all existing dishes for TBDC before inserting. Re-run
# whenever the sheet changes. ~$0.20 in API costs per run (149 dishes).
#
# Env (from .env.local):
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
#
# Sheet ID and restaurant ID are hardcoded — TBDC v0 only.
# Future restaurants ingest via IDEA 23 (PDF/photo + LLM extraction).

set -eo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a; source .env.local; set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set}"
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY not set in .env.local}"

SHEET_ID="17QbviXLli3uxtCmzpkOD3ljotgGiAHhBO-d07zfrXis"
TBDC="00000000-0000-0000-0000-000000000001"
CSV=/tmp/tbdc-menu.csv

echo "── fetching sheet"
curl -sSL "https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv" -o "$CSV"
echo "  $(wc -l < "$CSV") rows downloaded"

python3 <<'PYEOF'
import csv, json, os, sys, urllib.request, urllib.error

URL    = os.environ['SUPABASE_URL']
SBKEY  = os.environ['SUPABASE_SERVICE_ROLE_KEY']
APIKEY = os.environ['ANTHROPIC_API_KEY']
TBDC   = "00000000-0000-0000-0000-000000000001"
MODEL  = "claude-sonnet-4-6"

# ── 1. Read + dedupe CSV ───────────────────────────────────────────
with open('/tmp/tbdc-menu.csv') as f:
    rows = list(csv.DictReader(f))
seen, dishes = set(), []
for r in rows:
    cid = r['catalogue_id']
    if cid in seen: continue
    seen.add(cid)
    name = r['catalogue_name'].strip()
    try:
        price = float(r.get('current_price','').strip() or 0) or None
    except ValueError:
        price = None
    dishes.append({
        'name': name,
        'category': r['category_name'].strip() or None,
        'description': (r.get('description') or '').strip() or None,
        'price_inr': price,
    })
print(f"  {len(dishes)} unique dishes after dedupe")

# ── 2. Call Sonnet for structured enrichment ──────────────────────
SYSTEM = """You are enriching a restaurant menu for a voice AI concierge.
For each dish, infer:
- tags: subset of [veg, non_veg, vegan, jain, gf, halal, signature, mild, spicy, kid_friendly]. Every dish MUST be tagged veg OR non_veg (mutually exclusive).
- allergens: subset of [peanut, tree_nut, dairy, gluten, shellfish, egg, soy, sesame, mustard, fish]. Be CONSERVATIVE: if uncertain whether a dish contains an allergen, INCLUDE it. The kitchen will confirm before serving. False positives are safer than false negatives.
- spice_level: 0 (mild/none) to 5 (extra hot).
- cuisine: one of [north_indian, south_indian, continental, asian, italian, mexican, american, other].

Return enrichments in the same order as input dishes, with dish_index matching the input array index."""

TOOL = {
    "name": "enrich_dishes",
    "description": "Returns enrichment data for each input dish.",
    "input_schema": {
        "type": "object",
        "properties": {
            "enrichments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "dish_index":  {"type": "integer"},
                        "tags":        {"type": "array", "items": {"type": "string"}},
                        "allergens":   {"type": "array", "items": {"type": "string"}},
                        "spice_level": {"type": "integer", "minimum": 0, "maximum": 5},
                        "cuisine":     {"type": "string"},
                    },
                    "required": ["dish_index", "tags", "allergens", "spice_level", "cuisine"],
                },
            },
        },
        "required": ["enrichments"],
    },
}

USER = "Enrich these dishes:\n" + json.dumps(
    [{"index": i, "name": d["name"], "category": d["category"], "description": d["description"]}
     for i, d in enumerate(dishes)], indent=2)

print(f"── calling {MODEL} ({len(dishes)} dishes)")
req = urllib.request.Request(
    "https://api.anthropic.com/v1/messages",
    data=json.dumps({
        "model": MODEL,
        "max_tokens": 16000,
        "system": SYSTEM,
        "tools": [TOOL],
        "tool_choice": {"type": "tool", "name": "enrich_dishes"},
        "messages": [{"role": "user", "content": USER}],
    }).encode(),
    headers={
        "x-api-key": APIKEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read())
except urllib.error.HTTPError as e:
    print(f"  API error {e.code}: {e.read().decode()[:500]}", file=sys.stderr)
    sys.exit(1)

tool_blocks = [b for b in payload.get("content", []) if b.get("type") == "tool_use"]
if not tool_blocks:
    print(f"  no tool_use in response: {json.dumps(payload)[:500]}", file=sys.stderr)
    sys.exit(1)
enrichments = tool_blocks[0]["input"]["enrichments"]
print(f"  got {len(enrichments)} enrichments")

# Index by dish_index for safe lookup
by_idx = {e["dish_index"]: e for e in enrichments}

# ── 3. Wipe + reseed ─────────────────────────────────────────────
def req_json(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        f"{URL}{path}",
        data=data, method=method,
        headers={
            "apikey": SBKEY, "Authorization": f"Bearer {SBKEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(r) as resp:
        body = resp.read()
        return json.loads(body) if body else None

print("── wiping existing TBDC dishes (cascade)")
del_req = urllib.request.Request(
    f"{URL}/rest/v1/dishes?restaurant_id=eq.{TBDC}",
    method="DELETE",
    headers={"apikey": SBKEY, "Authorization": f"Bearer {SBKEY}", "Prefer": "return=minimal"},
)
urllib.request.urlopen(del_req).read()

print("── inserting dishes")
payload = []
for i, d in enumerate(dishes):
    e = by_idx.get(i, {})
    payload.append({
        "restaurant_id": TBDC,
        "name": d["name"],
        "category": d["category"],
        "cuisine": e.get("cuisine"),
        "description": d["description"],
        "price_inr": d["price_inr"],
        "spice_level": e.get("spice_level"),
        "prep_minutes": None,
        "is_available": True,
        "is_special": False,
        "notes": None,
    })
inserted = req_json("POST", "/rest/v1/dishes", payload)
print(f"  inserted {len(inserted)} rows")

# Map name → id for tag/allergen inserts
name_to_id = {row["name"]: row["id"] for row in inserted}

print("── inserting tags + allergens")
tags, allergens = [], []
for i, d in enumerate(dishes):
    e = by_idx.get(i, {})
    did = name_to_id.get(d["name"])
    if not did: continue
    for t in (e.get("tags") or []):
        tags.append({"dish_id": did, "tag": t})
    for a in (e.get("allergens") or []):
        allergens.append({"dish_id": did, "allergen": a})

if tags:
    req_json("POST", "/rest/v1/dish_tags", tags)
if allergens:
    req_json("POST", "/rest/v1/dish_allergens", allergens)
print(f"  tags={len(tags)} allergens={len(allergens)}")

# ── 4. Verification ───────────────────────────────────────────────
def count(path):
    r = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        headers={"apikey": SBKEY, "Authorization": f"Bearer {SBKEY}",
                 "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
    )
    with urllib.request.urlopen(r) as resp:
        return resp.headers.get("Content-Range", "?").split("/")[-1]

print()
print(f"── totals on live DB:")
print(f"  dishes:         {count('dishes')}")
print(f"  dish_tags:      {count('dish_tags')}")
print(f"  dish_allergens: {count('dish_allergens')}")

# Tag/allergen distribution
def hist(path, key):
    r = urllib.request.Request(
        f"{URL}/rest/v1/{path}?select={key}",
        headers={"apikey": SBKEY, "Authorization": f"Bearer {SBKEY}"},
    )
    with urllib.request.urlopen(r) as resp:
        data = json.loads(resp.read())
    counts = {}
    for row in data:
        counts[row[key]] = counts.get(row[key], 0) + 1
    return counts

print(f"  tag distribution:      {sorted(hist('dish_tags','tag').items(), key=lambda x: -x[1])[:10]}")
print(f"  allergen distribution: {sorted(hist('dish_allergens','allergen').items(), key=lambda x: -x[1])}")
PYEOF
