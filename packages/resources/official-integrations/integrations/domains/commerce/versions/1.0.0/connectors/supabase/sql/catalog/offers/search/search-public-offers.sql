

create or replace function commerce.search_public_offers(
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
language plpgsql
stable
set search_path = ''
as $$
declare
    v_schema jsonb;
    v_key text;
    v_conditions jsonb;
    v_operator text;
    v_value jsonb;
    v_field jsonb;
begin
    p_filters := coalesce(p_filters, '{}'::jsonb);
    if jsonb_typeof(p_filters) <> 'object' or pg_column_size(p_filters) > 16384 then
        raise exception 'validation: offer filters must be a small object';
    end if;
    if p_category_full_slug is null and p_filters <> '{}'::jsonb then
        raise exception 'validation: category is required for custom filters';
    end if;
    if p_category_full_slug is not null then
        v_schema := commerce.offer_filter_schema(p_category_full_slug);
        if v_schema is null then raise exception 'validation: public category does not exist'; end if;
    end if;
    for v_key, v_conditions in select key, value from jsonb_each(p_filters)
    loop
        select field into v_field
        from jsonb_array_elements(v_schema->'fields') field
        where field->>'key' = v_key and (field->>'filterable')::boolean;
        if v_field is null then raise exception 'validation: unsupported filter %', v_key; end if;
        if jsonb_typeof(v_conditions) <> 'object' then
            raise exception 'validation: filter % conditions must be an object', v_key;
        end if;
        for v_operator, v_value in select key, value from jsonb_each(v_conditions)
        loop
            if not ((v_field->'operators') ? v_operator) then
                raise exception 'validation: unsupported operator % for filter %', v_operator, v_key;
            end if;
            if v_operator = 'in' and jsonb_typeof(v_value) <> 'array' then
                raise exception 'validation: in filter % must be an array', v_key;
            end if;
            if v_operator in ('gte', 'lte') and jsonb_typeof(v_value) <> 'number' then
                raise exception 'validation: numeric filter % must be a number', v_key;
            end if;
        end loop;
    end loop;

    return (
        with recursive selected_category as (
            select id from commerce.categories
            where p_category_full_slug is not null and full_slug = p_category_full_slug and status = 'active'
        ), category_scope as (
            select id from selected_category
            union all
            select child.id from commerce.categories child
            join category_scope parent on child.parent_id = parent.id
            where child.status = 'active'
        ), filtered as (
            select offer.*
            from commerce.offers offer
            join commerce.sellers seller on seller.id = offer.seller_id
            join commerce.settings settings on settings.id = 'default'
            join commerce.products product on product.id = offer.product_id
            left join commerce.brands brand on brand.id = product.brand_id
            left join commerce.product_categories category_link
              on category_link.product_id = product.id and category_link.is_primary
            cross join lateral (
                select commerce.effective_variant_metadata(product.id, offer.variant_id) value
            ) effective
            where offer.publication_status = 'active'
              and offer.availability = 'available'
              and seller.verification_status not in ('rejected', 'suspended')
              and (not settings.require_verified_seller or seller.verification_status = 'verified')
              and product.status = 'active' and product.visibility = 'public'
              and (p_category_full_slug is null or category_link.category_id in (select id from category_scope))
              and (p_brand_slug is null or brand.slug = p_brand_slug)
              and (p_condition_code is null or offer.condition_code = p_condition_code)
              and (p_price_min is null or offer.accepted_price_amount >= p_price_min)
              and (p_price_max is null or offer.accepted_price_amount <= p_price_max)
              and (p_query is null or offer.title ilike '%' || p_query || '%' or offer.slug ilike '%' || p_query || '%'
                   or product.title ilike '%' || p_query || '%' or brand.name ilike '%' || p_query || '%')
              and not exists (
                  select 1
                  from jsonb_each(p_filters) filter
                  cross join lateral jsonb_each(filter.value) condition
                  where not case condition.key
                      when 'eq' then effective.value->filter.key = condition.value
                      when 'in' then condition.value @> jsonb_build_array(effective.value->filter.key)
                      when 'gte' then (effective.value->>filter.key)::numeric >= (condition.value#>>'{}')::numeric
                      when 'lte' then (effective.value->>filter.key)::numeric <= (condition.value#>>'{}')::numeric
                      else false
                  end
              )
        ), page as (
            select filtered.*, row_number() over (order by
                case when p_sort = 'price-asc' then accepted_price_amount end asc nulls last,
                case when p_sort = 'price-desc' then accepted_price_amount end desc nulls last,
                updated_at desc, id desc
            ) sort_ordinal
            from filtered
            order by
                case when p_sort = 'price-asc' then accepted_price_amount end asc nulls last,
                case when p_sort = 'price-desc' then accepted_price_amount end desc nulls last,
                updated_at desc, id desc
            limit least(greatest(coalesce(p_limit, 50), 1), 100)
            offset greatest(coalesce(p_offset, 0), 0)
        )
        select jsonb_build_object(
            'items', coalesce((select jsonb_agg(to_jsonb(page) - 'sort_ordinal' order by sort_ordinal) from page), '[]'::jsonb),
            'total', (select count(*) from filtered),
            'limit', least(greatest(coalesce(p_limit, 50), 1), 100),
            'offset', greatest(coalesce(p_offset, 0), 0)
        )
    );
end;
$$;