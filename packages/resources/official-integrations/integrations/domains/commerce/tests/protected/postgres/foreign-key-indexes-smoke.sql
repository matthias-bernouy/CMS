\set ON_ERROR_STOP on

begin;

do $$
declare
    v_missing text;
begin
    with expected(schema_name, table_name, column_names) as (
        values
            ('commerce', 'category_custom_fields', array['entity_type', 'field_key']::text[]),
            ('commerce', 'financial_exceptions', array['order_id']::text[]),
            ('commerce', 'financial_operation_dispatch_claims', array['order_id']::text[]),
            ('commerce', 'offers', array['condition_code']::text[]),
            ('commerce', 'offers', array['workflow_state']::text[]),
            ('commerce', 'order_financial_terms', array['subsidy_override_id']::text[]),
            ('commerce', 'order_lines', array['offer_id', 'accepted_proposal_id']::text[]),
            ('commerce', 'order_lines', array['seller_id', 'offer_id']::text[]),
            ('commerce', 'order_lines', array['product_id', 'variant_id']::text[]),
            ('commerce', 'outbox_events', array['order_id']::text[]),
            ('commerce', 'payment_cancellation_requests', array['order_cancellation_request_id']::text[]),
            ('commerce', 'platform_payout_liability_revisions', array['included_prospective_order_id']::text[]),
            ('commerce', 'product_variant_selections', array['product_id', 'axis_id']::text[]),
            ('commerce', 'product_variant_selections', array['product_id', 'axis_id', 'value_id']::text[]),
            ('commerce', 'seller_financial_exposures', array['order_id']::text[]),
            ('commerce', 'settings', array['active_c2c_fee_policy_id']::text[]),
            ('commerce', 'settings', array['active_c2c_protection_policy_id']::text[]),
            ('commerce', 'settings', array['active_c2c_seller_risk_policy_id']::text[]),
            ('commerce', 'shipment_cancellation_operations', array['order_id']::text[]),
            ('delivery', 'label_access_tokens', array['shipment_id']::text[]),
            ('delivery', 'shipment_recovery_events', array['shipment_id']::text[]),
            ('delivery', 'shipments', array['delivery_quote_id']::text[]),
            ('stripe_connect', 'commerce_projection_outbox', array['payment_id']::text[]),
            ('stripe_connect', 'financial_operations', array['payment_id']::text[]),
            ('stripe_connect', 'irreversible_dispute_action_approvals', array['dispute_id']::text[]),
            ('stripe_connect', 'payment_events', array['payment_id']::text[]),
            ('stripe_connect', 'payout_events', array['cms_user_id']::text[]),
            ('stripe_connect', 'provider_exceptions', array['operation_id']::text[]),
            ('stripe_connect', 'provider_exceptions', array['payment_id']::text[]),
            ('stripe_connect', 'refunds', array['payment_id']::text[]),
            ('stripe_connect', 'seller_recovery_exposures', array['payment_id']::text[]),
            ('stripe_connect', 'stripe_dispute_evidence', array['dispute_id']::text[]),
            ('stripe_connect', 'stripe_dispute_evidence', array['submitted_operation_id']::text[]),
            ('stripe_connect', 'transfer_reversals', array['payment_id']::text[]),
            ('stripe_connect', 'transfer_reversals', array['transfer_id']::text[]),
            ('stripe_connect', 'transfers', array['payment_id']::text[])
    ), target_foreign_keys as (
        select
            expected.*,
            foreign_key.constraint_oid,
            foreign_key.table_oid
        from expected
        left join lateral (
            select
                constraint_row.oid as constraint_oid,
                constraint_row.conrelid as table_oid
            from pg_catalog.pg_constraint constraint_row
            join pg_catalog.pg_class table_row
              on table_row.oid = constraint_row.conrelid
            join pg_catalog.pg_namespace schema_row
              on schema_row.oid = table_row.relnamespace
            where constraint_row.contype = 'f'
              and schema_row.nspname = expected.schema_name
              and table_row.relname = expected.table_name
              and array(
                  select attribute.attname::text
                  from unnest(constraint_row.conkey) with ordinality key(attnum, position)
                  join pg_catalog.pg_attribute attribute
                    on attribute.attrelid = constraint_row.conrelid
                   and attribute.attnum = key.attnum
                  order by key.position
              ) = expected.column_names
            limit 1
        ) foreign_key on true
    )
    select string_agg(
        pg_catalog.format(
            '%I.%I(%s)',
            target.schema_name,
            target.table_name,
            array_to_string(target.column_names, ', ')
        ),
        ', ' order by target.schema_name, target.table_name, target.column_names
    )
    into v_missing
    from target_foreign_keys target
    where target.constraint_oid is null
       or not exists (
            select 1
            from pg_catalog.pg_index index_row
            where index_row.indrelid = target.table_oid
              and index_row.indisvalid
              and index_row.indisready
              and index_row.indpred is null
              and index_row.indexprs is null
              and index_row.indnkeyatts >= cardinality(target.column_names)
              and array(
                  select attribute.attname::text
                  from unnest(index_row.indkey) with ordinality key(attnum, position)
                  join pg_catalog.pg_attribute attribute
                    on attribute.attrelid = index_row.indrelid
                   and attribute.attnum = key.attnum
                  where key.position <= cardinality(target.column_names)
                  order by key.position
              ) = target.column_names
       );

    if v_missing is not null then
        raise exception 'missing foreign-key indexes: %', v_missing;
    end if;
end;
$$;

rollback;
