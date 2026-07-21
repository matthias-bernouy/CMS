select provider_reconciliation_test.cleanup();

do $retry_and_lease$
declare
    v_payment_id bigint;
    v_old_token uuid := '11111111-1111-1111-1111-111111111111'::uuid;
    v_due stripe_connect.commerce_projection_outbox%rowtype;
    v_expired stripe_connect.commerce_projection_outbox%rowtype;
begin
    v_payment_id := provider_reconciliation_test.seed_payment('retry');
    insert into stripe_connect.commerce_projection_outbox (
        payment_id, projection_key, projection_kind, provider_object_id,
        projection_status, attempt_count, next_attempt_at,
        claim_owner, claim_token, claimed_at, created_at, last_error
    ) values
        (v_payment_id, 'provider-reconciliation-pg-retry-due', 'payment', v_payment_id::text,
            'retry', 2, now() - interval '1 minute',
            null, null, null, '2026-07-21 08:00:00+00', 'retry error'),
        (v_payment_id, 'provider-reconciliation-pg-retry-future', 'payment', v_payment_id::text,
            'retry', 2, now() + interval '1 hour',
            null, null, null, '2026-07-21 08:01:00+00', 'future error'),
        (v_payment_id, 'provider-reconciliation-pg-lease-expired', 'payment', v_payment_id::text,
            'leased', 1, null,
            'old-owner', v_old_token, now() - interval '6 minutes',
            '2026-07-21 08:02:00+00', 'lease error'),
        (v_payment_id, 'provider-reconciliation-pg-lease-fresh', 'payment', v_payment_id::text,
            'leased', 1, null,
            'fresh-owner', '22222222-2222-2222-2222-222222222222', now(),
            '2026-07-21 08:03:00+00', 'fresh error');

    select * into v_due
    from stripe_connect.claim_commerce_projection_outbox('retry-owner', 10)
    where projection_key = 'provider-reconciliation-pg-retry-due';
    select * into v_expired
    from stripe_connect.commerce_projection_outbox
    where projection_key = 'provider-reconciliation-pg-lease-expired';

    if v_due.id is null
       or v_due.attempt_count <> 3
       or v_due.claim_owner <> 'retry-owner'
       or v_due.claim_token is null
       or v_due.last_error is not null
       or v_expired.projection_status <> 'leased'
       or v_expired.attempt_count <> 2
       or v_expired.claim_owner <> 'retry-owner'
       or v_expired.claim_token is null
       or v_expired.claim_token = v_old_token
       or v_expired.last_error is not null then
        raise exception 'provider reconciliation: retry or expired lease changed: %, %',
            pg_catalog.to_jsonb(v_due), pg_catalog.to_jsonb(v_expired);
    end if;
    if exists (
        select 1 from stripe_connect.commerce_projection_outbox
        where projection_key = 'provider-reconciliation-pg-retry-future'
          and (projection_status <> 'retry' or attempt_count <> 2 or last_error <> 'future error')
    ) or exists (
        select 1 from stripe_connect.commerce_projection_outbox
        where projection_key = 'provider-reconciliation-pg-lease-fresh'
          and (projection_status <> 'leased' or attempt_count <> 1
               or claim_owner <> 'fresh-owner' or last_error <> 'fresh error')
    ) then
        raise exception 'provider reconciliation: ineligible lease was claimed';
    end if;
end;
$retry_and_lease$;

select provider_reconciliation_test.cleanup();
