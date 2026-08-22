

create or replace function commerce.upsert_category(
    p_category_id bigint,
    p_payload jsonb,
    p_expected_version integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_category commerce.categories%rowtype;
    v_parent_id bigint := nullif(p_payload->>'parentId', '')::bigint;
begin
    if p_category_id is not null and v_parent_id is not null and exists (
        with recursive descendants as (
            select id from commerce.categories where parent_id = p_category_id
            union all
            select child.id from commerce.categories child join descendants parent on child.parent_id = parent.id
        )
        select 1 from descendants where id = v_parent_id
    ) then raise exception 'validation: category parent cannot be a descendant'; end if;

    if p_category_id is null then
        insert into commerce.categories (parent_id, slug, full_slug, label, description, status, position, metadata)
        values (
            v_parent_id,
            lower(btrim(p_payload->>'slug')),
            lower(btrim(p_payload->>'slug')),
            btrim(p_payload->>'label'),
            nullif(btrim(p_payload->>'description'), ''),
            coalesce(nullif(p_payload->>'status', ''), 'active'),
            coalesce(nullif(p_payload->>'position', '')::integer, 0),
            coalesce(p_payload->'metadata', '{}'::jsonb)
        ) returning * into v_category;
    else
        if p_expected_version is null then raise exception 'validation: expected category version is required'; end if;
        select * into v_category from commerce.categories where id = p_category_id for update;
        if not found then raise exception 'not_found: category'; end if;
        if v_category.version is distinct from p_expected_version then raise exception 'conflict: stale category version'; end if;
        update commerce.categories
        set parent_id = case when p_payload ? 'parentId' then v_parent_id else parent_id end,
            slug = coalesce(nullif(lower(btrim(p_payload->>'slug')), ''), slug),
            label = coalesce(nullif(btrim(p_payload->>'label'), ''), label),
            description = case when p_payload ? 'description' then nullif(btrim(p_payload->>'description'), '') else description end,
            status = coalesce(nullif(p_payload->>'status', ''), status),
            position = case when p_payload ? 'position' then coalesce(nullif(p_payload->>'position', '')::integer, 0) else position end,
            metadata = case when p_payload ? 'metadata' then p_payload->'metadata' else metadata end
        where id = p_category_id
        returning * into v_category;
    end if;
    return to_jsonb(v_category);
end;
$$;