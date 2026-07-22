\set ON_ERROR_STOP on

begin;

do $security$
declare
    v_function regprocedure := pg_catalog.to_regprocedure(
        'stripe_connect.read_dashboard_disputes(text,text,integer,text,text,text)'
    );
begin
    if v_function is null or exists (
        select 1
        from pg_catalog.pg_proc procedure
        where procedure.oid = v_function
          and (
              procedure.prosecdef
              or not procedure.proretset
              or procedure.proacl is null
              or not coalesce(procedure.proconfig @> array['search_path=""'], false)
              or exists (
                  select 1
                  from pg_catalog.aclexplode(procedure.proacl) privilege
                  where privilege.privilege_type = 'EXECUTE'
                    and privilege.grantee <> procedure.proowner
                    and privilege.grantee <> (
                        select role.oid from pg_catalog.pg_roles role
                        where role.rolname = 'service_role'
                    )
              )
          )
    ) then
        raise exception 'stripe dashboard: dispute RPC security changed';
    end if;
    if pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE') then
        raise exception 'stripe dashboard: dispute RPC grants changed';
    end if;
end;
$security$;

do $validation$
begin
    begin
        perform * from stripe_connect.read_dashboard_disputes(
            'member-1', 'user', 10, null, null, null
        );
        raise exception 'stripe dashboard: non-admin actor was accepted';
    exception when others then
        if sqlerrm <> 'forbidden: the CMS admin role is required' then
            raise;
        end if;
    end;
    begin
        perform * from stripe_connect.read_dashboard_disputes(
            'admin-1', 'admin', 201, null, null, null
        );
        raise exception 'stripe dashboard: invalid limit was accepted';
    exception when others then
        if sqlerrm <> 'validation: limit must be between 1 and 200' then
            raise;
        end if;
    end;
end;
$validation$;

insert into stripe_connect.accounts (cms_user_id, stripe_account_id)
values ('dashboard-read-seller', 'acct_dashboard_read_seller');

insert into stripe_connect.payments (
    client_reference_id, financial_terms_hash, dual_approval_threshold_amount,
    buyer_cms_user_id, seller_cms_user_id, seller_stripe_account_id,
    transfer_group, amount_total, seller_transfer_amount,
    platform_retained_amount, created_at, updated_at
)
select fixture.reference, pg_catalog.repeat('a', 64), 500,
    'dashboard-read-buyer', 'dashboard-read-seller', 'acct_dashboard_read_seller',
    fixture.transfer_group, 1200, 1080, 120, fixture.created_at, fixture.created_at
from (values
    ('dashboard-read-new', 'dashboard-read-group-new', '2026-07-22 10:00:00+00'::timestamptz),
    ('dashboard-read-null', 'dashboard-read-group-null', '2026-07-22 09:00:00+00'::timestamptz),
    ('dashboard-read-outside', 'dashboard-read-group-outside', '2026-07-22 08:00:00+00'::timestamptz)
) fixture(reference, transfer_group, created_at);

insert into stripe_connect.stripe_disputes (
    payment_id, stripe_dispute_id, stripe_charge_id, amount, currency,
    reason, status, provider_snapshot, created_at, updated_at
)
select payment.id, fixture.dispute_id, fixture.charge_id, 1200, 'eur',
    fixture.reason, fixture.status, pg_catalog.jsonb_build_object('id', fixture.dispute_id),
    fixture.created_at, fixture.created_at
from (values
    ('dashboard-read-new', 'dp_dashboard_read_new', 'ch_dashboard_read_new',
        'fraudulent', 'needs_response', '2026-07-22 10:00:00+00'::timestamptz),
    ('dashboard-read-null', 'dp_dashboard_read_null', 'ch_dashboard_read_null',
        'product_not_received', 'under_review', '2026-07-22 09:00:00+00'::timestamptz),
    ('dashboard-read-outside', 'dp_dashboard_read_outside', 'ch_dashboard_read_outside',
        null, 'won', '2026-07-22 08:00:00+00'::timestamptz)
) fixture(reference, dispute_id, charge_id, reason, status, created_at)
join stripe_connect.payments payment on payment.client_reference_id = fixture.reference;

insert into stripe_connect.stripe_dispute_evidence (
    dispute_id, evidence_operation_id, evidence, staged_by, staged_at, submitted_at
)
select dispute.id, fixture.operation_id, '{}'::jsonb, fixture.actor_id,
    fixture.staged_at, fixture.submitted_at
from (values
    ('dashboard-evidence-old', 'admin-old',
        '2026-07-22 10:01:00+00'::timestamptz, '2026-07-22 10:02:00+00'::timestamptz),
    ('dashboard-evidence-submitted', 'admin-middle',
        '2026-07-22 10:03:00+00'::timestamptz, '2026-07-22 10:04:00+00'::timestamptz),
    ('dashboard-evidence-latest', 'admin-latest',
        '2026-07-22 10:05:00+00'::timestamptz, null)
) fixture(operation_id, actor_id, staged_at, submitted_at)
join stripe_connect.stripe_disputes dispute
    on dispute.stripe_dispute_id = 'dp_dashboard_read_new';

