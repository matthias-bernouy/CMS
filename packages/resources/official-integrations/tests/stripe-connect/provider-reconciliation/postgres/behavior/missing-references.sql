select provider_reconciliation_test.cleanup();

do $missing_references$
declare
    v_payment_id bigint;
    v_claimed stripe_connect.commerce_projection_outbox[];
    v_batch jsonb;
begin
    v_payment_id := provider_reconciliation_test.seed_payment('missing');
    insert into stripe_connect.commerce_projection_outbox (
        payment_id, projection_key, projection_kind,
        provider_object_id, created_at
    ) values
        (v_payment_id, 'provider-reconciliation-pg-missing-dispute-a',
            'dispute', '-900000001', '2026-07-21 08:00:00+00'),
        (v_payment_id, 'provider-reconciliation-pg-missing-dispute-b',
            'dispute', '-900000002', '2026-07-21 08:01:00+00'),
        (v_payment_id, 'provider-reconciliation-pg-missing-dispute-text',
            'dispute', 'not-a-dispute-id', '2026-07-21 08:02:00+00'),
        (v_payment_id, 'provider-reconciliation-pg-missing-dispute-overflow',
            'dispute', '9223372036854775808', '2026-07-21 08:03:00+00');

    if exists (
        select 1 from stripe_connect.stripe_disputes
        where id in (-900000001, -900000002)
    ) then
        raise exception 'provider reconciliation: missing-reference fixture collided';
    end if;

    select pg_catalog.array_agg(claimed order by claimed.created_at)
    into v_claimed
    from stripe_connect.claim_commerce_projection_outbox('missing-reference-owner', 10) claimed;
    if pg_catalog.cardinality(v_claimed) <> 4
       or v_claimed[1].provider_object_id <> '-900000001'
       or v_claimed[2].provider_object_id <> '-900000002'
       or v_claimed[3].provider_object_id <> 'not-a-dispute-id'
       or v_claimed[4].provider_object_id <> '9223372036854775808'
       or v_claimed[1].projection_status <> 'leased'
       or v_claimed[4].projection_status <> 'leased' then
        raise exception 'provider reconciliation: missing references stopped being claimable: %',
            pg_catalog.to_jsonb(v_claimed);
    end if;

    update stripe_connect.commerce_projection_outbox
    set claimed_at = now() - interval '6 minutes'
    where projection_key like 'provider-reconciliation-pg-missing-dispute-%';
    select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(batch)
        order by batch.projection->>'provider_object_id'
    ) into v_batch
    from stripe_connect.claim_reconciliation_projection_batch(
        'missing-reference-batch-owner', 10
    ) batch;
    if pg_catalog.jsonb_array_length(v_batch) <> 4
       or exists (
            select 1
            from pg_catalog.jsonb_array_elements(v_batch) row_value
            where row_value->'dispute' is distinct from 'null'::jsonb
               or row_value->'payment' = 'null'::jsonb
               or row_value->'projection'->>'projection_status' <> 'leased'
               or row_value->'projection'->>'claim_owner'
                    <> 'missing-reference-batch-owner'
               or (row_value->'projection'->>'attempt_count')::integer <> 2
        ) then
        raise exception 'provider reconciliation: missing batch reference changed: %',
            v_batch;
    end if;
end;
$missing_references$;

select provider_reconciliation_test.cleanup();
