create or replace function sales_configurator.rebuild_draft_snapshot(
    p_proposal_version_id bigint,
    p_selections jsonb,
    p_custom_items jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_custom jsonb;
    v_sort_order integer := pg_catalog.jsonb_array_length(p_selections);
    v_fixed_total_cents bigint;
    v_quote_item_count integer;
begin
    delete from sales_configurator.proposal_items item
    where item.proposal_version_id = p_proposal_version_id;

    perform sales_configurator.insert_draft_catalog_snapshot(
        p_proposal_version_id,
        p_selections
    );

    for v_custom in
        select custom.value
        from pg_catalog.jsonb_array_elements(p_custom_items)
            with ordinality custom(value, ordinal)
        order by custom.ordinal
    loop
        insert into sales_configurator.proposal_items (
            proposal_version_id,
            kind,
            origin,
            label,
            description,
            quantity,
            pricing_mode,
            currency,
            sort_order
        )
        values (
            p_proposal_version_id,
            'custom',
            'custom',
            sales_configurator.require_bounded_text(
                v_custom ->> 'label',
                'customItem.label',
                300
            ),
            sales_configurator.optional_bounded_text(
                v_custom ->> 'description',
                'customItem.description',
                10000
            ),
            coalesce((v_custom ->> 'quantity')::integer, 1),
            'quote',
            'EUR',
            v_sort_order
        );
        v_sort_order := v_sort_order + 1;
    end loop;

    select
        coalesce(
            pg_catalog.sum(item.quantity::bigint * item.unit_amount_cents)
                filter (where item.pricing_mode = 'fixed'),
            0
        ),
        pg_catalog.count(*) filter (where item.pricing_mode = 'quote')
    into v_fixed_total_cents, v_quote_item_count
    from sales_configurator.proposal_items item
    where item.proposal_version_id = p_proposal_version_id;

    return pg_catalog.jsonb_build_object(
        'fixedTotalCents', v_fixed_total_cents,
        'quoteItemCount', v_quote_item_count
    );
end;
$$;