insert into stripe_connect.irreversible_dispute_action_approvals (
    action_key, action_type, dispute_id, amount, threshold_amount,
    payload_sha256, status, first_actor_kind, first_actor_id,
    first_approved_at, second_actor_kind, second_actor_id,
    second_approved_at, created_at, updated_at
)
select fixture.action_key, fixture.action_type, dispute.id, 1200, 500,
    pg_catalog.repeat(fixture.hash_character, 64), fixture.status, 'admin',
    fixture.first_actor_id, fixture.created_at, fixture.second_actor_kind,
    fixture.second_actor_id, fixture.second_approved_at,
    fixture.created_at, fixture.created_at
from (values
    ('dashboard-approval-old', 'dispute_evidence_submit', 'b',
        'pending_second_approval', 'admin-old', null, null, null,
        '2026-07-22 10:01:00+00'::timestamptz),
    ('dashboard-approval-pending', 'dispute_accept', 'c',
        'pending_second_approval', 'admin-pending', null, null, null,
        '2026-07-22 10:03:00+00'::timestamptz),
    ('dashboard-approval-approved', 'dispute_accept', 'd',
        'approved', 'admin-first', 'admin', 'admin-second',
        '2026-07-22 10:06:00+00'::timestamptz,
        '2026-07-22 10:05:00+00'::timestamptz)
) fixture(
    action_key, action_type, hash_character, status, first_actor_id,
    second_actor_kind, second_actor_id, second_approved_at, created_at
)
join stripe_connect.stripe_disputes dispute
    on dispute.stripe_dispute_id = 'dp_dashboard_read_new';

set local role service_role;

create temporary table dashboard_dispute_results (
    position bigint generated always as identity,
    dispute jsonb not null,
    client_reference_id text not null,
    staged_evidence jsonb,
    evidence_submission_count integer not null,
    pending_approval jsonb
) on commit drop;

insert into dashboard_dispute_results (
    dispute, client_reference_id, staged_evidence,
    evidence_submission_count, pending_approval
)
select * from stripe_connect.read_dashboard_disputes(
    'admin-1', 'admin', 2, null, null, null
);

do $contract$
declare
    v_new dashboard_dispute_results%rowtype;
    v_null dashboard_dispute_results%rowtype;
begin
    if (select pg_catalog.array_agg(dispute->>'stripe_dispute_id' order by position)
        from dashboard_dispute_results) is distinct from array[
            'dp_dashboard_read_new', 'dp_dashboard_read_null'
        ] then
        raise exception 'stripe dashboard: dispute order or limit changed';
    end if;
    select * into strict v_new from dashboard_dispute_results
    where dispute->>'stripe_dispute_id' = 'dp_dashboard_read_new';
    select * into strict v_null from dashboard_dispute_results
    where dispute->>'stripe_dispute_id' = 'dp_dashboard_read_null';
    if v_new.client_reference_id <> 'dashboard-read-new'
       or v_new.staged_evidence is distinct from pg_catalog.jsonb_build_object(
            'evidence_operation_id', 'dashboard-evidence-latest',
            'staged_at', '2026-07-22 10:05:00+00'::timestamptz,
            'submitted_at', null
       ) or v_new.evidence_submission_count <> 2
       or v_new.pending_approval is distinct from pg_catalog.jsonb_build_object(
            'action_type', 'dispute_accept', 'status', 'pending_second_approval',
            'first_actor_id', 'admin-pending',
            'first_approved_at', '2026-07-22 10:03:00+00'::timestamptz,
            'second_actor_id', null, 'second_approved_at', null
       ) then
        raise exception 'stripe dashboard: hydrated dispute context changed: %',
            pg_catalog.to_jsonb(v_new);
    end if;
    if v_null.client_reference_id <> 'dashboard-read-null'
       or v_null.staged_evidence is not null
       or v_null.evidence_submission_count <> 0
       or v_null.pending_approval is not null then
        raise exception 'stripe dashboard: empty dispute context changed: %',
            pg_catalog.to_jsonb(v_null);
    end if;
end;
$contract$;

do $filters$
declare
    v_ids text[];
begin
    select pg_catalog.array_agg(result.dispute->>'stripe_dispute_id') into v_ids
    from stripe_connect.read_dashboard_disputes(
        'admin-1', 'admin', 10, null, 'under_review', null
    ) result;
    if v_ids is distinct from array['dp_dashboard_read_null'] then
        raise exception 'stripe dashboard: status filter changed: %', v_ids;
    end if;
    select pg_catalog.array_agg(result.dispute->>'stripe_dispute_id') into v_ids
    from stripe_connect.read_dashboard_disputes(
        'admin-1', 'admin', 10, '*outside*', null, null
    ) result;
    if v_ids is distinct from array['dp_dashboard_read_outside'] then
        raise exception 'stripe dashboard: search filter changed: %', v_ids;
    end if;
    select pg_catalog.array_agg(result.dispute->>'stripe_dispute_id') into v_ids
    from stripe_connect.read_dashboard_disputes(
        'admin-1', 'admin', 1, '*does-not-match*', 'won', 'dp_dashboard_read_new'
    ) result;
    if v_ids is distinct from array['dp_dashboard_read_new'] then
        raise exception 'stripe dashboard: detail lookup changed: %', v_ids;
    end if;
end;
$filters$;

reset role;
rollback;
