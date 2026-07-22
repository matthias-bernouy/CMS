drop schema if exists provider_reconciliation_test cascade;
create schema provider_reconciliation_test;

create function provider_reconciliation_test.cleanup()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    delete from stripe_connect.commerce_projection_interventions
    where projection_id in (
        select id from stripe_connect.commerce_projection_outbox
        where projection_key like 'provider-reconciliation-pg-%'
    );
    delete from stripe_connect.commerce_projection_outbox
    where projection_key like 'provider-reconciliation-pg-%';
    delete from stripe_connect.irreversible_dispute_action_approvals
    where dispute_id in (
        select id from stripe_connect.stripe_disputes
        where stripe_dispute_id like 'dp_provider_reconciliation_pg_%'
    );
    delete from stripe_connect.stripe_dispute_evidence
    where dispute_id in (
        select id from stripe_connect.stripe_disputes
        where stripe_dispute_id like 'dp_provider_reconciliation_pg_%'
    );
    delete from stripe_connect.stripe_disputes
    where stripe_dispute_id like 'dp_provider_reconciliation_pg_%';
    delete from stripe_connect.transfer_reversals
    where payment_id in (
        select id from stripe_connect.payments
        where client_reference_id like 'provider-reconciliation-pg-%'
    );
    delete from stripe_connect.transfer_recovery_requests
    where payment_id in (
        select id from stripe_connect.payments
        where client_reference_id like 'provider-reconciliation-pg-%'
    );
    delete from stripe_connect.refunds
    where payment_id in (
        select id from stripe_connect.payments
        where client_reference_id like 'provider-reconciliation-pg-%'
    );
    delete from stripe_connect.transfers
    where payment_id in (
        select id from stripe_connect.payments
        where client_reference_id like 'provider-reconciliation-pg-%'
    );
    delete from stripe_connect.financial_operations
    where business_key like 'provider-reconciliation-pg-%';
    delete from stripe_connect.payment_lifecycle_guards
    where client_reference_id like 'provider-reconciliation-pg-%';
    delete from stripe_connect.payments
    where client_reference_id like 'provider-reconciliation-pg-%';
    delete from stripe_connect.accounts
    where cms_user_id like 'provider-reconciliation-pg-seller-%';
end;
$$;

create function provider_reconciliation_test.seed_payment(p_case text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payment_id bigint;
    v_suffix text := pg_catalog.lower(pg_catalog.btrim(p_case));
begin
    if v_suffix !~ '^[a-z0-9-]+$' then
        raise exception 'provider reconciliation fixture: invalid case';
    end if;
    insert into stripe_connect.accounts (
        cms_user_id, stripe_account_id, terms_accepted,
        onboarding_status, charges_enabled, payouts_enabled
    ) values (
        'provider-reconciliation-pg-seller-' || v_suffix,
        'acct_provider_reconciliation_' || v_suffix,
        true, 'enabled', true, true
    );
    insert into stripe_connect.payments (
        client_reference_id, financial_terms_hash,
        dual_approval_threshold_amount, buyer_cms_user_id,
        seller_cms_user_id, seller_stripe_account_id,
        transfer_group, amount_total, seller_transfer_amount,
        platform_retained_amount
    ) values (
        'provider-reconciliation-pg-' || v_suffix,
        pg_catalog.repeat('a', 64), 1000,
        'provider-reconciliation-pg-buyer-' || v_suffix,
        'provider-reconciliation-pg-seller-' || v_suffix,
        'acct_provider_reconciliation_' || v_suffix,
        'provider_reconciliation_' || v_suffix,
        1200, 1080, 120
    ) returning id into v_payment_id;
    return v_payment_id;
end;
$$;

create function provider_reconciliation_test.seed_operation(
    p_payment_id bigint,
    p_case text,
    p_operation_type text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_operation_id bigint;
    v_suffix text := pg_catalog.lower(pg_catalog.btrim(p_case));
begin
    if v_suffix !~ '^[a-z0-9-]+$'
       or p_operation_type not in (
            'transfer_create', 'transfer_reversal_create', 'refund_create'
       ) then
        raise exception 'provider reconciliation fixture: invalid operation';
    end if;
    insert into stripe_connect.financial_operations (
        payment_id, business_key, operation_type, status, request
    ) values (
        p_payment_id,
        'provider-reconciliation-pg-' || v_suffix,
        p_operation_type,
        'reserved',
        '{}'::jsonb
    ) returning id into v_operation_id;
    return v_operation_id;
end;
$$;

revoke all on schema provider_reconciliation_test from public;
revoke all on all functions in schema provider_reconciliation_test from public;
grant usage on schema provider_reconciliation_test to service_role;

select provider_reconciliation_test.cleanup();
