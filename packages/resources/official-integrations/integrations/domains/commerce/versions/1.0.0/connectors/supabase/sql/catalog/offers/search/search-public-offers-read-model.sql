

create or replace function commerce.search_public_offers_read_model(
    p_category_full_slug text default null,
    p_brand_slug text default null,
    p_filters jsonb default '{}'::jsonb,
    p_query text default null,
    p_condition_code text default null,
    p_price_min bigint default null,
    p_price_max bigint default null,
    p_sort text default null,
    p_limit integer default 50,
    p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with searched as materialized (
        select commerce.search_public_offers(
            p_category_full_slug,
            p_brand_slug,
            p_filters,
            p_query,
            p_condition_code,
            p_price_min,
            p_price_max,
            p_sort,
            p_limit,
            p_offset
        ) value
    ), offer_ids as (
        select coalesce(
            array_agg((entry.item->>'id')::bigint order by entry.ordinality),
            array[]::bigint[]
        ) value
        from searched
        cross join lateral jsonb_array_elements(searched.value->'items')
            with ordinality as entry(item, ordinality)
    )
    select (searched.value - 'items') || jsonb_build_object(
        'items', commerce.public_offer_items_read_model(offer_ids.value, true)
    )
    from searched
    cross join offer_ids;
$$;

revoke execute on function commerce.search_public_offers_read_model(
    text, text, jsonb, text, text, bigint, bigint, text, integer, integer
) from public, anon, authenticated;
grant execute on function commerce.search_public_offers_read_model(
    text, text, jsonb, text, text, bigint, bigint, text, integer, integer
) to service_role;