-- Senior v0.8 — query_menu v2.
-- Adds: match_mode (any/all), subcategory, spice_min, price range, query_text (ilike search),
-- signature_only, match_count scoring for rank.
-- Replaces v1. Edge function (menu-query) updated in tandem.

drop function if exists query_menu(uuid, text[], text[], text, int, boolean, int);

create or replace function query_menu(
  p_restaurant_id      uuid,
  p_tags               text[]  default null,
  p_match_mode         text    default 'all',     -- 'any' | 'all' — how to combine multiple tags
  p_exclude_allergens  text[]  default null,
  p_category           text    default null,
  p_subcategory        text    default null,
  p_spice_max          int     default null,
  p_spice_min          int     default null,
  p_price_max          numeric default null,
  p_price_min          numeric default null,
  p_query_text         text    default null,      -- substring search on name + description
  p_signature_only     boolean default false,
  p_available_only     boolean default true,
  p_limit              int     default 5
) returns table (
  id           uuid,
  name         text,
  category     text,
  subcategory  text,
  description  text,
  price_inr    numeric,
  spice_level  int,
  is_special   boolean,
  tags         text[],
  match_count  int
) language sql stable as $$
  with filtered as (
    select d.id, d.name, d.category, d.subcategory, d.description, d.price_inr,
           d.spice_level, d.is_special,
           coalesce(array_agg(distinct dt.tag) filter (where dt.tag is not null), '{}'::text[]) as all_tags,
           case
             when p_tags is null or cardinality(p_tags) = 0 then 0
             else cardinality(array(
               select unnest(p_tags) intersect
               select dt2.tag from dish_tags dt2 where dt2.dish_id = d.id
             ))
           end as match_count
    from dishes d
    left join dish_tags dt on dt.dish_id = d.id
    where d.restaurant_id = p_restaurant_id
      and (p_available_only = false or d.is_available = true)
      and (p_category is null or d.category ilike '%' || p_category || '%')
      and (p_subcategory is null or d.subcategory ilike '%' || p_subcategory || '%')
      and (p_spice_max is null or coalesce(d.spice_level, 0) <= p_spice_max)
      and (p_spice_min is null or coalesce(d.spice_level, 0) >= p_spice_min)
      and (p_price_max is null or d.price_inr <= p_price_max)
      and (p_price_min is null or d.price_inr >= p_price_min)
      and (p_signature_only = false or d.is_special = true)
      and (p_query_text is null or
           d.name ilike '%' || p_query_text || '%' or
           d.description ilike '%' || p_query_text || '%')
      and (p_exclude_allergens is null or cardinality(p_exclude_allergens) = 0 or not exists (
            select 1 from dish_allergens da
            where da.dish_id = d.id and da.allergen = any(p_exclude_allergens)))
    group by d.id, d.name, d.category, d.subcategory, d.description, d.price_inr,
             d.spice_level, d.is_special
  )
  select id, name, category, subcategory, description, price_inr, spice_level,
         is_special, all_tags, match_count
  from filtered
  where p_tags is null
     or cardinality(p_tags) = 0
     or (p_match_mode = 'any' and match_count > 0)
     or (p_match_mode = 'all' and match_count = cardinality(p_tags))
  order by is_special desc, match_count desc, name asc
  limit p_limit;
$$;
