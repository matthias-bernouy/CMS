\set ON_ERROR_STOP on
begin;
set local role service_role;

select (commerce.upsert_category(null, jsonb_build_object(
    'slug', 'read-model-root', 'label', 'Read model root'
))->>'id')::bigint root_id \gset
select (commerce.upsert_category(null, jsonb_build_object(
    'parentId', :root_id,
    'slug', 'read-model-child',
    'label', 'Read model child',
    'metadata', '{"snake_key":"opaque","internal_margin":12}'::jsonb
))->>'id')::bigint category_id \gset
update commerce.categories set status = 'inactive' where id = :root_id;
insert into commerce.categories (id, slug, full_slug, label)
values (0, 'read-model-zero', 'read-model-zero', 'Read model zero');
select (commerce.upsert_category(null, jsonb_build_object(
    'parentId', 0, 'slug', 'read-model-zero-child', 'label', 'Read model zero child'
))->>'id')::bigint zero_child_id \gset

insert into commerce.custom_field_definitions (
    entity_type, key, label, field_type, options, unit, public_readable, enabled
) values
    ('product', 'grip', 'Grip', 'enum', '["L1","L2"]', null, true, false),
    ('product', 'parentOnly', 'Parent only', 'string', '[]', null, true, true),
    ('product', 'weight', 'Weight', 'number', '[]', 'g', false, true);
insert into commerce.category_custom_fields (
    category_id, field_key, required, filterable, position
) values
    (:category_id, 'weight', false, false, 1),
    (:category_id, 'grip', true, true, 1),
    (:root_id, 'parentOnly', false, true, 0);

do $$
declare
    v_admin jsonb;
    v_public jsonb;
    v_zero_parent jsonb;
    v_keys text[];
begin
    v_admin := commerce.get_category_read_model(
        'admin',
        (select id from commerce.categories where full_slug = 'read-model-root/read-model-child'),
        'ignored-selector'
    );
    if v_admin->>'state' is distinct from 'ok'
        or v_admin->'category'->>'full_slug' is distinct from 'read-model-root/read-model-child'
        or v_admin->'category'->'metadata'->>'snake_key' is distinct from 'opaque'
        or v_admin->'parent'->>'status' is distinct from 'inactive'
        or jsonb_array_length(v_admin->'category_fields') is distinct from 2
        or v_admin->'category_fields'->0->>'field_key' is distinct from 'grip'
        or v_admin->'category_fields'->1->>'field_key' is distinct from 'weight'
        or (v_admin->'category_fields'->0->'definition'->>'enabled')::boolean
            is distinct from false then
        raise exception 'category read model smoke: administrator bundle changed';
    end if;
    if exists (
        select 1 from jsonb_array_elements(v_admin->'category_fields') field
        where field->>'field_key' = 'parentOnly'
    ) then
        raise exception 'category read model smoke: inherited field leaked into direct assignments';
    end if;

    v_zero_parent := commerce.get_category_read_model(
        'admin', null, 'read-model-zero/read-model-zero-child'
    );
    if v_zero_parent->'category'->>'parent_id' is distinct from '0'
        or v_zero_parent->'parent' is distinct from 'null'::jsonb then
        raise exception 'category read model smoke: zero parent truthiness changed';
    end if;

    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_admin->'category') category_key(key);
    if v_keys is distinct from array[
        'created_at', 'description', 'full_slug', 'id', 'label', 'metadata',
        'parent_id', 'position', 'slug', 'status', 'updated_at', 'version'
    ] then
        raise exception 'category read model smoke: category projection keys changed';
    end if;
    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_admin->'category_fields'->0) field_key(key);
    if v_keys is distinct from array[
        'category_id', 'definition', 'field_key', 'filterable', 'position', 'required'
    ] then
        raise exception 'category read model smoke: field projection keys changed';
    end if;
    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_admin->'category_fields'->0->'definition') definition_key(key);
    if v_keys is distinct from array[
        'enabled', 'field_type', 'label', 'options', 'public_readable', 'unit'
    ] then
        raise exception 'category read model smoke: definition projection keys changed';
    end if;

    v_public := commerce.get_category_read_model(
        'public', null, 'read-model-root/read-model-child'
    );
    if v_public->>'state' is distinct from 'ok'
        or v_public->'parent'->>'status' is distinct from 'inactive'
        or v_public->'category_fields' is distinct from '[]'::jsonb
        or v_public->'category'->'metadata'->>'internal_margin' is distinct from '12' then
        raise exception 'category read model smoke: public bundle changed';
    end if;

    update commerce.categories set status = 'archived'
    where full_slug = 'read-model-root/read-model-child';
    if commerce.get_category_read_model(
        'public', null, 'read-model-root/read-model-child'
    )->>'state' is distinct from 'not_found'
        or commerce.get_category_read_model(
            'admin', null, 'read-model-root/read-model-child'
        )->>'state' is distinct from 'ok'
        or commerce.get_category_read_model('public', null, null)->>'state'
            is distinct from 'not_found'
        or commerce.get_category_read_model(
            'invalid',
            (select id from commerce.categories where full_slug = 'read-model-root/read-model-child'),
            null
        )->>'state' is distinct from 'invalid_scope' then
        raise exception 'category read model smoke: scope states changed';
    end if;

    if not has_function_privilege(
        'service_role', 'commerce.get_category_read_model(text,bigint,text)', 'execute'
    ) or has_function_privilege(
        'anon', 'commerce.get_category_read_model(text,bigint,text)', 'execute'
    ) or has_function_privilege(
        'authenticated', 'commerce.get_category_read_model(text,bigint,text)', 'execute'
    ) then
        raise exception 'category read model smoke: function ACL is unsafe';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'commerce'
          and procedure.proname = 'get_category_read_model'
          and (procedure.prosecdef or procedure.provolatile <> 's'
            or not coalesce(procedure.proconfig @> array['search_path=""']::text[], false))
    ) then
        raise exception 'category read model smoke: function attributes are unsafe';
    end if;
end;
$$;

rollback;
