

create or replace function stripe_connect.reserve_protected_payment(
    p_payment jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_client_reference_id text;
    v_guard stripe_connect.payment_lifecycle_guards%rowtype;
    v_payment stripe_connect.payments%rowtype;
begin
    if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
        raise exception 'validation: protected payment reservation must be an object';
    end if;
    v_client_reference_id := nullif(btrim(p_payment->>'client_reference_id'), '');
    if v_client_reference_id is null then
        raise exception 'validation: client reference id is required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe-connect:payment-lifecycle:' || v_client_reference_id, 0)
    );
    insert into stripe_connect.payment_lifecycle_guards (client_reference_id)
    values (v_client_reference_id)
    on conflict (client_reference_id) do nothing;
    select * into v_guard
    from stripe_connect.payment_lifecycle_guards
    where client_reference_id = v_client_reference_id
    for update;
    if v_guard.cancellation_request_id is not null then
        raise exception 'conflict: protected payment creation was cancelled before provider creation';
    end if;
    select * into v_payment
    from stripe_connect.payments
    where client_reference_id = v_client_reference_id
    for update;
    if not found then
        insert into stripe_connect.payments (
            client_reference_id, financial_terms_hash, financial_revision,
            dual_approval_threshold_amount, buyer_cms_user_id, seller_cms_user_id,
            seller_stripe_account_id, transfer_group, currency, amount_total,
            seller_transfer_amount, platform_retained_amount, payment_status,
            settlement_status, description
        ) values (
            v_client_reference_id,
            p_payment->>'financial_terms_hash',
            (p_payment->>'financial_revision')::integer,
            (p_payment->>'dual_approval_threshold_amount')::bigint,
            p_payment->>'buyer_cms_user_id',
            p_payment->>'seller_cms_user_id',
            p_payment->>'seller_stripe_account_id',
            p_payment->>'transfer_group',
            lower(p_payment->>'currency'),
            (p_payment->>'amount_total')::bigint,
            (p_payment->>'seller_transfer_amount')::bigint,
            (p_payment->>'platform_retained_amount')::bigint,
            coalesce(nullif(p_payment->>'payment_status', ''), 'created'),
            coalesce(nullif(p_payment->>'settlement_status', ''), 'held'),
            nullif(p_payment->>'description', '')
        ) returning * into v_payment;
    end if;
    update stripe_connect.payment_lifecycle_guards
    set payment_id = v_payment.id,
        payment_linked_at = coalesce(payment_linked_at, now())
    where client_reference_id = v_client_reference_id;
    return to_jsonb(v_payment);
end;
$$;
