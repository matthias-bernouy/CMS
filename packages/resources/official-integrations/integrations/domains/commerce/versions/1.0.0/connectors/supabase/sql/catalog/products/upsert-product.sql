

create or replace function commerce.upsert_product(
    p_product_id bigint,
    p_payload jsonb,
    p_expected_version integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_product commerce.products%rowtype;
    v_metadata jsonb;
    v_metadata_patch jsonb;
    v_primary_category_id bigint;
    v_axis_field_keys jsonb;
begin
    if p_payload ? 'variantAxes' then
        select coalesce(jsonb_agg(axis->>'fieldKey'), '[]'::jsonb) into v_axis_field_keys
        from jsonb_array_elements(coalesce(p_payload->'variantAxes', '[]'::jsonb)) axis
        where nullif(axis->>'fieldKey', '') is not null;
    end if;
    if p_product_id is null then
        v_primary_category_id := nullif(p_payload->>'primaryCategoryId', '')::bigint;
        v_metadata := coalesce(p_payload->'metadata', '{}'::jsonb);
        perform commerce.assert_product_custom_fields_with_axes(
            v_primary_category_id, v_metadata, 'admin', coalesce(v_axis_field_keys, '[]'::jsonb)
        );
        insert into commerce.products (slug, title, description, brand_id, status, visibility, metadata)
        values (
            lower(btrim(p_payload->>'slug')),
            btrim(p_payload->>'title'),
            nullif(btrim(p_payload->>'description'), ''),
            nullif(p_payload->>'brandId', '')::bigint,
            coalesce(nullif(p_payload->>'status', ''), 'draft'),
            coalesce(nullif(p_payload->>'visibility', ''), 'public'),
            v_metadata
        ) returning * into v_product;
        if v_primary_category_id is not null then
            insert into commerce.product_categories (product_id, category_id, is_primary)
            values (v_product.id, v_primary_category_id, true);
        end if;
        if p_payload ? 'variantAxes' then
            perform commerce.sync_product_variant_matrix(
                v_product.id, p_payload->'variantAxes', p_payload->'variantMatrix'
            );
        end if;
    else
        if p_expected_version is null then raise exception 'validation: expected product version is required'; end if;
        select * into v_product from commerce.products where id = p_product_id for update;
        if not found then raise exception 'not_found: product'; end if;
        if v_product.version is distinct from p_expected_version then
            raise exception 'conflict: stale product version';
        end if;
        select category_id into v_primary_category_id
        from commerce.product_categories where product_id = p_product_id and is_primary;
        if p_payload ? 'primaryCategoryId' then
            v_primary_category_id := nullif(p_payload->>'primaryCategoryId', '')::bigint;
        end if;
        if not (p_payload ? 'variantAxes') then
            select coalesce(jsonb_agg(field_key), '[]'::jsonb) into v_axis_field_keys
            from commerce.product_variant_axes
            where product_id = p_product_id and field_key is not null;
        end if;
        perform id from commerce.product_variants
        where product_id = v_product.id
        order by id
        for update;
        perform id from commerce.offers
        where product_id = v_product.id
        order by id
        for update;
        if p_payload ? 'metadata' then
            v_metadata_patch := p_payload->'metadata';
            perform commerce.assert_custom_field_patch('product', v_metadata_patch, 'admin');
            v_metadata := coalesce(v_metadata_patch, '{}'::jsonb);
        else
            v_metadata := v_product.metadata;
        end if;
        perform commerce.assert_product_custom_fields_with_axes(
            v_primary_category_id, v_metadata, 'system', coalesce(v_axis_field_keys, '[]'::jsonb)
        );
        update commerce.products
        set slug = coalesce(nullif(lower(btrim(p_payload->>'slug')), ''), slug),
            title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
            description = case when p_payload ? 'description' then nullif(btrim(p_payload->>'description'), '') else description end,
            brand_id = case when p_payload ? 'brandId' then nullif(p_payload->>'brandId', '')::bigint else brand_id end,
            status = coalesce(nullif(p_payload->>'status', ''), status),
            visibility = coalesce(nullif(p_payload->>'visibility', ''), visibility),
            metadata = case when p_payload ? 'metadata' then v_metadata else metadata end
        where id = p_product_id
        returning * into v_product;
        if p_payload ? 'primaryCategoryId' then
            delete from commerce.product_categories where product_id = v_product.id and is_primary;
            if v_primary_category_id is not null then
                insert into commerce.product_categories (product_id, category_id, is_primary)
                values (v_product.id, v_primary_category_id, true)
                on conflict (product_id, category_id) do update set is_primary = true;
            end if;
        end if;
        if p_payload ? 'variantAxes' then
            perform commerce.sync_product_variant_matrix(
                v_product.id, p_payload->'variantAxes', p_payload->'variantMatrix'
            );
        end if;
        if v_product.status <> 'active' or v_product.visibility <> 'public' then
            update commerce.offers
            set publication_status = 'paused'
            where product_id = v_product.id and publication_status = 'active';
        end if;
    end if;
    return to_jsonb(v_product);
end;
$$;