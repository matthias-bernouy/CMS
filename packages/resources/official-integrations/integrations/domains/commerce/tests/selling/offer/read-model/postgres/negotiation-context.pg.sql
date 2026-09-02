\set ON_ERROR_STOP on

begin;

do $security$
declare
    target oid := to_regprocedure(
        'commerce.get_offer_negotiation_context(bigint)'
    );
begin
    if target is null then
        raise exception 'negotiation context: RPC is missing';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc
        where oid = target
          and (
              prosecdef
              or provolatile <> 's'
              or not coalesce(proconfig @> array['search_path=""'], false)
          )
    ) then
        raise exception 'negotiation context: RPC security attributes are invalid';
    end if;
    if has_function_privilege('anon', target, 'execute')
       or has_function_privilege('authenticated', target, 'execute')
       or not has_function_privilege('service_role', target, 'execute') then
        raise exception 'negotiation context: RPC privileges are invalid';
    end if;
end;
$security$;

set local role service_role;
\ir ../../detail/postgres/managed-offer.fixture.sql

do $contract$
declare
    full_offer_id bigint;
    plain_offer_id bigint;
    result jsonb;
begin
    select id into full_offer_id
    from commerce.offers
    where slug = 'managed-offer-full';

    result := commerce.get_offer_negotiation_context(full_offer_id);
    if result is distinct from jsonb_build_object(
        'state', 'ok',
        'context', jsonb_build_object(
            'offer_id', full_offer_id,
            'offer_slug', 'managed-offer-full',
            'offer_title', 'Managed full offer',
            'seller_cms_user_id', 'managed-offer-owner',
            'seller_display_name', 'Managed owner',
            'reference_amount', 12500,
            'currency', 'eur',
            'publication_status', 'draft',
            'availability', 'available'
        )
    ) then
        raise exception 'negotiation context: full projection changed: %', result;
    end if;

    select id into plain_offer_id
    from commerce.offers
    where slug = 'managed-offer-plain';

    result := commerce.get_offer_negotiation_context(plain_offer_id);
    if not (result->'context' ? 'reference_amount')
       or result #> '{context,reference_amount}' is distinct from 'null'::jsonb then
        raise exception 'negotiation context: null reference amount changed: %', result;
    end if;

    update commerce.sellers
    set kind = 'merchant', cms_user_id = null
    where id = (
        select seller_id from commerce.offers where id = plain_offer_id
    );
    result := commerce.get_offer_negotiation_context(plain_offer_id);
    if not (result->'context' ? 'seller_cms_user_id')
       or result #> '{context,seller_cms_user_id}' is distinct from 'null'::jsonb then
        raise exception 'negotiation context: null seller identity changed: %', result;
    end if;

    if commerce.get_offer_negotiation_context(9007199254740991)
        is distinct from '{"state":"not_found"}'::jsonb
       or commerce.get_offer_negotiation_context(null)
        is distinct from '{"state":"not_found"}'::jsonb then
        raise exception 'negotiation context: missing state changed';
    end if;
end;
$contract$;

rollback;
