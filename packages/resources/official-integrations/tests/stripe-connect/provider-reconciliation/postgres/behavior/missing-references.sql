select provider_reconciliation_test.cleanup();

do $missing_references$
declare
    v_payment_id bigint;
    v_claimed stripe_connect.commerce_projection_outbox[];
begin
    v_payment_id := provider_reconciliation_test.seed_payment('missing');
    insert into stripe_connect.commerce_projection_outbox (
        payment_id, projection_key, projection_kind,
        provider_object_id, created_at
    ) values
        (v_payment_id, 'provider-reconciliation-pg-missing-dispute-a',
            'dispute', '-900000001', '2026-07-21 08:00:00+00'),
        (v_payment_id, 'provider-reconciliation-pg-missing-dispute-b',
            'dispute', '-900000002', '2026-07-21 08:01:00+00');

    if exists (
        select 1 from stripe_connect.stripe_disputes
        where id in (-900000001, -900000002)
    ) then
        raise exception 'provider reconciliation: missing-reference fixture collided';
    end if;

    select pg_catalog.array_agg(claimed order by claimed.created_at)
    into v_claimed
    from stripe_connect.claim_commerce_projection_outbox('missing-reference-owner', 10) claimed;
    if pg_catalog.cardinality(v_claimed) <> 2
       or v_claimed[1].provider_object_id <> '-900000001'
       or v_claimed[2].provider_object_id <> '-900000002'
       or v_claimed[1].projection_status <> 'leased'
       or v_claimed[2].projection_status <> 'leased' then
        raise exception 'provider reconciliation: missing references stopped being claimable: %',
            pg_catalog.to_jsonb(v_claimed);
    end if;
end;
$missing_references$;

select provider_reconciliation_test.cleanup();
