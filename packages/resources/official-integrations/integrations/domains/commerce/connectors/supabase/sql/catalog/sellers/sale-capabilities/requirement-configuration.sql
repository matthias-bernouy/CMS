
create or replace function commerce.configure_sale_capability_requirement(
    p_capability_key text,
    p_seller_kind text,
    p_enabled boolean,
    p_actor_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_requirement commerce.sale_capability_requirements%rowtype;
begin
    if p_capability_key is null
        or p_capability_key !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: capability key is invalid';
    end if;
    if p_seller_kind not in ('merchant', 'user', 'external') then
        raise exception 'validation: seller kind is invalid';
    end if;
    if p_enabled is null then
        raise exception 'validation: capability requirement state is required';
    end if;
    if p_actor_id is null or btrim(p_actor_id) = '' then
        raise exception 'validation: capability requirement actor is required';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
        'commerce.sale-capability:' || p_capability_key, 0
    ));
    insert into commerce.sale_capability_requirements (
        capability_key, seller_kind, enabled, configured_by
    ) values (
        p_capability_key, p_seller_kind, p_enabled, p_actor_id
    )
    on conflict (capability_key) do update
    set seller_kind = excluded.seller_kind,
        enabled = excluded.enabled,
        configured_by = excluded.configured_by
    returning * into v_requirement;
    return to_jsonb(v_requirement);
end;
$$;
