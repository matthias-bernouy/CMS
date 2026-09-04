create or replace function sales_configurator.assert_draft_selection_shape(
    p_selections jsonb,
    p_custom_items jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_selection jsonb;
    v_feature_id jsonb;
    v_custom_item jsonb;
    v_optional_count integer := 0;
begin
    if pg_catalog.jsonb_typeof(p_selections) is distinct from 'array' then
        raise exception 'validation: selections must be an array';
    end if;
    if pg_catalog.jsonb_typeof(p_custom_items) is distinct from 'array' then
        raise exception 'validation: customItems must be an array';
    end if;
    if pg_catalog.jsonb_array_length(p_selections) > 100 then
        raise exception 'validation: at most 100 variants may be selected';
    end if;
    if pg_catalog.jsonb_array_length(p_custom_items) > 100 then
        raise exception 'validation: at most 100 custom items may be submitted';
    end if;
    if pg_catalog.jsonb_array_length(p_selections) = 0
        and pg_catalog.jsonb_array_length(p_custom_items) = 0
    then
        raise exception 'validation: at least one selection or custom item is required';
    end if;

    for v_selection in
        select value from pg_catalog.jsonb_array_elements(p_selections)
    loop
        if pg_catalog.jsonb_typeof(v_selection) <> 'object'
            or pg_catalog.jsonb_typeof(v_selection -> 'variantItemId') <> 'number'
            or pg_catalog.jsonb_typeof(v_selection -> 'optionalFeatureItemIds') <> 'array'
        then
            raise exception
                'validation: each selection requires variantItemId and optionalFeatureItemIds';
        end if;

        perform (v_selection ->> 'variantItemId')::bigint;
        v_optional_count := v_optional_count
            + pg_catalog.jsonb_array_length(v_selection -> 'optionalFeatureItemIds');

        for v_feature_id in
            select value
            from pg_catalog.jsonb_array_elements(
                v_selection -> 'optionalFeatureItemIds'
            )
        loop
            if pg_catalog.jsonb_typeof(v_feature_id) <> 'number' then
                raise exception 'validation: optional feature ids must be numbers';
            end if;
            perform v_feature_id::text::bigint;
        end loop;
    end loop;

    if v_optional_count > 500 then
        raise exception 'validation: at most 500 optional features may be selected';
    end if;

    for v_custom_item in
        select value from pg_catalog.jsonb_array_elements(p_custom_items)
    loop
        if pg_catalog.jsonb_typeof(v_custom_item) <> 'object' then
            raise exception 'validation: each custom item must be an object';
        end if;
        perform sales_configurator.require_bounded_text(
            v_custom_item ->> 'label',
            'customItem.label',
            300
        );
        perform sales_configurator.optional_bounded_text(
            v_custom_item ->> 'description',
            'customItem.description',
            10000
        );
        if v_custom_item ? 'quantity' then
            if pg_catalog.jsonb_typeof(v_custom_item -> 'quantity') <> 'number'
                or (v_custom_item ->> 'quantity')::integer not between 1 and 100000
            then
                raise exception 'validation: custom item quantity must be between 1 and 100000';
            end if;
        end if;
    end loop;
end;
$$;
