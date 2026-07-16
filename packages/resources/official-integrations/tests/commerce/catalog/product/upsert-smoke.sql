\set ON_ERROR_STOP on

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
    v_created := commerce.upsert_product(null, jsonb_build_object(
        'slug', 'product-contract-smoke',
        'title', 'Product contract smoke',
        'status', 'active',
        'visibility', 'public'
    ));
    v_product_id := (v_created->>'id')::bigint;
    v_initial_version := (v_created->>'version')::integer;

    v_updated := commerce.upsert_product(
        v_product_id,
        '{"title":"Product contract smoke"}'::jsonb,
        v_initial_version
    );
    v_updated_version := (v_updated->>'version')::integer;
    if v_updated_version <> v_initial_version + 1 then
        raise exception 'product contract smoke: identical save did not increment the version';
    end if;

    begin
        perform commerce.upsert_product(
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
        perform commerce.upsert_product(
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

rollback;
