
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
