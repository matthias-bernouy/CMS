

create or replace function commerce.review_refund_request(
    p_refund_request_id bigint,
    p_decision text,
    p_actor_id text,
    p_reason text,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_request commerce.refund_requests%rowtype;
begin
    if p_decision not in ('approved', 'rejected', 'cancelled') then
        raise exception 'validation: unsupported refund decision';
    end if;
    select * into v_request from commerce.refund_requests
    where id = p_refund_request_id for update;
    if not found then raise exception 'not_found: refund request'; end if;
    if v_request.version is distinct from p_expected_version then raise exception 'conflict: stale refund request version'; end if;
    if v_request.status <> 'requested' then raise exception 'conflict: refund request is no longer reviewable'; end if;
    if p_actor_id is null or length(btrim(p_actor_id)) = 0 then
        raise exception 'forbidden: admin actor is required';
    end if;
    if p_decision = 'approved' and v_request.dual_approval_required
        and v_request.first_approved_by is null then
        update commerce.refund_requests set
            first_approved_by = p_actor_id,
            first_approved_at = now(),
            decision_reason = p_reason
        where id = v_request.id returning * into v_request;
    else
        if p_decision = 'approved' and v_request.dual_approval_required
            and v_request.first_approved_by = p_actor_id then
            raise exception 'forbidden: dual approval requires a second admin actor';
        end if;
        update commerce.refund_requests set
            status = p_decision,
            approved_by = case when p_decision = 'approved' then p_actor_id else approved_by end,
            second_approved_by = case
                when p_decision = 'approved' and dual_approval_required then p_actor_id
                else second_approved_by end,
            second_approved_at = case
                when p_decision = 'approved' and dual_approval_required then now()
                else second_approved_at end,
            rejected_by = case when p_decision = 'rejected' then p_actor_id else rejected_by end,
            decision_reason = p_reason
        where id = v_request.id returning * into v_request;
    end if;
    if p_decision in ('rejected', 'cancelled') and not exists (
        select 1 from commerce.refund_requests
        where order_id = v_request.order_id and id <> v_request.id
          and status not in ('rejected', 'cancelled', 'failed')
    ) then
        update commerce.order_settlements set status = 'blocked', manual_review_reason = 'refund_request_' || p_decision
        where order_id = v_request.order_id and status = 'refund_pending';
    end if;
    perform commerce.append_financial_event(
        v_request.order_id, 'refund_request', v_request.id::text,
        case when p_decision = 'approved' and v_request.status = 'requested'
            then 'refund_first_approved' else 'refund_' || p_decision end,
        'admin', p_actor_id, p_reason, '{}'::jsonb,
        'commerce.refund.reviewed', 'refund:' || v_request.id || ':' || p_decision || ':' || p_expected_version
    );
    return to_jsonb(v_request) || jsonb_build_object(
        'refundAuthorization', commerce.refund_authorization_payload(v_request.id)
    );
end;
$$;