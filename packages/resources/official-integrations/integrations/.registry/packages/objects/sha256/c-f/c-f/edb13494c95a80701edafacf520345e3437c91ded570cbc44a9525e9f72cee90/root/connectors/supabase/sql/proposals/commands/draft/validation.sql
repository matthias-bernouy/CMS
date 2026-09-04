create or replace function sales_configurator.validate_draft_selection(
    p_selections jsonb, p_custom_items jsonb
)
returns jsonb language plpgsql volatile
set search_path = ''
as $$
declare
    v_missing jsonb;
begin
    perform sales_configurator.lock_draft_catalog();
    perform sales_configurator.assert_draft_selection_shape(
        p_selections,
        p_custom_items
    );
    if exists (
        select 1
        from (
            select (selection ->> 'variantItemId')::bigint as item_id
            from pg_catalog.jsonb_array_elements(p_selections) selection
            group by (selection ->> 'variantItemId')::bigint
            having pg_catalog.count(*) > 1
        ) duplicate
    ) then
        raise exception 'validation: a variant cannot be selected twice';
    end if;
    if exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_selections) selection
        cross join lateral pg_catalog.jsonb_array_elements(
            selection -> 'optionalFeatureItemIds'
        ) feature
        group by
            (selection ->> 'variantItemId')::bigint,
            feature::text::bigint
        having pg_catalog.count(*) > 1
    ) then
        raise exception 'validation: an optional feature cannot be selected twice';
    end if;

    if exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_selections) selection
        left join sales_configurator.catalog_variants variant
          on variant.item_id = (selection ->> 'variantItemId')::bigint
        left join sales_configurator.catalog_items variant_item
          on variant_item.id = variant.item_id
         and variant_item.kind = 'variant'
         and variant_item.status = 'published'
        left join sales_configurator.catalog_items module_item
          on module_item.id = variant.module_item_id
         and module_item.kind = 'module'
         and module_item.status = 'published'
        where variant_item.id is null or module_item.id is null
    ) then
        raise exception 'validation: every selected variant and module must be published';
    end if;

    if exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_selections) selection
        join sales_configurator.catalog_variants variant
          on variant.item_id = (selection ->> 'variantItemId')::bigint
        group by variant.module_item_id
        having pg_catalog.count(*) > 1
    ) then
        raise exception 'validation: only one variant may be selected per module';
    end if;

    if exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_selections) selection
        cross join lateral pg_catalog.jsonb_array_elements(
            selection -> 'optionalFeatureItemIds'
        ) feature
        left join sales_configurator.variant_features option
          on option.variant_item_id = (selection ->> 'variantItemId')::bigint
         and option.feature_item_id = feature::text::bigint
         and option.availability = 'optional'
        left join sales_configurator.catalog_items feature_item
          on feature_item.id = option.feature_item_id
         and feature_item.kind = 'feature'
         and feature_item.status = 'published'
        where option.variant_item_id is null or feature_item.id is null
    ) then
        raise exception
            'validation: every selected optional feature must be published and offered by its variant';
    end if;

    if exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_selections) selection
        join sales_configurator.variant_features included
          on included.variant_item_id = (selection ->> 'variantItemId')::bigint
         and included.availability = 'included'
        join sales_configurator.catalog_items feature_item
          on feature_item.id = included.feature_item_id
        where feature_item.status <> 'published'
    ) then
        raise exception 'validation: selected variants contain an unpublished included feature';
    end if;

    with selected_variants as (
        select (selection ->> 'variantItemId')::bigint as item_id
        from pg_catalog.jsonb_array_elements(p_selections) selection
    ),
    selected_optional_features as (
        select feature::text::bigint as item_id
        from pg_catalog.jsonb_array_elements(p_selections) selection
        cross join lateral pg_catalog.jsonb_array_elements(
            selection -> 'optionalFeatureItemIds'
        ) feature
    ),
    resolved_items as (
        select item_id from selected_variants
        union
        select variant.module_item_id
        from selected_variants selected
        join sales_configurator.catalog_variants variant
          on variant.item_id = selected.item_id
        union
        select relation.feature_item_id
        from selected_variants selected
        join sales_configurator.variant_features relation
          on relation.variant_item_id = selected.item_id
         and relation.availability = 'included'
        union
        select item_id from selected_optional_features
    ),
    missing as (
        select
            requirement.subject_item_id,
            subject.code as subject_code,
            subject.name as subject_name,
            requirement.required_item_id,
            required.kind as required_kind,
            required.code as required_code,
            required.name as required_name
        from sales_configurator.catalog_requirements requirement
        join resolved_items subject_resolved
          on subject_resolved.item_id = requirement.subject_item_id
        join sales_configurator.catalog_items subject
          on subject.id = requirement.subject_item_id
        join sales_configurator.catalog_items required
          on required.id = requirement.required_item_id
        left join resolved_items required_resolved
          on required_resolved.item_id = requirement.required_item_id
        where required_resolved.item_id is null
    )
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'subjectItemId', missing.subject_item_id,
                'subjectCode', missing.subject_code,
                'subjectName', missing.subject_name,
                'requiredItemId', missing.required_item_id,
                'requiredKind', missing.required_kind,
                'requiredCode', missing.required_code,
                'requiredName', missing.required_name
            )
            order by missing.subject_item_id, missing.required_item_id
        ),
        '[]'::jsonb
    )
    into v_missing
    from missing;

    if pg_catalog.jsonb_array_length(v_missing) > 0 then
        return pg_catalog.jsonb_build_object(
            'state', 'invalid',
            'code', 'missing_requirements',
            'missingRequirements', v_missing
        );
    end if;

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'missingRequirements', '[]'::jsonb
    );
end;
$$;
