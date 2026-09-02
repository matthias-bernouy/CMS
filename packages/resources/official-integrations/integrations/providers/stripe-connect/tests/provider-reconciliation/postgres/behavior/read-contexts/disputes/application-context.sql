-- Dispute application keeps payment precedence and an independent dispute lookup.
select provider_reconciliation_test.cleanup();

do $required_rpc$
begin
    if pg_catalog.to_regprocedure(
        'stripe_connect.read_stripe_dispute_application_context(text,text)'
    ) is null then
        raise exception 'provider reconciliation: missing future dispute application RPC';
    end if;
end;
$required_rpc$;

do $dispute_application_context$
declare
    v_payment_id bigint := provider_reconciliation_test.seed_payment(
        'dispute-application-context'
    );
    v_other_payment_id bigint := provider_reconciliation_test.seed_payment(
        'dispute-application-context-other'
    );
    v_context record;
    v_expected_payment jsonb;
    v_expected_dispute jsonb;
begin
    update stripe_connect.payments
    set stripe_charge_id = 'ch_provider_reconciliation_dispute_application'
    where id = v_payment_id;
    update stripe_connect.payments
    set stripe_charge_id = 'ch_provider_reconciliation_dispute_application_other'
    where id = v_other_payment_id;
    insert into stripe_connect.stripe_disputes (
        payment_id, stripe_dispute_id, stripe_charge_id, amount, currency,
        reason, status, evidence_status, provider_snapshot
    ) values (
        v_other_payment_id,
        'dp_provider_reconciliation_pg_dispute_application',
        'ch_provider_reconciliation_dispute_application_other',
        1200, 'eur', 'fraudulent', 'needs_response', 'staged',
        '{"id":"dp_provider_reconciliation_pg_dispute_application"}'::jsonb
    );

    select pg_catalog.to_jsonb(payment) into strict v_expected_payment
    from stripe_connect.payments payment where payment.id = v_payment_id;
    select pg_catalog.to_jsonb(dispute) into strict v_expected_dispute
    from stripe_connect.stripe_disputes dispute
    where dispute.stripe_dispute_id =
        'dp_provider_reconciliation_pg_dispute_application';

    select * into strict v_context
    from stripe_connect.read_stripe_dispute_application_context(
        'ch_provider_reconciliation_dispute_application',
        'dp_provider_reconciliation_pg_dispute_application'
    );
    if v_context.payment is distinct from v_expected_payment
       or v_context.dispute is distinct from v_expected_dispute then
        raise exception 'provider reconciliation: dispute application context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_stripe_dispute_application_context(
        'ch_provider_reconciliation_dispute_application',
        'dp_provider_reconciliation_pg_dispute_application_missing'
    );
    if v_context.payment is distinct from v_expected_payment
       or v_context.dispute is not null then
        raise exception 'provider reconciliation: absent dispute context changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;

    select * into strict v_context
    from stripe_connect.read_stripe_dispute_application_context(
        'ch_provider_reconciliation_dispute_application_missing',
        'dp_provider_reconciliation_pg_dispute_application'
    );
    if v_context.payment is not null or v_context.dispute is not null then
        raise exception 'provider reconciliation: missing payment precedence changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$dispute_application_context$;

select provider_reconciliation_test.cleanup();
