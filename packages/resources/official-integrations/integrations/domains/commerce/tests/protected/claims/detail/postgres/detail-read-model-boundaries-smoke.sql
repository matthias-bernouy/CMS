\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir ../../../../order/read-model/postgres/baseline.fixture.sql
\ir detail.fixture.sql

insert into commerce.marketplace_claims (
    id, public_id, order_id, buyer_cms_user_id, seller_id, reason, status,
    description, seller_response_by_at, created_at, updated_at
) values (
    3000000000, '30000000-0000-4000-8000-000000000008', :order_41_id,
    'order-read-buyer-a', :seller_17_id, 'damaged', 'open', 'Empty claim',
    '2026-07-18 08:00+00', '2026-07-17 08:00+00', '2026-07-17 08:00+00'
);

do $$
declare
    v_missing jsonb := commerce.get_marketplace_claim_read_model(999999999);
    v_empty jsonb := commerce.get_marketplace_claim_read_model(3000000000);
begin
    if v_missing <> '{"state":"not_found"}'::jsonb then
        raise exception 'claim detail RPC: missing state changed: %', v_missing;
    end if;
    if v_empty->>'state' <> 'ok'
        or (v_empty->'claim'->>'id')::bigint <> 3000000000
        or v_empty->'events' <> '[]'::jsonb
        or v_empty->'evidence' <> '[]'::jsonb
        or v_empty->'return_events' <> '[]'::jsonb then
        raise exception 'claim detail RPC: bigint/empty collections changed: %', v_empty;
    end if;
end;
$$;

do $$
declare
    v_function oid := to_regprocedure(
        'commerce.get_marketplace_claim_read_model(bigint)'
    );
    v_volatile "char";
    v_security_definer boolean;
    v_config text[];
begin
    if v_function is null then
        raise exception 'claim detail RPC: function signature missing';
    end if;
    select provolatile, prosecdef, proconfig
    into v_volatile, v_security_definer, v_config
    from pg_catalog.pg_proc where oid = v_function;
    if v_volatile <> 's' or v_security_definer
        or not ('search_path=""' = any(coalesce(v_config, array[]::text[])))
        or not has_function_privilege('service_role', v_function, 'EXECUTE')
        or has_function_privilege('anon', v_function, 'EXECUTE')
        or has_function_privilege('authenticated', v_function, 'EXECUTE') then
        raise exception 'claim detail RPC: unsafe attributes or ACL';
    end if;
end;
$$;

rollback;
