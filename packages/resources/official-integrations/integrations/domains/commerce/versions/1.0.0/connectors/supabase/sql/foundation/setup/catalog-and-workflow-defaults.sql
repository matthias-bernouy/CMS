

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name, verification_status, verified_at, verified_by
)
values ('merchant', null, 'default', 'Default merchant', 'verified', now(), 'system')
on conflict (slug) do nothing;

insert into commerce.offer_conditions (code, label, position)
values
    ('poor', 'Poor', 10),
    ('good', 'Good', 20),
    ('very_good', 'Very good', 30)
on conflict (code) do nothing;

insert into commerce.offer_workflow_states (code, label, phase, position, terminal)
values
    ('draft', 'Draft', 'draft', 10, false),
    ('pending_review', 'Pending review', 'admin_review', 20, false),
    ('changes_requested', 'Changes requested', 'seller_input', 30, false),
    ('awaiting_seller_price', 'Awaiting seller price', 'seller_input', 40, false),
    ('awaiting_final_approval', 'Awaiting final approval', 'admin_review', 50, false),
    ('approved', 'Approved', 'ready', 60, false),
    ('rejected', 'Rejected', 'terminal', 70, true),
    ('archived', 'Archived', 'terminal', 80, true)
on conflict (code) do nothing;

insert into commerce.offer_workflow_transitions (from_state, action, actor_kind, to_state)
values
    ('draft', 'submit', 'seller', 'pending_review'),
    ('changes_requested', 'submit', 'seller', 'pending_review'),
    ('pending_review', 'request_changes', 'admin', 'changes_requested'),
    ('pending_review', 'request_price', 'admin', 'awaiting_seller_price'),
    ('pending_review', 'approve', 'admin', 'approved'),
    ('awaiting_seller_price', 'submit_price', 'seller', 'awaiting_final_approval'),
    ('awaiting_final_approval', 'approve', 'admin', 'approved'),
    ('pending_review', 'reject', 'admin', 'rejected'),
    ('awaiting_final_approval', 'reject', 'admin', 'rejected')
on conflict (from_state, action, actor_kind) do nothing;