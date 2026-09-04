create or replace function sales_configurator.insert_draft_catalog_snapshot(
    p_proposal_version_id bigint,
    p_selections jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_selection jsonb;
    v_variant record;
    v_feature record;
    v_module_snapshot_id bigint;
    v_variant_snapshot_id bigint;
    v_sort_order integer := 0;
begin
    for v_selection in
        select selection.value
        from pg_catalog.jsonb_array_elements(p_selections)
            with ordinality selection(value, ordinal)
        order by selection.ordinal
    loop
        select
            variant.item_id as variant_item_id,
            variant.module_item_id,
            variant.pricing_mode,
            variant.unit_amount_cents,
            variant.currency,
            variant_item.code as variant_code,
            variant_item.name as variant_name,
            variant_item.description as variant_description,
            module_item.code as module_code,
            module_item.name as module_name,
            module_item.description as module_description
        into strict v_variant
        from sales_configurator.catalog_variants variant
        join sales_configurator.catalog_items variant_item
          on variant_item.id = variant.item_id
        join sales_configurator.catalog_items module_item
          on module_item.id = variant.module_item_id
        where variant.item_id = (v_selection ->> 'variantItemId')::bigint;

        insert into sales_configurator.proposal_items (
            proposal_version_id,
            catalog_item_id,
            kind,
            origin,
            code,
            label,
            description,
            pricing_mode,
            currency,
            sort_order
        )
        values (
            p_proposal_version_id,
            v_variant.module_item_id,
            'module',
            'selected',
            v_variant.module_code,
            v_variant.module_name,
            v_variant.module_description,
            'included',
            'EUR',
            v_sort_order
        )
        returning id into v_module_snapshot_id;

        insert into sales_configurator.proposal_items (
            proposal_version_id,
            parent_item_id,
            catalog_item_id,
            kind,
            origin,
            code,
            label,
            description,
            pricing_mode,
            unit_amount_cents,
            currency,
            sort_order
        )
        values (
            p_proposal_version_id,
            v_module_snapshot_id,
            v_variant.variant_item_id,
            'variant',
            'selected',
            v_variant.variant_code,
            v_variant.variant_name,
            v_variant.variant_description,
            v_variant.pricing_mode,
            v_variant.unit_amount_cents,
            v_variant.currency,
            0
        )
        returning id into v_variant_snapshot_id;

        for v_feature in
            select
                relation.feature_item_id,
                relation.availability,
                relation.pricing_mode,
                relation.unit_amount_cents,
                relation.sort_order,
                feature_item.code,
                feature_item.name,
                feature_item.description
            from sales_configurator.variant_features relation
            join sales_configurator.catalog_items feature_item
              on feature_item.id = relation.feature_item_id
            where relation.variant_item_id = v_variant.variant_item_id
              and (
                    relation.availability = 'included'
                    or exists (
                        select 1
                        from pg_catalog.jsonb_array_elements(
                            v_selection -> 'optionalFeatureItemIds'
                        ) selected_feature
                        where selected_feature::text::bigint = relation.feature_item_id
                    )
              )
            order by relation.sort_order, relation.feature_item_id
        loop
            insert into sales_configurator.proposal_items (
                proposal_version_id,
                parent_item_id,
                catalog_item_id,
                kind,
                origin,
                code,
                label,
                description,
                pricing_mode,
                unit_amount_cents,
                currency,
                sort_order
            )
            values (
                p_proposal_version_id,
                v_variant_snapshot_id,
                v_feature.feature_item_id,
                'feature',
                case
                    when v_feature.availability = 'included' then 'included'
                    else 'selected'
                end,
                v_feature.code,
                v_feature.name,
                v_feature.description,
                v_feature.pricing_mode,
                v_feature.unit_amount_cents,
                'EUR',
                v_feature.sort_order
            );
        end loop;

        v_sort_order := v_sort_order + 1;
    end loop;
end;
$$;
