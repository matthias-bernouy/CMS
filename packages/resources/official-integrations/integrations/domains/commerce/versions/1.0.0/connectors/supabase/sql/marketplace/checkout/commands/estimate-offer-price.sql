

create or replace function commerce.estimate_offer_price(
    p_product_id bigint,
    p_variant_id bigint default null,
    p_condition_code text default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    v_scope text;
    v_scope_index integer;
    v_sample_size integer;
    v_currency text;
    v_observed_minimum bigint;
    v_observed_maximum bigint;
    v_median bigint;
    v_typical_minimum bigint;
    v_typical_maximum bigint;
begin
    if not exists (
        select 1 from commerce.products
        where id = p_product_id and status = 'active' and visibility = 'public'
    ) then
        raise exception 'not_found: product';
    end if;
    if p_variant_id is not null and not exists (
        select 1 from commerce.product_variants
        where id = p_variant_id and product_id = p_product_id and status = 'active'
    ) then
        raise exception 'validation: variant does not belong to product';
    end if;
    if p_condition_code is not null and not exists (
        select 1 from commerce.offer_conditions where code = p_condition_code and enabled
    ) then
        raise exception 'validation: unsupported offer condition';
    end if;

    for v_scope_index in 1..3 loop
        v_scope := case v_scope_index
            when 1 then 'variant_and_condition'
            when 2 then 'product_and_condition'
            else 'product'
        end;
        if v_scope_index = 1 and (p_variant_id is null or p_condition_code is null) then continue; end if;
        if v_scope_index = 2 and p_condition_code is null then continue; end if;

        with comparable as (
            select line.unit_amount as amount, order_row.currency, line.created_at
            from commerce.order_lines line
            join commerce.orders order_row on order_row.id = line.order_id
            where line.product_id = p_product_id
              and line.created_at >= now() - interval '18 months'
              and (v_scope_index <> 1 or line.variant_id = p_variant_id)
              and (v_scope_index = 3 or line.offer_snapshot->>'conditionCode' = p_condition_code)
            union all
            select offer.accepted_price_amount, offer.currency, offer.updated_at
            from commerce.offers offer
            where offer.product_id = p_product_id
              and offer.accepted_price_amount is not null
              and offer.updated_at >= now() - interval '18 months'
              and offer.workflow_state <> 'rejected'
              and (v_scope_index <> 1 or offer.variant_id = p_variant_id)
              and (v_scope_index = 3 or offer.condition_code = p_condition_code)
              and not exists (select 1 from commerce.order_lines line where line.offer_id = offer.id)
        ), recent as (
            select amount, currency
            from comparable
            order by created_at desc
            limit 20
        )
        select count(*)::integer,
               case when count(distinct currency) = 1 then min(currency) end,
               min(amount), max(amount),
               percentile_cont(0.5) within group (order by amount)::bigint,
               percentile_cont(0.25) within group (order by amount)::bigint,
               percentile_cont(0.75) within group (order by amount)::bigint
        into v_sample_size, v_currency, v_observed_minimum, v_observed_maximum,
             v_median, v_typical_minimum, v_typical_maximum
        from recent;

        if v_sample_size >= 3 and v_currency is not null then
            return jsonb_build_object(
                'available', true,
                'currency', v_currency,
                'scope', v_scope,
                'sampleSize', v_sample_size,
                'observedMinimumAmount', v_observed_minimum,
                'observedMaximumAmount', v_observed_maximum,
                'medianAmount', v_median,
                'estimatedMinimumAmount', v_typical_minimum,
                'estimatedMaximumAmount', v_typical_maximum
            );
        end if;
    end loop;

    return jsonb_build_object(
        'available', false,
        'currency', null,
        'scope', 'insufficient_data',
        'sampleSize', coalesce(v_sample_size, 0),
        'observedMinimumAmount', null,
        'observedMaximumAmount', null,
        'medianAmount', null,
        'estimatedMinimumAmount', null,
        'estimatedMaximumAmount', null
    );
end;
$$;