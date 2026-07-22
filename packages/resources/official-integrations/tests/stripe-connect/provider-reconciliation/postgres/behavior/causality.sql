select provider_reconciliation_test.cleanup();

do $causality$
declare
    v_payment_id bigint;
    v_reversal_operation_id bigint;
    v_refund_operation_id bigint;
    v_first text[];
    v_second text[];
begin
    v_payment_id := provider_reconciliation_test.seed_payment('causality');
    v_reversal_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'causality-reversal', 'transfer_reversal_create'
    );
    v_refund_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'causality-refund', 'refund_create'
    );
    insert into stripe_connect.commerce_projection_outbox (
        operation_id, payment_id, projection_key, projection_kind,
        recovery_key, causal_sequence, created_at
    ) values
        (v_refund_operation_id, v_payment_id,
            'provider-reconciliation-pg-causality-refund', 'refund',
            'provider-reconciliation-pg-recovery', 1, '2026-07-21 08:00:00+00'),
        (v_reversal_operation_id, v_payment_id,
            'provider-reconciliation-pg-causality-reversal', 'reversal',
            'provider-reconciliation-pg-recovery', 0, '2026-07-21 08:01:00+00');

    select pg_catalog.array_agg(projection_key)
    into v_first
    from stripe_connect.claim_commerce_projection_outbox('causality-first', 10);
    if v_first <> array['provider-reconciliation-pg-causality-reversal'] then
        raise exception 'provider reconciliation: refund bypassed reversal: %', v_first;
    end if;

    update stripe_connect.commerce_projection_outbox
    set projection_status = 'succeeded', claim_owner = null,
        claim_token = null, claimed_at = null, projected_at = now()
    where projection_key = 'provider-reconciliation-pg-causality-reversal';

    select pg_catalog.array_agg(projection_key)
    into v_second
    from stripe_connect.claim_commerce_projection_outbox('causality-second', 10);
    if v_second <> array['provider-reconciliation-pg-causality-refund'] then
        raise exception 'provider reconciliation: refund did not follow reversal: %', v_second;
    end if;
end;
$causality$;

select provider_reconciliation_test.cleanup();

do $refund_predecessor$
declare
    v_payment_id bigint;
    v_operation_id bigint;
    v_predecessor stripe_connect.commerce_projection_outbox%rowtype;
    v_successor stripe_connect.commerce_projection_outbox%rowtype;
    v_stored stripe_connect.commerce_projection_outbox%rowtype;
begin
    v_payment_id := provider_reconciliation_test.seed_payment('refund-predecessor');
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_payment_id, 'refund-predecessor', 'refund_create'
    );
    insert into stripe_connect.commerce_projection_outbox (
        operation_id, payment_id, projection_key, projection_kind,
        causal_sequence, created_at
    ) values
        (v_operation_id, v_payment_id,
            'provider-reconciliation-pg-refund-successor', 'refund',
            1, '2026-07-21 08:00:00+00'),
        (v_operation_id, v_payment_id,
            'provider-reconciliation-pg-refund-predecessor', 'refund',
            0, '2026-07-21 08:01:00+00');

    select * into strict v_predecessor
    from stripe_connect.claim_commerce_projection_outbox('refund-predecessor-first', 1);
    select * into strict v_stored
    from stripe_connect.commerce_projection_outbox
    where id = v_predecessor.id;
    if v_predecessor.projection_key
            <> 'provider-reconciliation-pg-refund-predecessor'
       or v_predecessor.operation_id <> v_operation_id
       or v_predecessor.causal_sequence <> 0
       or v_predecessor.projection_status <> 'leased'
       or v_predecessor.claim_owner <> 'refund-predecessor-first'
       or v_predecessor.claim_token is null
       or v_predecessor.claimed_at is null
       or v_predecessor.attempt_count <> 1
       or pg_catalog.to_jsonb(v_predecessor)
            is distinct from pg_catalog.to_jsonb(v_stored) then
        raise exception 'provider reconciliation: refund predecessor claim changed: %',
            pg_catalog.to_jsonb(v_predecessor);
    end if;
    if exists (
        select 1
        from stripe_connect.commerce_projection_outbox
        where projection_key = 'provider-reconciliation-pg-refund-successor'
          and (projection_status <> 'pending' or attempt_count <> 0
               or claim_owner is not null or claim_token is not null
               or claimed_at is not null)
    ) then
        raise exception 'provider reconciliation: refund successor bypassed predecessor';
    end if;

    update stripe_connect.commerce_projection_outbox
    set projection_status = 'succeeded', claim_owner = null,
        claim_token = null, claimed_at = null, projected_at = now()
    where id = v_predecessor.id;

    select * into strict v_successor
    from stripe_connect.claim_commerce_projection_outbox('refund-predecessor-second', 1);
    select * into strict v_stored
    from stripe_connect.commerce_projection_outbox
    where id = v_successor.id;
    if v_successor.projection_key <> 'provider-reconciliation-pg-refund-successor'
       or v_successor.operation_id <> v_operation_id
       or v_successor.causal_sequence <> 1
       or v_successor.projection_status <> 'leased'
       or v_successor.claim_owner <> 'refund-predecessor-second'
       or v_successor.claim_token is null
       or v_successor.claimed_at is null
       or v_successor.attempt_count <> 1
       or pg_catalog.to_jsonb(v_successor)
            is distinct from pg_catalog.to_jsonb(v_stored) then
        raise exception 'provider reconciliation: refund successor claim changed: %',
            pg_catalog.to_jsonb(v_successor);
    end if;
end;
$refund_predecessor$;

select provider_reconciliation_test.cleanup();
