

create or replace function stripe_connect.read_dashboard_disputes(
    p_actor_id text,
    p_actor_kind text,
    p_limit integer,
    p_search text,
    p_status text,
    p_dispute_id text
)
returns table(
    dispute jsonb,
    client_reference_id text,
    staged_evidence jsonb,
    evidence_submission_count integer,
    pending_approval jsonb
)
language plpgsql
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
    if p_actor_kind is distinct from 'admin' or nullif(btrim(p_actor_id), '') is null then
        raise exception 'forbidden: the CMS admin role is required';
    end if;
    if p_limit is null or p_limit < 1 or p_limit > 200 then
        raise exception 'validation: limit must be between 1 and 200';
    end if;
    return query
    with page as materialized (
        select dispute_row.*
        from stripe_connect.stripe_disputes as dispute_row
        where (p_dispute_id is null or dispute_row.stripe_dispute_id = p_dispute_id)
          and (p_dispute_id is not null or p_status is null or dispute_row.status = p_status)
          and (p_dispute_id is not null or p_search is null
            or dispute_row.stripe_dispute_id ilike replace(p_search, '*', '%')
            or dispute_row.stripe_charge_id ilike replace(p_search, '*', '%')
            or dispute_row.reason ilike replace(p_search, '*', '%'))
        order by dispute_row.created_at desc
        limit p_limit
    ), evidence_ranked as (
        select evidence.*,
            count(*) filter (where evidence.submitted_at is not null)
                over (partition by evidence.dispute_id) as submission_count,
            row_number() over (
                partition by evidence.dispute_id order by evidence.staged_at desc
            ) as evidence_rank
        from stripe_connect.stripe_dispute_evidence as evidence
        join page on page.id = evidence.dispute_id
    ), approval_ranked as (
        select approval.*,
            row_number() over (
                partition by approval.dispute_id order by approval.created_at desc
            ) as approval_rank
        from stripe_connect.irreversible_dispute_action_approvals as approval
        join page on page.id = approval.dispute_id
        where approval.status = 'pending_second_approval'
    )
    select to_jsonb(dispute_row), payment.client_reference_id,
        case when evidence.id is null then null else jsonb_build_object(
            'evidence_operation_id', evidence.evidence_operation_id,
            'staged_at', evidence.staged_at,
            'submitted_at', evidence.submitted_at
        ) end,
        coalesce(evidence.submission_count, 0)::integer,
        case when approval.id is null then null else jsonb_build_object(
            'action_type', approval.action_type,
            'status', approval.status,
            'first_actor_id', approval.first_actor_id,
            'first_approved_at', approval.first_approved_at,
            'second_actor_id', approval.second_actor_id,
            'second_approved_at', approval.second_approved_at
        ) end
    from page as dispute_row
    join stripe_connect.payments as payment on payment.id = dispute_row.payment_id
    left join evidence_ranked as evidence
        on evidence.dispute_id = dispute_row.id and evidence.evidence_rank = 1
    left join approval_ranked as approval
        on approval.dispute_id = dispute_row.id and approval.approval_rank = 1
    order by dispute_row.created_at desc;
end;
$$;
