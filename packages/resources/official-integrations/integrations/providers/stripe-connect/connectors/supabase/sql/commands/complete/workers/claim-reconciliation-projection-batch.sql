

create or replace function stripe_connect.claim_reconciliation_projection_batch(
    p_owner text,
    p_limit integer default 50
)
returns table (
    projection jsonb,
    payment jsonb,
    financial_operation jsonb,
    operation_payment jsonb,
    dispute jsonb,
    dispute_client_reference_id text,
    staged_evidence jsonb,
    evidence_submission_count bigint,
    pending_approval jsonb
)
language sql
volatile
security invoker
set search_path = ''
set jit = off
as $$
    with claimed as materialized (
        select projection.*
        from stripe_connect.claim_commerce_projection_outbox(p_owner, p_limit) projection
    )
    select
        pg_catalog.to_jsonb(claimed),
        pg_catalog.to_jsonb(payment),
        pg_catalog.to_jsonb(financial_operation),
        pg_catalog.to_jsonb(operation_payment),
        pg_catalog.to_jsonb(dispute),
        dispute_payment.client_reference_id,
        evidence_context.value,
        coalesce(evidence_context.submission_count, 0),
        pending_approval.value
    from claimed
    left join stripe_connect.payments payment
        on payment.id = claimed.payment_id
    left join stripe_connect.financial_operations financial_operation
        on financial_operation.id = claimed.operation_id
    left join stripe_connect.payments operation_payment
        on operation_payment.id = financial_operation.payment_id
    left join stripe_connect.stripe_disputes dispute
        on dispute.id = case
            when claimed.provider_object_id ~ '^[1-9][0-9]{0,17}$'
                then claimed.provider_object_id::bigint
            when claimed.provider_object_id ~ '^[1-9][0-9]{18}$'
                and claimed.provider_object_id collate "C"
                    <= '9223372036854775807' collate "C"
                then claimed.provider_object_id::bigint
            else null
        end
       and claimed.projection_kind = 'dispute'
    left join stripe_connect.payments dispute_payment
        on dispute_payment.id = dispute.payment_id
    left join lateral (
        select pg_catalog.jsonb_build_object(
            'evidence_operation_id', evidence.evidence_operation_id,
            'staged_at', evidence.staged_at,
            'submitted_at', evidence.submitted_at
        ) value,
        pg_catalog.count(*) filter (
            where evidence.submitted_at is not null
        ) over ()::bigint submission_count
        from stripe_connect.stripe_dispute_evidence evidence
        where evidence.dispute_id = dispute.id
        order by evidence.staged_at desc
        limit 1
    ) evidence_context on true
    left join lateral (
        select pg_catalog.jsonb_build_object(
            'action_type', approval.action_type,
            'status', approval.status,
            'first_actor_id', approval.first_actor_id,
            'first_approved_at', approval.first_approved_at,
            'second_actor_id', approval.second_actor_id,
            'second_approved_at', approval.second_approved_at
        ) value
        from stripe_connect.irreversible_dispute_action_approvals approval
        where approval.dispute_id = dispute.id
          and approval.status = 'pending_second_approval'
        order by approval.created_at desc
        limit 1
    ) pending_approval on true
    order by claimed.created_at, claimed.causal_sequence, claimed.id
$$;

revoke execute on function stripe_connect.claim_reconciliation_projection_batch(text, integer)
    from public, anon, authenticated;
grant execute on function stripe_connect.claim_reconciliation_projection_batch(text, integer)
    to service_role;