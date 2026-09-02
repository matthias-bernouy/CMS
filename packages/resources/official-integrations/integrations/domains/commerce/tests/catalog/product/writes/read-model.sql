\set ON_ERROR_STOP on
-- Baseline read-model and optimistic-locking contract.
begin;
set local role service_role;
do $$
declare
    v_created jsonb;
    v_updated jsonb;
    v_product_id bigint;
    v_initial_version integer;
    v_updated_version integer;
begin
    v_created := commerce.upsert_product_read_model(null, jsonb_build_object(
        'slug', 'product-contract-smoke',
        'title', 'Product contract smoke',
        'status', 'active',
        'visibility', 'public'
    ), null);
    v_product_id := (v_created->'product'->>'id')::bigint;
    v_initial_version := (v_created->'product'->>'version')::integer;
    v_updated := commerce.upsert_product_read_model(
        v_product_id,
        '{"title":"Product contract smoke"}'::jsonb,
        v_initial_version
    );
    v_updated_version := (v_updated->'product'->>'version')::integer;
    if v_updated_version <> v_initial_version + 1 then
        raise exception 'product contract smoke: identical save did not increment the version';
    end if;
    begin
        perform commerce.upsert_product_read_model(
            v_product_id,
            '{"title":"Stale writer"}'::jsonb,
            v_initial_version
        );
        raise exception 'product contract smoke: stale update was accepted';
    exception when others then
        if sqlerrm = 'product contract smoke: stale update was accepted'
            or sqlerrm <> 'conflict: stale product version' then
            raise;
        end if;
    end;
    if (select version from commerce.products where id = v_product_id) <> v_updated_version
        or (select title from commerce.products where id = v_product_id) <> 'Product contract smoke' then
        raise exception 'product contract smoke: stale update changed the product';
    end if;
    begin
        perform commerce.upsert_product_read_model(
            v_product_id,
            jsonb_build_object(
                'title', 'Rolled back title',
                'variantAxes', '[{"key":"size","label":"Size","position":0,"values":[{"key":"m","label":"M","position":0}]}]'::jsonb,
                'variantMatrix', '[{"key":"size:m","title":"Size: M","position":0,"choices":[]}]'::jsonb
            ),
            v_updated_version
        );
        raise exception 'product contract smoke: invalid matrix was accepted';
    exception when others then
        if sqlerrm = 'product contract smoke: invalid matrix was accepted'
            or sqlerrm <> 'validation: every variant combination must select one value per axis' then
            raise;
        end if;
    end;
    if (select version from commerce.products where id = v_product_id) <> v_updated_version
        or (select title from commerce.products where id = v_product_id) <> 'Product contract smoke'
        or exists (select 1 from commerce.product_variant_axes where product_id = v_product_id) then
        raise exception 'product contract smoke: failed matrix update was not atomic';
    end if;
end;
$$;
do $$
declare
    v_brand jsonb;
    v_category jsonb;
    v_bundle jsonb;
    v_public jsonb;
    v_media jsonb;
    v_product_id bigint;
    v_signature text;
