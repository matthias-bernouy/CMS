\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir ../../../../order/read-model/postgres/baseline.fixture.sql
\ir authorization.fixture.sql

create function pg_temp.jsonb_keys(p_value jsonb)
returns text[] language sql immutable as $$
    select coalesce(array_agg(key order by key), array[]::text[])
    from jsonb_object_keys(p_value) key;
$$;

do $$
declare
    v_claim jsonb;
    v_order jsonb;
    v_seller jsonb;
    v_terms jsonb;
    v_missing jsonb;
    v_missing_terms jsonb;
    v_whitespace_seller jsonb;
    v_claim_buyer text;
    v_order_buyer text;
    v_claim_seller bigint;
    v_order_seller bigint;
begin
    select jsonb_build_object(
        'id', claim.id,
        'public_id', claim.public_id,
        'order_id', claim.order_id,
        'buyer_cms_user_id', claim.buyer_cms_user_id,
        'seller_id', claim.seller_id,
        'status', claim.status,
        'resolution_outcome', claim.resolution_outcome,
        'return_ship_by_at', claim.return_ship_by_at,
        'return_delivery_status', claim.return_delivery_status,
        'return_recipient_handoff_at', claim.return_recipient_handoff_at,
        'version', claim.version
    ) into v_claim
    from commerce.marketplace_claims claim
    where claim.id = 9800000000001;

    select jsonb_build_object(
        'id', orders.id,
        'public_id', orders.public_id,
        'order_number', orders.order_number,
        'status', orders.status,
        'shipping_address', orders.shipping_address
    ) into v_order
    from commerce.orders orders
    where orders.id = (v_claim->>'order_id')::bigint;

    select jsonb_build_object(
        'id', seller.id,
        'cms_user_id', seller.cms_user_id
    ) into v_seller
    from commerce.sellers seller
    where seller.id = (v_claim->>'seller_id')::bigint;

    select jsonb_build_object(
        'delivery_quote_id', terms.delivery_quote_id,
        'merchandise_subtotal_amount', terms.merchandise_subtotal_amount,
        'currency', terms.currency
    ) into v_terms
    from commerce.order_financial_terms terms
    where terms.order_id = (v_claim->>'order_id')::bigint;

    if pg_temp.jsonb_keys(v_claim) <> array[
        'buyer_cms_user_id', 'id', 'order_id', 'public_id',
        'resolution_outcome', 'return_delivery_status',
        'return_recipient_handoff_at', 'return_ship_by_at',
        'seller_id', 'status', 'version'
    ] or (v_claim->>'id')::bigint <> 9800000000001
        or v_claim->>'status' <> 'return_required'
        or v_claim->>'resolution_outcome' <> 'return_required'
        or v_claim->'return_recipient_handoff_at' <> 'null'::jsonb then
        raise exception 'return authorization baseline: claim projection changed';
    end if;

    if pg_temp.jsonb_keys(v_order) <> array[
        'id', 'order_number', 'public_id', 'shipping_address', 'status'
    ] or v_order->>'order_number' <> 'ORDER-READ-42'
        or pg_temp.jsonb_keys(v_seller) <> array['cms_user_id', 'id']
        or v_seller->>'cms_user_id' <> 'order-read-seller-17'
        or pg_temp.jsonb_keys(v_terms) <> array[
            'currency', 'delivery_quote_id', 'merchandise_subtotal_amount'
        ] or v_terms->>'delivery_quote_id' <> 'quote-42'
        or (v_terms->>'merchandise_subtotal_amount')::bigint <> 10000
        or v_terms->>'currency' <> 'eur' then
        raise exception 'return authorization baseline: relation projection changed';
    end if;

    select to_jsonb(claim) into v_missing
    from commerce.marketplace_claims claim
    where claim.id = 9999999999999;
    if v_missing is not null then
        raise exception 'return authorization baseline: missing claim changed';
    end if;

    select jsonb_build_object(
        'delivery_quote_id', terms.delivery_quote_id,
        'merchandise_subtotal_amount', terms.merchandise_subtotal_amount,
        'currency', terms.currency
    ) into v_missing_terms
    from commerce.order_financial_terms terms
    join commerce.marketplace_claims claim on claim.order_id = terms.order_id
    where claim.id = 9800000000002;
    if v_missing_terms is not null then
        raise exception 'return authorization baseline: missing terms changed';
    end if;

    select claim.buyer_cms_user_id, orders.buyer_cms_user_id
    into v_claim_buyer, v_order_buyer
    from commerce.marketplace_claims claim
    join commerce.orders orders on orders.id = claim.order_id
    where claim.id = 9800000000002;
    if v_claim_buyer <> 'claim-return-buyer-shadow'
        or v_claim_buyer = v_order_buyer then
        raise exception 'return authorization baseline: claim buyer source changed';
    end if;

    select jsonb_build_object(
        'id', seller.id,
        'cms_user_id', seller.cms_user_id
    ) into v_whitespace_seller
    from commerce.marketplace_claims claim
    join commerce.sellers seller on seller.id = claim.seller_id
    where claim.id = 9800000000003;
    select claim.seller_id, orders.seller_id
    into v_claim_seller, v_order_seller
    from commerce.marketplace_claims claim
    join commerce.orders orders on orders.id = claim.order_id
    where claim.id = 9800000000003;
    if v_whitespace_seller->>'cms_user_id' <> E'\t'
        or (v_whitespace_seller->>'id')::bigint <> v_claim_seller
        or v_claim_seller = v_order_seller then
        raise exception 'return authorization baseline: raw seller identity changed';
    end if;
end;
$$;

do $$
declare
    v_table text;
    v_relation regclass;
    v_rls boolean;
    v_force_rls boolean;
begin
    foreach v_table in array array[
        'marketplace_claims', 'orders', 'sellers', 'order_financial_terms'
    ] loop
        v_relation := format('commerce.%I', v_table)::regclass;
        select relrowsecurity, relforcerowsecurity
        into v_rls, v_force_rls
        from pg_catalog.pg_class
        where oid = v_relation;
        if not v_rls or not v_force_rls
            or not has_table_privilege('service_role', v_relation, 'SELECT')
            or has_table_privilege('anon', v_relation, 'SELECT')
            or has_table_privilege('authenticated', v_relation, 'SELECT') then
            raise exception 'return authorization baseline: unsafe table %', v_table;
        end if;
    end loop;

    if to_regclass('commerce.marketplace_claims_pkey') is null
        or to_regclass('commerce.orders_pkey') is null
        or to_regclass('commerce.sellers_pkey') is null
        or to_regclass('commerce.order_financial_terms_pkey') is null then
        raise exception 'return authorization baseline: primary lookup index missing';
    end if;
end;
$$;

rollback;
