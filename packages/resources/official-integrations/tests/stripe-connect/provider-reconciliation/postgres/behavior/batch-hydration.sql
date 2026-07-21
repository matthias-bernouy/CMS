select provider_reconciliation_test.cleanup();

do $fixture$
declare
    v_claimed_payment_id bigint;
    v_operation_payment_id bigint;
    v_dispute_payment_id bigint;
    v_operation_id bigint;
    v_dispute_id bigint;
begin
    v_claimed_payment_id := provider_reconciliation_test.seed_payment('batch-claimed');
    v_operation_payment_id := provider_reconciliation_test.seed_payment('batch-operation');
    v_dispute_payment_id := provider_reconciliation_test.seed_payment('batch-dispute');
    v_operation_id := provider_reconciliation_test.seed_operation(
        v_operation_payment_id, 'batch-operation', 'refund_create'
    );
    insert into stripe_connect.stripe_disputes (
        payment_id, stripe_dispute_id, stripe_charge_id,
        amount, currency, reason, status, provider_snapshot
    ) values (
        v_dispute_payment_id, 'dp_provider_reconciliation_pg_batch',
        'ch_provider_reconciliation_batch', 600, 'eur',
        'fraudulent', 'needs_response', '{"provider":"snapshot"}'::jsonb
    ) returning id into v_dispute_id;

    insert into stripe_connect.stripe_dispute_evidence (
        dispute_id, evidence_operation_id, evidence,
        staged_by, staged_at, submitted_at
    ) values
        (v_dispute_id, 'provider-reconciliation-pg-evidence-old', '{}',
            'admin-old', '2026-07-21 08:00:00+00', '2026-07-21 08:30:00+00'),
        (v_dispute_id, 'provider-reconciliation-pg-evidence-submitted', '{}',
            'admin-middle', '2026-07-21 09:00:00+00', '2026-07-21 09:30:00+00'),
        (v_dispute_id, 'provider-reconciliation-pg-evidence-latest', '{}',
            'admin-latest', '2026-07-21 10:00:00+00', null);

    insert into stripe_connect.irreversible_dispute_action_approvals (
        action_key, action_type, dispute_id, amount, threshold_amount,
        payload_sha256, status, first_actor_kind, first_actor_id,
        first_approved_at, second_actor_kind, second_actor_id,
        second_approved_at, created_at
    ) values
        ('provider-reconciliation-pg-approval-old', 'dispute_evidence_submit',
            v_dispute_id, 600, 500, pg_catalog.repeat('b', 64),
            'pending_second_approval', 'admin', 'admin-old',
            '2026-07-21 08:00:00+00', null, null, null,
            '2026-07-21 08:00:00+00'),
        ('provider-reconciliation-pg-approval-complete', 'dispute_accept',
            v_dispute_id, 600, 500, pg_catalog.repeat('c', 64),
            'approved', 'admin', 'admin-first',
            '2026-07-21 09:00:00+00', 'admin', 'admin-second',
            '2026-07-21 09:01:00+00', '2026-07-21 09:00:00+00'),
        ('provider-reconciliation-pg-approval-latest', 'dispute_accept',
            v_dispute_id, 600, 500, pg_catalog.repeat('d', 64),
            'pending_second_approval', 'admin', 'admin-latest',
            '2026-07-21 10:00:00+00', null, null, null,
            '2026-07-21 10:00:00+00');

    insert into stripe_connect.commerce_projection_outbox (
        operation_id, payment_id, projection_key, projection_kind,
        provider_object_id, created_at
    ) values
        (null, v_claimed_payment_id,
            'provider-reconciliation-pg-batch-payment', 'payment',
            v_claimed_payment_id::text, '2026-07-21 08:00:00+00'),
        (v_operation_id, v_claimed_payment_id,
            'provider-reconciliation-pg-batch-operation', 'refund',
            're_provider_reconciliation_batch', '2026-07-21 09:00:00+00'),
        (null, v_claimed_payment_id,
            'provider-reconciliation-pg-batch-dispute', 'dispute',
            v_dispute_id::text, '2026-07-21 10:00:00+00');
end;
$fixture$;

