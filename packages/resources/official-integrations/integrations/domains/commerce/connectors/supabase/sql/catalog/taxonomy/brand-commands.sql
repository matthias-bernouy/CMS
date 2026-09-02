

create or replace function commerce.upsert_brand(
    p_brand_id bigint,
    p_payload jsonb,
    p_expected_version integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_brand commerce.brands%rowtype;
begin
    if p_brand_id is null then
        insert into commerce.brands (slug, name, description, status, metadata)
        values (
            lower(btrim(p_payload->>'slug')),
            btrim(p_payload->>'name'),
            nullif(btrim(p_payload->>'description'), ''),
            coalesce(nullif(p_payload->>'status', ''), 'active'),
            coalesce(p_payload->'metadata', '{}'::jsonb)
        ) returning * into v_brand;
    else
        if p_expected_version is null then raise exception 'validation: expected brand version is required'; end if;
        select * into v_brand from commerce.brands where id = p_brand_id for update;
        if not found then raise exception 'not_found: brand'; end if;
        if v_brand.version is distinct from p_expected_version then raise exception 'conflict: stale brand version'; end if;
        update commerce.brands
        set slug = coalesce(nullif(lower(btrim(p_payload->>'slug')), ''), slug),
            name = coalesce(nullif(btrim(p_payload->>'name'), ''), name),
            description = case when p_payload ? 'description' then nullif(btrim(p_payload->>'description'), '') else description end,
            status = coalesce(nullif(p_payload->>'status', ''), status),
            metadata = case when p_payload ? 'metadata' then p_payload->'metadata' else metadata end
        where id = p_brand_id
        returning * into v_brand;
    end if;
    return to_jsonb(v_brand);
end;
$$;

create or replace function commerce.delete_brand(p_brand_id bigint)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_brand commerce.brands%rowtype;
begin
    select * into v_brand from commerce.brands where id = p_brand_id for update;
    if not found then raise exception 'not_found: brand not found'; end if;
    if exists (select 1 from commerce.products where brand_id = p_brand_id) then
        raise exception 'conflict: brand is used by at least one product';
    end if;
    delete from commerce.brands where id = p_brand_id;
    return jsonb_build_object('id', p_brand_id, 'deleted', true);
end;
$$;