

drop function if exists stripe_connect.authorize_irreversible_dispute_action(
    text, text, bigint, bigint, bigint, text, text, text
);

create or replace function stripe_connect.authorize_irreversible_dispute_action(
    p_action_key text,
    p_action_type text,
    p_dispute_id bigint,
    p_amount bigint,
    p_actor_kind text,
    p_actor_id text,
    p_payload_sha256 text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_approval stripe_connect.irreversible_dispute_action_approvals%rowtype;
    v_threshold_amount bigint;
begin
    if p_actor_kind is distinct from 'admin' or nullif(btrim(p_actor_id), '') is null then
        raise exception 'forbidden: admin approval actor is required';
    end if;
    if p_action_type not in ('dispute_evidence_submit', 'dispute_accept') then
        raise exception 'validation: unsupported irreversible dispute action';
    end if;
    select payment.dual_approval_threshold_amount into v_threshold_amount
    from stripe_connect.stripe_disputes dispute
    join stripe_connect.payments payment on payment.id = dispute.payment_id
    where dispute.id = p_dispute_id;
    if not found then
        raise exception 'not_found: payment not found';
    end if;
    if p_amount <= 0 or v_threshold_amount < 0 then
        raise exception 'validation: invalid dispute approval amount or threshold';
    end if;
    if p_amount < v_threshold_amount then
        return jsonb_build_object(
            'approved', true, 'dualApprovalRequired', false,
            'approvalStatus', 'not_required', 'firstApprovedBy', p_actor_id
        );
    end if;
    insert into stripe_connect.irreversible_dispute_action_approvals (
        action_key, action_type, dispute_id, amount, threshold_amount,
        payload_sha256, first_actor_kind, first_actor_id
    ) values (
        p_action_key, p_action_type, p_dispute_id, p_amount, v_threshold_amount,
        p_payload_sha256, p_actor_kind, p_actor_id
    ) on conflict (action_key) do nothing;
    select * into v_approval
    from stripe_connect.irreversible_dispute_action_approvals
    where action_key = p_action_key for update;
    if found then
        if v_approval.action_type is distinct from p_action_type
            or v_approval.dispute_id is distinct from p_dispute_id
            or v_approval.amount is distinct from p_amount
            or v_approval.threshold_amount is distinct from v_threshold_amount
            or v_approval.payload_sha256 is distinct from p_payload_sha256 then
            raise exception 'conflict: irreversible dispute approval replay mismatch';
        end if;
        if v_approval.status = 'approved' then
            return to_jsonb(v_approval) || jsonb_build_object(
                'approved', true, 'dualApprovalRequired', true,
                'approvalStatus', 'approved', 'firstApprovedBy', v_approval.first_actor_id,
                'secondApprovedBy', v_approval.second_actor_id
            );
        end if;
        if v_approval.first_actor_id = p_actor_id then
            return to_jsonb(v_approval) || jsonb_build_object(
                'approved', false, 'dualApprovalRequired', true,
                'approvalStatus', 'pending_second_approval', 'firstApprovedBy', v_approval.first_actor_id
            );
        end if;
        update stripe_connect.irreversible_dispute_action_approvals set
            status = 'approved', second_actor_kind = p_actor_kind,
            second_actor_id = p_actor_id, second_approved_at = now()
        where id = v_approval.id returning * into v_approval;
        return to_jsonb(v_approval) || jsonb_build_object(
            'approved', true, 'dualApprovalRequired', true,
            'approvalStatus', 'approved', 'firstApprovedBy', v_approval.first_actor_id,
            'secondApprovedBy', v_approval.second_actor_id
        );
    end if;
    raise exception 'conflict: irreversible dispute approval could not be reserved';
end;
$$;