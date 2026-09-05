
create index if not exists dispute_action_approvals_dispute_idx
    on stripe_connect.irreversible_dispute_action_approvals(dispute_id);
create index if not exists dispute_action_approvals_pending_idx
    on stripe_connect.irreversible_dispute_action_approvals(dispute_id, created_at desc)
    where status = 'pending_second_approval';