create temporary table provider_reconciliation_batch_results (
    position bigint generated always as identity,
    projection jsonb not null,
    payment jsonb,
    financial_operation jsonb,
    operation_payment jsonb,
    dispute jsonb,
    dispute_client_reference_id text,
    staged_evidence jsonb,
    evidence_submission_count bigint,
    pending_approval jsonb
);
insert into provider_reconciliation_batch_results (
    projection, payment, financial_operation, operation_payment,
    dispute, dispute_client_reference_id, staged_evidence,
    evidence_submission_count, pending_approval
)
select *
from stripe_connect.claim_reconciliation_projection_batch('batch-owner', 10);

do $contract$
declare
    v_payment record;
    v_operation record;
    v_dispute record;
begin
    select * into strict v_payment from provider_reconciliation_batch_results
    where projection->>'projection_key' = 'provider-reconciliation-pg-batch-payment';
    select * into strict v_operation from provider_reconciliation_batch_results
    where projection->>'projection_key' = 'provider-reconciliation-pg-batch-operation';
    select * into strict v_dispute from provider_reconciliation_batch_results
    where projection->>'projection_key' = 'provider-reconciliation-pg-batch-dispute';

    if (select pg_catalog.array_agg(projection->>'projection_key' order by position)
        from provider_reconciliation_batch_results) <> array[
            'provider-reconciliation-pg-batch-payment',
            'provider-reconciliation-pg-batch-operation',
            'provider-reconciliation-pg-batch-dispute'
        ] or exists (
            select 1
            from provider_reconciliation_batch_results result
            join stripe_connect.commerce_projection_outbox projection
                on projection.id = (result.projection->>'id')::bigint
            join stripe_connect.payments payment on payment.id = projection.payment_id
            where result.projection is distinct from pg_catalog.to_jsonb(projection)
               or result.payment is distinct from pg_catalog.to_jsonb(payment)
               or result.projection->>'projection_status' <> 'leased'
               or result.projection->>'claim_owner' <> 'batch-owner'
               or (result.projection->>'attempt_count')::integer <> 1
               or nullif(result.projection->>'claim_token', '') is null
        ) then
        raise exception 'provider reconciliation: claimed batch envelope changed';
    end if;

    if v_payment.financial_operation is not null
       or v_payment.operation_payment is not null
       or v_payment.dispute is not null
       or v_payment.evidence_submission_count <> 0 then
        raise exception 'provider reconciliation: payment hydration changed: %',
            pg_catalog.to_jsonb(v_payment);
    end if;
    if v_operation.financial_operation is distinct from (
            select pg_catalog.to_jsonb(operation)
            from stripe_connect.financial_operations operation
            where operation.id = (v_operation.projection->>'operation_id')::bigint
        ) or (v_operation.payment->>'id') = (v_operation.operation_payment->>'id')
       or v_operation.operation_payment is distinct from (
            select pg_catalog.to_jsonb(payment)
            from stripe_connect.payments payment
            where payment.client_reference_id = 'provider-reconciliation-pg-batch-operation'
        ) then
        raise exception 'provider reconciliation: operation hydration changed: %',
            pg_catalog.to_jsonb(v_operation);
    end if;
    if v_dispute.dispute is distinct from (
            select pg_catalog.to_jsonb(dispute)
            from stripe_connect.stripe_disputes dispute
            where dispute.stripe_dispute_id = 'dp_provider_reconciliation_pg_batch'
        ) or v_dispute.dispute_client_reference_id
            <> 'provider-reconciliation-pg-batch-dispute'
       or v_dispute.staged_evidence is distinct from pg_catalog.jsonb_build_object(
            'evidence_operation_id', 'provider-reconciliation-pg-evidence-latest',
            'staged_at', '2026-07-21 10:00:00+00'::timestamptz,
            'submitted_at', null
        ) or v_dispute.evidence_submission_count <> 2
       or v_dispute.pending_approval is distinct from pg_catalog.jsonb_build_object(
            'action_type', 'dispute_accept', 'status', 'pending_second_approval',
            'first_actor_id', 'admin-latest',
            'first_approved_at', '2026-07-21 10:00:00+00'::timestamptz,
            'second_actor_id', null, 'second_approved_at', null
        ) then
        raise exception 'provider reconciliation: dispute hydration changed: %',
            pg_catalog.to_jsonb(v_dispute);
    end if;
end;
$contract$;

drop table provider_reconciliation_batch_results;
select provider_reconciliation_test.cleanup();
