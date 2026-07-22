drop schema if exists dispute_approval_test cascade;
create schema dispute_approval_test;

create function dispute_approval_test.cleanup()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    delete from stripe_connect.irreversible_dispute_action_approvals
    where action_key like 'dispute-approval-pg-%';
    delete from stripe_connect.stripe_disputes
    where stripe_dispute_id like 'dp_dispute_approval_pg_%';
    delete from stripe_connect.payments
    where client_reference_id like 'dispute-approval-pg-%';
    delete from stripe_connect.accounts
    where cms_user_id like 'dispute-approval-pg-seller-%';
end;
$$;

create function dispute_approval_test.seed(p_case text, p_threshold_amount bigint)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_dispute_id bigint;
    v_payment_id bigint;
    v_suffix text := pg_catalog.lower(pg_catalog.btrim(p_case));
begin
    if v_suffix !~ '^[a-z0-9-]+$' or p_threshold_amount < 0 then
        raise exception 'dispute approval fixture: invalid case';
    end if;
    insert into stripe_connect.accounts (
        cms_user_id, stripe_account_id, terms_accepted,
        onboarding_status, charges_enabled, payouts_enabled
    ) values (
        'dispute-approval-pg-seller-' || v_suffix,
        'acct_dispute_approval_pg_' || v_suffix,
        true, 'enabled', true, true
    );
    insert into stripe_connect.payments (
        client_reference_id, financial_terms_hash,
        dual_approval_threshold_amount, buyer_cms_user_id,
        seller_cms_user_id, seller_stripe_account_id,
        stripe_payment_intent_id, stripe_charge_id,
        transfer_group, amount_total,
        seller_transfer_amount, platform_retained_amount
    ) values (
        'dispute-approval-pg-' || v_suffix,
        pg_catalog.repeat('a', 64), p_threshold_amount,
        'dispute-approval-pg-buyer-' || v_suffix,
        'dispute-approval-pg-seller-' || v_suffix,
        'acct_dispute_approval_pg_' || v_suffix,
        'pi_dispute_approval_pg_' || v_suffix,
        'ch_dispute_approval_pg_' || v_suffix,
        'cms_dispute_approval_pg_' || v_suffix,
        1200, 1080, 120
    ) returning id into v_payment_id;
    insert into stripe_connect.stripe_disputes (
        payment_id, stripe_dispute_id, stripe_charge_id,
        amount, currency, status, provider_snapshot
    ) values (
        v_payment_id, 'dp_dispute_approval_pg_' || v_suffix,
        'ch_dispute_approval_pg_' || v_suffix,
        1200, 'eur', 'needs_response',
        pg_catalog.jsonb_build_object('id', 'dp_dispute_approval_pg_' || v_suffix)
    ) returning id into v_dispute_id;
    return v_dispute_id;
end;
$$;

create function dispute_approval_test.attempt(
    p_action_key text,
    p_dispute_id bigint,
    p_actor_id text,
    p_payload_sha256 text default pg_catalog.repeat('b', 64)
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
    select stripe_connect.authorize_irreversible_dispute_action(
        p_action_key,
        'dispute_accept',
        p_dispute_id,
        1200,
        payment.dual_approval_threshold_amount,
        'admin',
        p_actor_id,
        p_payload_sha256
    )
    from stripe_connect.stripe_disputes dispute
    join stripe_connect.payments payment on payment.id = dispute.payment_id
    where dispute.id = p_dispute_id
$$;

revoke all on schema dispute_approval_test from public;
revoke all on all functions in schema dispute_approval_test from public;
grant usage on schema dispute_approval_test to service_role;
grant execute on all functions in schema dispute_approval_test to service_role;

select dispute_approval_test.cleanup();
