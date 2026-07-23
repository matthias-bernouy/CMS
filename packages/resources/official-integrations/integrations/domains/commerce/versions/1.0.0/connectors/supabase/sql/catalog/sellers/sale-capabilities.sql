create or replace function commerce.seller_has_required_sale_capabilities(
    p_seller_id bigint
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select exists (
        select 1
        from commerce.sellers seller
        where seller.id = p_seller_id
    ) and not exists (
        select 1
        from commerce.sale_capability_requirements requirement
        join commerce.sellers seller
          on seller.id = p_seller_id
         and seller.kind = requirement.seller_kind
        left join commerce.seller_sale_capabilities capability
          on capability.seller_id = seller.id
         and capability.capability_key = requirement.capability_key
        where requirement.enabled
          and coalesce(capability.ready, false) is not true
    );
$$;

create or replace function commerce.assert_required_seller_sale_capabilities(
    p_seller_id bigint
)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
    if not commerce.seller_has_required_sale_capabilities(p_seller_id) then
        raise exception 'conflict: seller protected sale capability is not ready';
    end if;
end;
$$;

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

create or replace function commerce.record_seller_sale_capability(
    p_cms_user_id text,
    p_capability_key text,
    p_ready boolean,
    p_evidence_reference text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_seller commerce.sellers%rowtype;
    v_requirement commerce.sale_capability_requirements%rowtype;
    v_capability commerce.seller_sale_capabilities%rowtype;
begin
    if p_cms_user_id is null or btrim(p_cms_user_id) = '' then
        raise exception 'validation: seller CMS user id is required';
    end if;
    if p_ready is null then
        raise exception 'validation: capability readiness is required';
    end if;
    if p_evidence_reference is not null
        and length(p_evidence_reference) > 200 then
        raise exception 'validation: capability evidence reference is too long';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
        'commerce.sale-capability:' || p_capability_key, 0
    ));
    select * into v_requirement
    from commerce.sale_capability_requirements
    where capability_key = p_capability_key
    for share;
    if not found then
        raise exception 'not_found: sale capability requirement';
    end if;
    select * into v_seller
    from commerce.sellers
    where cms_user_id = p_cms_user_id
    for share;
    if not found then
        raise exception 'not_found: seller';
    end if;
    if v_seller.kind <> v_requirement.seller_kind then
        raise exception 'conflict: sale capability does not apply to this seller';
    end if;
    insert into commerce.seller_sale_capabilities (
        seller_id, capability_key, ready, evidence_reference,
        confirmed_at, revoked_at
    ) values (
        v_seller.id, p_capability_key, p_ready,
        nullif(btrim(p_evidence_reference), ''),
        case when p_ready then now() else null end,
        case when p_ready then null else now() end
    )
    on conflict (seller_id, capability_key) do update
    set ready = excluded.ready,
        evidence_reference = excluded.evidence_reference,
        confirmed_at = excluded.confirmed_at,
        revoked_at = excluded.revoked_at
    returning * into v_capability;
    return to_jsonb(v_capability);
end;
$$;

drop function if exists commerce.activate_sale_capability_requirement(
    text, text, text[], text
);

create or replace function commerce.activate_sale_capability_requirement(
    p_capability_key text,
    p_seller_kind text,
    p_ready_seller_cms_user_ids text[],
    p_actor_id text,
    p_snapshot_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_ready_count integer;
    v_not_ready_count integer;
begin
    if p_capability_key is null
        or p_capability_key !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: capability key is invalid';
    end if;
    if p_seller_kind not in ('merchant', 'user', 'external') then
        raise exception 'validation: seller kind is invalid';
    end if;
    if p_actor_id is null or btrim(p_actor_id) = '' then
        raise exception 'validation: capability requirement actor is required';
    end if;
    if p_snapshot_at is null or p_snapshot_at > now() + interval '5 minutes' then
        raise exception 'validation: capability snapshot timestamp is invalid';
    end if;
    if exists (
        select 1
        from unnest(coalesce(p_ready_seller_cms_user_ids, array[]::text[])) identity(value)
        where identity.value is null or btrim(identity.value) = ''
    ) then
        raise exception 'validation: ready seller identities are invalid';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
        'commerce.sale-capability:' || p_capability_key, 0
    ));
    insert into commerce.sale_capability_requirements (
        capability_key, seller_kind, enabled, configured_by
    ) values (
        p_capability_key, p_seller_kind, false, p_actor_id
    )
    on conflict (capability_key) do update
    set seller_kind = excluded.seller_kind,
        enabled = false,
        configured_by = excluded.configured_by;

    insert into commerce.seller_sale_capabilities (
        seller_id, capability_key, ready, evidence_reference,
        confirmed_at, revoked_at
    )
    select
        seller.id,
        p_capability_key,
        seller.cms_user_id = any(coalesce(p_ready_seller_cms_user_ids, array[]::text[])),
        'installation-reconciliation',
        case when seller.cms_user_id = any(
            coalesce(p_ready_seller_cms_user_ids, array[]::text[])
        ) then now() else null end,
        case when seller.cms_user_id = any(
            coalesce(p_ready_seller_cms_user_ids, array[]::text[])
        ) then null else now() end
    from commerce.sellers seller
    where seller.kind = p_seller_kind
    on conflict (seller_id, capability_key) do update
    set ready = excluded.ready,
        evidence_reference = excluded.evidence_reference,
        confirmed_at = excluded.confirmed_at,
        revoked_at = excluded.revoked_at
    where commerce.seller_sale_capabilities.updated_at <= p_snapshot_at;

    select count(*) filter (where capability.ready),
           count(*) filter (where not capability.ready)
    into v_ready_count, v_not_ready_count
    from commerce.seller_sale_capabilities capability
    join commerce.sellers seller on seller.id = capability.seller_id
    where capability.capability_key = p_capability_key
      and seller.kind = p_seller_kind;

    update commerce.sale_capability_requirements
    set enabled = true, configured_by = p_actor_id
    where capability_key = p_capability_key;
    return jsonb_build_object(
        'capabilityKey', p_capability_key,
        'sellerKind', p_seller_kind,
        'enabled', true,
        'readyCount', coalesce(v_ready_count, 0),
        'notReadyCount', coalesce(v_not_ready_count, 0)
    );
end;
$$;

revoke execute on function commerce.configure_sale_capability_requirement(
    text, text, boolean, text
) from public, anon, authenticated;
revoke execute on function commerce.record_seller_sale_capability(
    text, text, boolean, text
) from public, anon, authenticated;
revoke execute on function commerce.activate_sale_capability_requirement(
    text, text, text[], text, timestamptz
) from public, anon, authenticated;
