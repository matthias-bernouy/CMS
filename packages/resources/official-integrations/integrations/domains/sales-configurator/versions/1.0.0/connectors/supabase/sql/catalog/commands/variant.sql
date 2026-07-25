create or replace function sales_configurator.upsert_catalog_variant(p_item_id bigint, p_payload jsonb)
returns jsonb language plpgsql security invoker
set search_path = ''
as $$
declare
    v_payload jsonb := sales_configurator.require_json_object(p_payload, 'payload');
    v_item_id bigint;
    v_kind text;
    v_module_item_id bigint := (
        sales_configurator.json_alias_text(p_payload, 'moduleItemId', 'module_item_id')
    )::bigint;
    v_status text;
    v_pricing_mode text := nullif(
        sales_configurator.json_alias_text(p_payload, 'pricingMode', 'pricing_mode'),
        ''
    );
    v_unit_amount_cents bigint := (
        sales_configurator.json_alias_text(p_payload, 'unitAmountCents', 'unit_amount_cents')
    )::bigint;
    v_provider_name text := sales_configurator.optional_bounded_text(
        sales_configurator.json_alias_text(p_payload, 'providerName', 'provider_name'),
        'providerName',
        200
    );
    v_result jsonb;
begin
    if sales_configurator.json_alias_text(v_payload, 'currency', 'currency')
        is distinct from null
        and v_payload ->> 'currency' <> 'EUR'
    then
        raise exception 'validation: only EUR is supported';
    end if;

    if p_item_id is null then
        if v_module_item_id is null or v_pricing_mode is null then
            raise exception 'validation: moduleItemId and pricingMode are required';
        end if;
        v_status := coalesce(
            nullif(v_payload ->> 'status', ''),
            'draft'
        );
        insert into sales_configurator.catalog_items (
            kind, code, name, description, status, sort_order
        )
        values (
            'variant',
            pg_catalog.lower(
                sales_configurator.require_bounded_text(v_payload ->> 'code', 'code', 120)
            ),
            sales_configurator.require_bounded_text(v_payload ->> 'name', 'name', 200),
            sales_configurator.optional_bounded_text(
                v_payload ->> 'description',
                'description',
                10000
            ),
            v_status,
            coalesce((
                sales_configurator.json_alias_text(v_payload, 'sortOrder', 'sort_order')
            )::integer, 0)
        )
        returning id into v_item_id;
        insert into sales_configurator.catalog_variants (
            item_id, module_item_id, provider_name,
            pricing_mode, unit_amount_cents, currency
        )
        values (
            v_item_id, v_module_item_id, v_provider_name,
            v_pricing_mode, v_unit_amount_cents, 'EUR'
        );
    else
        select item.kind
        into v_kind
        from sales_configurator.catalog_items item
        where item.id = p_item_id
        for update;
        if not found then
            return pg_catalog.jsonb_build_object('state', 'not_found');
        end if;
        if v_kind <> 'variant' then
            raise exception 'validation: catalog item is not a variant';
        end if;

        update sales_configurator.catalog_items item
        set
            code = case when v_payload ? 'code'
                then pg_catalog.lower(
                    sales_configurator.require_bounded_text(v_payload ->> 'code', 'code', 120)
                )
                else item.code
            end,
            name = case when v_payload ? 'name'
                then sales_configurator.require_bounded_text(
                    v_payload ->> 'name',
                    'name',
                    200
                )
                else item.name
            end,
            description = case when v_payload ? 'description'
                then sales_configurator.optional_bounded_text(
                    v_payload ->> 'description',
                    'description',
                    10000
                )
                else item.description
            end,
            status = case when v_payload ? 'status'
                then v_payload ->> 'status'
                else item.status
            end,
            sort_order = case
                when sales_configurator.json_has_alias(v_payload, 'sortOrder', 'sort_order')
                    then (
                        sales_configurator.json_alias_text(v_payload, 'sortOrder', 'sort_order')
                    )::integer
                else item.sort_order
            end
        where item.id = p_item_id
        returning status into v_status;

        update sales_configurator.catalog_variants variant
        set
            module_item_id = coalesce(v_module_item_id, variant.module_item_id),
            provider_name = case
                when sales_configurator.json_has_alias(v_payload, 'providerName', 'provider_name')
                    then v_provider_name
                else variant.provider_name
            end,
            pricing_mode = coalesce(v_pricing_mode, variant.pricing_mode),
            unit_amount_cents = case
                when sales_configurator.json_has_alias(
                    v_payload,
                    'unitAmountCents',
                    'unit_amount_cents'
                ) or sales_configurator.json_has_alias(
                    v_payload,
                    'pricingMode',
                    'pricing_mode'
                ) then v_unit_amount_cents
                else variant.unit_amount_cents
            end
        where variant.item_id = p_item_id
        returning module_item_id into v_module_item_id;
        v_item_id := p_item_id;
    end if;

    if not exists (
        select 1 from sales_configurator.catalog_modules module
        where module.item_id = v_module_item_id
    ) then
        raise exception 'validation: moduleItemId is not a module';
    end if;
    if v_status = 'published' and not exists (
        select 1 from sales_configurator.catalog_items module_item
        where module_item.id = v_module_item_id
          and module_item.kind = 'module'
          and module_item.status = 'published'
    ) then
        raise exception 'validation: a published variant requires a published module';
    end if;

    select pg_catalog.jsonb_build_object(
        'state', 'ok',
        'variant', sales_configurator.catalog_item_json(v_item_id)
            || pg_catalog.jsonb_build_object(
                'moduleItemId', variant.module_item_id,
                'providerName', variant.provider_name,
                'pricingMode', variant.pricing_mode,
                'unitAmountCents', variant.unit_amount_cents,
                'currency', variant.currency
            )
    )
    into v_result
    from sales_configurator.catalog_variants variant
    where variant.item_id = v_item_id;
    return v_result;
end;
$$;
