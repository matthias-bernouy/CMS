

create or replace function stripe_connect.recover_transient_provider_truth_review(
    p_payment_id bigint,
    p_payment_intent_id text,
    p_charge_id text,
    p_balance_transaction_id text,
    p_actor_kind text,
    p_actor_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_payment stripe_connect.payments%rowtype;
    v_reason constant text := 'Stripe payment provider truth mismatch: charge_balance_transaction_expansion';
    v_exception_key text;
begin
    if p_actor_kind not in ('system', 'webhook', 'reconciliation') then
        raise exception 'validation: invalid provider truth recovery actor kind';
    end if;
    if p_actor_id is null or length(btrim(p_actor_id)) = 0 then
        raise exception 'validation: provider truth recovery actor id is required';
    end if;

    select * into v_payment
    from stripe_connect.payments
    where id = p_payment_id
    for update;
    if not found then raise exception 'not_found: payment'; end if;

    v_exception_key := 'provider-payment-truth:' || p_payment_id || ':' || p_payment_intent_id;
    if v_payment.payment_status <> 'succeeded'
        or v_payment.settlement_status <> 'manual_review'
        or v_payment.manual_review_reason is distinct from v_reason
        or v_payment.stripe_payment_intent_id is distinct from p_payment_intent_id
        or v_payment.stripe_charge_id is distinct from p_charge_id
        or v_payment.stripe_charge_balance_transaction_id is distinct from p_balance_transaction_id
        or v_payment.transferred_amount <> 0
        or v_payment.reversed_amount <> 0
        or v_payment.refunded_amount <> 0
        or v_payment.dispute_status <> 'none'
        or not exists (
            select 1
            from stripe_connect.provider_exceptions exception
            where exception.payment_id = p_payment_id
              and exception.status in ('open', 'investigating')
              and exception.deduplication_key = v_exception_key
        )
        or exists (
            select 1
            from stripe_connect.provider_exceptions exception
            where exception.payment_id = p_payment_id
              and exception.status in ('open', 'investigating')
              and exception.deduplication_key is distinct from v_exception_key
        )
    then
        return jsonb_build_object('recovered', false, 'payment', to_jsonb(v_payment));
    end if;

    update stripe_connect.payments
    set settlement_status = 'held', manual_review_reason = null
    where id = p_payment_id
    returning * into v_payment;

    update stripe_connect.provider_exceptions
    set status = 'resolved', resolved_at = now(), resolved_by = 'provider-truth-revalidation'
    where deduplication_key = v_exception_key
      and status in ('open', 'investigating');

    insert into stripe_connect.payment_events (
        payment_id, event_type, actor_kind, actor_id,
        previous_payment_status, next_payment_status,
        previous_settlement_status, next_settlement_status, data
    ) values (
        p_payment_id, 'provider_payment_truth_revalidated', p_actor_kind, p_actor_id,
        'succeeded', 'succeeded', 'manual_review', 'held',
        jsonb_build_object(
            'resolvedReason', v_reason,
            'paymentIntentId', p_payment_intent_id,
            'chargeId', p_charge_id,
            'balanceTransactionId', p_balance_transaction_id
        )
    );

    return jsonb_build_object('recovered', true, 'payment', to_jsonb(v_payment));
end;
$$;