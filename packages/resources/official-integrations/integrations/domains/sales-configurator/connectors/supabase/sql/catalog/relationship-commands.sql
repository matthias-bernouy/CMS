create or replace function sales_configurator.upsert_variant_feature(
    p_variant_item_id bigint,
    p_feature_item_id bigint,
    p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payload jsonb := sales_configurator.require_json_object(p_payload, 'payload');
    v_availability text := nullif(v_payload ->> 'availability', '');
    v_pricing_mode text := nullif(
        sales_configurator.json_alias_text(v_payload, 'pricingMode', 'pricing_mode'),
        ''
    );
    v_unit_amount_cents bigint := (
        sales_configurator.json_alias_text(v_payload, 'unitAmountCents', 'unit_amount_cents')
    )::bigint;
    v_result jsonb;
begin
    if not exists (
        select 1 from sales_configurator.catalog_variants variant
        where variant.item_id = p_variant_item_id
    ) then
        raise exception 'validation: variantItemId is not a variant';
    end if;
    if not exists (
        select 1 from sales_configurator.catalog_features feature
        where feature.item_id = p_feature_item_id
    ) then
        raise exception 'validation: featureItemId is not a feature';
    end if;
    if v_availability is null or v_pricing_mode is null then
        raise exception 'validation: availability and pricingMode are required';
    end if;

    insert into sales_configurator.variant_features (
        variant_item_id,
        feature_item_id,
        availability,
        pricing_mode,
        unit_amount_cents,
        sort_order
    )
    values (
        p_variant_item_id,
        p_feature_item_id,
        v_availability,
        v_pricing_mode,
        v_unit_amount_cents,
        coalesce((
            sales_configurator.json_alias_text(v_payload, 'sortOrder', 'sort_order')
        )::integer, 0)
    )
    on conflict (variant_item_id, feature_item_id)
    do update set
        availability = excluded.availability,
        pricing_mode = excluded.pricing_mode,
        unit_amount_cents = excluded.unit_amount_cents,
        sort_order = excluded.sort_order
    returning pg_catalog.jsonb_build_object(
        'variantItemId', variant_item_id,
        'featureItemId', feature_item_id,
        'availability', availability,
        'pricingMode', pricing_mode,
        'unitAmountCents', unit_amount_cents,
        'sortOrder', sort_order
    )
    into v_result;

    return pg_catalog.jsonb_build_object('state', 'ok', 'variantFeature', v_result);
end;
$$;

create or replace function sales_configurator.delete_variant_feature(
    p_variant_item_id bigint,
    p_feature_item_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_deleted boolean;
begin
    delete from sales_configurator.variant_features relation
    where relation.variant_item_id = p_variant_item_id
      and relation.feature_item_id = p_feature_item_id;
    v_deleted := found;

    return pg_catalog.jsonb_build_object(
        'state', case when v_deleted then 'ok' else 'not_found' end,
        'deleted', v_deleted
    );
end;
$$;

create or replace function sales_configurator.upsert_catalog_requirement(
    p_subject_item_id bigint,
    p_required_item_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if not exists (
        select 1 from sales_configurator.catalog_items item
        where item.id = p_subject_item_id
    ) or not exists (
        select 1 from sales_configurator.catalog_items item
        where item.id = p_required_item_id
    ) then
        raise exception 'validation: requirement items must exist';
    end if;

    insert into sales_configurator.catalog_requirements (
        subject_item_id,
        required_item_id
    )
    values (
        p_subject_item_id,
        p_required_item_id
    )
    on conflict (subject_item_id, required_item_id) do nothing;

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'requirement', pg_catalog.jsonb_build_object(
            'subjectItemId', p_subject_item_id,
            'requiredItemId', p_required_item_id
        )
    );
end;
$$;

create or replace function sales_configurator.delete_catalog_requirement(
    p_subject_item_id bigint,
    p_required_item_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_deleted boolean;
begin
    delete from sales_configurator.catalog_requirements requirement
    where requirement.subject_item_id = p_subject_item_id
      and requirement.required_item_id = p_required_item_id;
    v_deleted := found;

    return pg_catalog.jsonb_build_object(
        'state', case when v_deleted then 'ok' else 'not_found' end,
        'deleted', v_deleted
    );
end;
$$;
