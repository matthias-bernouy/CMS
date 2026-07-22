begin;

do $behavior$
declare
    v_dispute_id bigint;
    v_result jsonb;
begin
    v_dispute_id := dispute_approval_test.seed('below-threshold', 2000);
    v_result := dispute_approval_test.attempt(
        'dispute-approval-pg-below-threshold', v_dispute_id, 'admin-first'
    );
    if v_result <> pg_catalog.jsonb_build_object(
        'approved', true,
        'dualApprovalRequired', false,
        'approvalStatus', 'not_required',
        'firstApprovedBy', 'admin-first'
    ) or exists (
        select 1 from stripe_connect.irreversible_dispute_action_approvals
        where dispute_id = v_dispute_id
    ) then
        raise exception 'dispute approval: below-threshold contract changed: %', v_result;
    end if;

    v_dispute_id := dispute_approval_test.seed('dual', 1000);
    v_result := dispute_approval_test.attempt(
        'dispute-approval-pg-dual', v_dispute_id, 'admin-first'
    );
    if v_result->>'approved' <> 'false'
       or v_result->>'dualApprovalRequired' <> 'true'
       or v_result->>'approvalStatus' <> 'pending_second_approval'
       or v_result->>'firstApprovedBy' <> 'admin-first' then
        raise exception 'dispute approval: first approval changed: %', v_result;
    end if;
    v_result := dispute_approval_test.attempt(
        'dispute-approval-pg-dual', v_dispute_id, 'admin-first'
    );
    if v_result->>'approved' <> 'false'
       or (select pg_catalog.count(*)
           from stripe_connect.irreversible_dispute_action_approvals
           where dispute_id = v_dispute_id) <> 1 then
        raise exception 'dispute approval: first-actor replay changed: %', v_result;
    end if;
    v_result := dispute_approval_test.attempt(
        'dispute-approval-pg-dual', v_dispute_id, 'admin-second'
    );
    if v_result->>'approved' <> 'true'
       or v_result->>'approvalStatus' <> 'approved'
       or v_result->>'firstApprovedBy' <> 'admin-first'
       or v_result->>'secondApprovedBy' <> 'admin-second' then
        raise exception 'dispute approval: second approval changed: %', v_result;
    end if;

    begin
        perform dispute_approval_test.attempt(
            'dispute-approval-pg-dual', v_dispute_id,
            'admin-third', pg_catalog.repeat('c', 64)
        );
        raise exception 'dispute approval: mismatched replay was accepted';
    exception when others then
        if sqlerrm = 'dispute approval: mismatched replay was accepted'
           or sqlerrm <> 'conflict: irreversible dispute approval replay mismatch' then
            raise;
        end if;
    end;

    begin
        perform stripe_connect.authorize_irreversible_dispute_action(
            'dispute-approval-pg-forbidden', 'dispute_accept',
            v_dispute_id, 1200, 1000, 'finance', 'finance-1',
            pg_catalog.repeat('d', 64)
        );
        raise exception 'dispute approval: non-admin actor was accepted';
    exception when others then
        if sqlerrm = 'dispute approval: non-admin actor was accepted'
           or sqlerrm <> 'forbidden: admin approval actor is required' then
            raise;
        end if;
    end;
end;
$behavior$;

rollback;
