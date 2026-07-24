\set ON_ERROR_STOP on

begin;
set local role service_role;

\ir read-model.fixture.sql

do $$
declare
    v_slug text := 'filter-read-model-root/filter-read-model-child';
    v_schema jsonb;
    v_actual jsonb;
    v_base_fields jsonb;
    v_filtered jsonb;
    v_range jsonb;
    v_keys text[];
begin
    v_schema := commerce.offer_filter_schema(v_slug);
    v_actual := commerce.get_offer_filter_schema_read_model(v_slug);

    select jsonb_agg(field.value - 'range' order by field.ordinality)
    into v_base_fields
    from jsonb_array_elements(v_actual->'fields')
        with ordinality field(value, ordinality);
    if v_schema is null
        or v_actual->'category' is distinct from v_schema->'category'
        or v_base_fields is distinct from v_schema->'fields' then
        raise exception 'offer filter read model: schema projection changed';
    end if;
    select field->'range' into v_range
    from jsonb_array_elements(v_actual->'fields') field
    where field->>'key' = 'filterReadModelWeight';
    if v_range is distinct from
        '{"minimum":280.5,"maximum":325.25,"step":0.000001}'::jsonb then
        raise exception
            'offer filter read model: expected dynamic numeric range, got %',
            v_range;
    end if;
    select field->'range' into v_range
    from jsonb_array_elements(v_actual->'fields') field
    where field->>'key' = 'filterReadModelTolerance';
    if v_range is distinct from
        '{"minimum":1.0000001,"maximum":1.0000013,"step":0.0000006}'::jsonb
        or (v_range->>'minimum')::double precision
            >= (v_range->>'maximum')::double precision then
        raise exception
            'offer filter read model: non-aligned range collapsed, got %',
            v_range;
    end if;
    v_filtered := commerce.search_public_offers(
        v_slug,
        null,
        '{"filterReadModelWeight":{"gte":280,"lte":281}}'::jsonb,
        null, null, null, null, 'recent', 20, 0
    );
    if (v_filtered->>'total')::integer <> 1
        or v_filtered->'items'->0->>'slug' <> 'filter-range-present' then
        raise exception
            'offer metadata filter admitted a missing or null value: %',
            v_filtered;
    end if;
    v_filtered := commerce.search_public_offers(
        v_slug, null, '{"filterReadModelWeight":{"eq":null}}'::jsonb,
        null, null, null, null, 'recent', 20, 0
    );
    if (v_filtered->>'total')::integer <> 0 then
        raise exception 'null metadata became a filter value: %', v_filtered;
    end if;
    if jsonb_array_length(v_actual->'brands') <> 200
        or v_actual->'brands'->0->>'name' is distinct from 'Alpha'
        or v_actual->'brands'->1->>'id' is distinct from '9100000000001'
        or v_actual->'brands'->2->>'id' is distinct from '9100000000002'
        or v_actual->'brands'->199->>'name' is distinct from 'Filter 197' then
        raise exception 'offer filter read model: brand limit or order changed';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(v_actual->'brands') brand
        where brand->>'slug' in (
            'filter-inactive', 'filter-archived', 'filter-generated-198',
            'filter-outside'
        )
    ) then
        raise exception 'offer filter read model: excluded brand was returned';
    end if;

    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_actual) model_key(key);
    if v_keys is distinct from array['brands', 'category', 'fields'] then
        raise exception 'offer filter read model: top-level keys changed';
    end if;
    select array_agg(key order by key) into v_keys
    from jsonb_object_keys(v_actual->'brands'->0) brand_key(key);
    if v_keys is distinct from array['id', 'name', 'slug'] then
        raise exception 'offer filter read model: brand keys changed';
    end if;

    update commerce.brands set status = 'inactive'
    where slug like 'filter-%' and status = 'active';
    if commerce.get_offer_filter_schema_read_model(v_slug)->'brands'
        is distinct from '[]'::jsonb then
        raise exception 'offer filter read model: empty brands changed';
    end if;

    update commerce.products
    set metadata = metadata
        - 'filterReadModelWeight'
        - 'filterReadModelTolerance'
    where id in (
        select category_link.product_id
        from commerce.product_categories category_link
        where category_link.category_id = (
            select id from commerce.categories where full_slug = v_slug
        )
    );
    update commerce.product_variants
    set metadata = metadata
        - 'filterReadModelWeight'
        - 'filterReadModelTolerance'
    where product_id in (
        select category_link.product_id
        from commerce.product_categories category_link
        where category_link.category_id = (
            select id from commerce.categories where full_slug = v_slug
        )
    );
    if exists (
        select 1
        from jsonb_array_elements(
            commerce.get_offer_filter_schema_read_model(v_slug)->'fields'
        ) field
        where field->>'key' in (
            'filterReadModelWeight',
            'filterReadModelTolerance'
        )
          and field->'range' is distinct from 'null'::jsonb
    ) then
        raise exception
            'offer filter read model: empty numeric ranges must be null';
    end if;
    if commerce.get_offer_filter_schema_read_model('filter-read-model-missing')
        is not null then
        raise exception 'offer filter read model: missing category returned a model';
    end if;
    update commerce.categories set status = 'inactive'
    where full_slug = v_slug;
    if commerce.get_offer_filter_schema_read_model(v_slug) is not null then
        raise exception 'offer filter read model: inactive category returned a model';
    end if;

    if not has_function_privilege(
        'service_role',
        'commerce.get_offer_filter_schema_read_model(text)',
        'execute'
    ) or has_function_privilege(
        'anon', 'commerce.get_offer_filter_schema_read_model(text)', 'execute'
    ) or has_function_privilege(
        'authenticated',
        'commerce.get_offer_filter_schema_read_model(text)',
        'execute'
    ) then
        raise exception 'offer filter read model: function ACL is unsafe';
    end if;
    if exists (
        select 1
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'commerce'
          and procedure.proname = 'get_offer_filter_schema_read_model'
          and (procedure.prosecdef or procedure.provolatile <> 's'
            or not coalesce(
                procedure.proconfig @> array['search_path=""']::text[], false
            ))
    ) then
        raise exception 'offer filter read model: function attributes are unsafe';
    end if;
end;
$$;

rollback;