begin
    perform commerce.upsert_custom_field(
        'product', 'smokePublic', 'Smoke public', 'string', '[]'::jsonb,
        false, false, true, true, false, 0, true, null
    );
    perform commerce.upsert_custom_field(
        'product', 'smokePrivate', 'Smoke private', 'string', '[]'::jsonb,
        false, false, true, false, false, 1, true, null
    );
    v_brand := commerce.upsert_brand(
        null, '{"slug":"bundle-brand","name":"Bundle brand"}'::jsonb
    );
    v_category := commerce.upsert_category(
        null, '{"slug":"bundle-category","label":"Bundle category"}'::jsonb
    );
    perform commerce.upsert_category_custom_field((v_category->>'id')::bigint, 'smokePublic');
    perform commerce.upsert_category_custom_field((v_category->>'id')::bigint, 'smokePrivate');
    v_bundle := commerce.upsert_product_read_model(null, jsonb_build_object(
        'slug', 'product-bundle-smoke',
        'title', 'Product bundle smoke',
        'brandId', v_brand->>'id',
        'primaryCategoryId', v_category->>'id',
        'status', 'active',
        'visibility', 'public',
        'metadata', '{"smokePublic":"shown","smokePrivate":"hidden"}'::jsonb,
        'variantAxes', '[{"key":"size","label":"Size","position":0,"values":[{"key":"m","label":"M","value":"M","position":0}]}]'::jsonb,
        'variantMatrix', '[{"key":"size:m","title":"Size: M","position":0,"choices":[{"axisKey":"size","valueKey":"m"}]}]'::jsonb
    ), null);
    v_product_id := (v_bundle->'product'->>'id')::bigint;
    if v_bundle->>'state' <> 'ok'
        or jsonb_array_length(v_bundle->'axes') <> 1
        or jsonb_array_length(v_bundle->'values') <> 1
        or jsonb_array_length(v_bundle->'variants') <> 1
        or jsonb_array_length(v_bundle->'selections') <> 1
        or jsonb_array_length(v_bundle->'categories') <> 1
        or v_bundle->'brand'->>'id' <> v_brand->>'id'
        or (select array_agg(key order by key)
            from jsonb_object_keys(v_bundle->'product') product_key(key)) <> array[
                'brand_id', 'created_at', 'description', 'id', 'metadata', 'slug',
                'status', 'title', 'updated_at', 'version', 'visibility'
            ]
        or v_bundle->'public_metadata_keys' <> '[]'::jsonb then
        raise exception 'product bundle smoke: upsert did not return the complete admin bundle';
    end if;
    v_media := commerce.attach_product_media(
        v_product_id, 'commerce-media', 'products/bundle-smoke/main.webp',
        'image/webp', 128, 'main.webp', null
    );
    v_bundle := commerce.get_product_read_model('admin', v_product_id, 'ignored-slug');
    if v_bundle->>'state' <> 'ok'
        or jsonb_array_length(v_bundle->'media') <> 1
        or v_bundle->'media'->0->>'media_id' <> v_media->>'media_id' then
        raise exception 'product bundle smoke: admin read bundle is incomplete';
    end if;
    v_public := commerce.get_product_read_model('public', null, 'product-bundle-smoke');
    if v_public->>'state' <> 'ok'
        or v_public->'public_metadata_keys' <> '["smokePublic"]'::jsonb
        or v_public->'product'->'metadata'->>'smokePrivate' <> 'hidden' then
        raise exception 'product bundle smoke: public metadata policy is incomplete';
    end if;
    if commerce.get_product_read_model('invalid', v_product_id, null)->>'state' <> 'invalid_scope'
        or commerce.get_product_read_model('admin', 9223372036854775807, null)->>'state' <> 'not_found' then
        raise exception 'product bundle smoke: read states are incorrect';
    end if;
    update commerce.products set visibility = 'hidden' where id = v_product_id;
    if commerce.get_product_read_model('public', v_product_id, null)->>'state' <> 'not_found'
        or commerce.get_product_read_model('admin', v_product_id, null)->>'state' <> 'ok' then
        raise exception 'product bundle smoke: public visibility boundary changed';
    end if;
    foreach v_signature in array array[
        'commerce.product_read_bundle(bigint,text,boolean,boolean)',
        'commerce.get_product_read_model(text,bigint,text)',
        'commerce.upsert_product_read_model(bigint,jsonb,integer)'
    ] loop
        if not has_function_privilege('service_role', v_signature, 'execute')
            or has_function_privilege('anon', v_signature, 'execute')
            or has_function_privilege('authenticated', v_signature, 'execute') then
            raise exception 'product bundle smoke: invalid function ACL for %', v_signature;
        end if;
    end loop;
    if exists (
        select 1
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'commerce'
          and procedure.proname in (
              'product_read_bundle', 'get_product_read_model', 'upsert_product_read_model'
          )
          and (procedure.prosecdef or not coalesce(
              procedure.proconfig @> array['search_path=""']::text[], false
          ))
    ) then
        raise exception 'product bundle smoke: function security attributes are unsafe';
    end if;
end;
$$;
rollback;
