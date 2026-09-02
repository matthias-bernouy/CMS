create or replace function sales_configurator.upsert_catalog_feature(
    p_item_id bigint,
    p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payload jsonb := sales_configurator.require_json_object(p_payload, 'payload');
    v_item_id bigint;
    v_kind text;
begin
    if p_item_id is null then
        insert into sales_configurator.catalog_items (
            kind, code, name, description, status, sort_order
        )
        values (
            'feature',
            pg_catalog.lower(
                sales_configurator.require_bounded_text(v_payload ->> 'code', 'code', 120)
            ),
            sales_configurator.require_bounded_text(v_payload ->> 'name', 'name', 200),
            sales_configurator.optional_bounded_text(
                v_payload ->> 'description',
                'description',
                10000
            ),
            coalesce(nullif(v_payload ->> 'status', ''), 'draft'),
            coalesce((
                sales_configurator.json_alias_text(v_payload, 'sortOrder', 'sort_order')
            )::integer, 0)
        )
        returning id into v_item_id;
        insert into sales_configurator.catalog_features (item_id) values (v_item_id);
    else
        select item.kind
        into v_kind
        from sales_configurator.catalog_items item
        where item.id = p_item_id
        for update;
        if not found then
            return pg_catalog.jsonb_build_object('state', 'not_found');
        end if;
        if v_kind <> 'feature' then
            raise exception 'validation: catalog item is not a feature';
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
        where item.id = p_item_id;
        v_item_id := p_item_id;
    end if;

    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'feature', sales_configurator.catalog_item_json(v_item_id)
    );
end;
$$;
