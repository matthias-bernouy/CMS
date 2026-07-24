

create or replace function commerce.record_order_payment_projection(
    p_order_public_id uuid,
    p_provider_event_id text,
    p_provider_payment_id bigint,
    p_status text,
    p_amount bigint,
    p_currency text,
    p_financial_terms_hash text,
    p_occurred_at timestamptz,
    p_provider_snapshot jsonb default '{}'::jsonb,
    p_provider_charge_id text default null,
    p_provider_payment_intent_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_attempt commerce.order_payment_attempts%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_review_exception commerce.financial_exceptions%rowtype;
    v_cancellation commerce.payment_cancellation_requests%rowtype;
    v_refund commerce.refund_requests%rowtype;
    v_refund_json jsonb;
    v_late_refund_key text;
    v_event_id bigint;
    v_provider_review_reason text;
    v_review_occurred_at timestamptz := 'infinity'::timestamptz;
    v_snapshot_updated_at timestamptz := 'infinity'::timestamptz;
    v_provider_review_recoverable boolean := false;
    v_payment_review_transition_safe boolean := false;
    v_payment_review_transition_applied boolean := false;
    v_recovered_ambiguous_payment boolean := false;
    v_payment_already_fully_refunded boolean := false;
    v_transient_provider_review_reason constant text :=
        'Stripe payment provider truth mismatch: charge_balance_transaction_expansion';
begin
    if p_status not in ('created', 'requires_action', 'processing', 'succeeded', 'failed', 'cancelled', 'manual_review') then
        raise exception 'validation: unsupported payment projection status';
    end if;
    select * into v_order from commerce.orders where public_id = p_order_public_id for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    if not found then raise exception 'conflict: immutable financial terms are missing'; end if;
    select * into v_fulfillment from commerce.order_fulfillments
    where order_id = v_order.id for update;
    if not found then raise exception 'conflict: order fulfillment is not initialized'; end if;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id for update;
    if not found then raise exception 'conflict: order settlement is missing'; end if;

    v_provider_review_reason := nullif(btrim(p_provider_snapshot->>'manualReviewReason'), '');
    if p_provider_snapshot->>'updatedAt'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}'
    then
        v_snapshot_updated_at :=
            (p_provider_snapshot->>'updatedAt')::timestamptz;
    end if;
    v_provider_review_recoverable := coalesce(p_status = 'manual_review'
        and v_provider_review_reason = v_transient_provider_review_reason
        and p_provider_snapshot->>'paymentStatus' in ('failed', 'succeeded')
        and coalesce(p_provider_snapshot, '{}'::jsonb) @> jsonb_build_object(
            'commercePaymentStatus', 'manual_review',
            'settlementStatus', 'manual_review',
            'disputeStatus', 'none',
            'sellerTransferAmount', v_terms.seller_proceeds_amount,
            'platformRetainedAmount', v_terms.platform_retained_amount,
            'refundedAmount', 0,
            'transferredAmount', 0,
            'reversedAmount', 0
        )
        and p_provider_snapshot->>'paymentId' = p_provider_payment_id::text
        and p_provider_snapshot->>'clientReferenceId' = v_order.public_id::text
        and p_provider_snapshot @> jsonb_build_object('amountTotal', v_terms.buyer_total_amount)
        and lower(p_provider_snapshot->>'currency') = v_terms.currency
        and p_provider_snapshot->>'financialTermsHash' = v_terms.financial_terms_hash
        and p_provider_payment_intent_id is not null
        and p_provider_charge_id is not null
        and p_provider_snapshot->>'stripePaymentIntentId' = p_provider_payment_intent_id
        and p_provider_snapshot->>'stripeChargeId' = p_provider_charge_id
        and (
            coalesce(p_provider_snapshot->>'stripeChargeBalanceTransactionId', '') = ''
            or p_provider_snapshot->>'stripeChargeBalanceTransactionId' like 'txn_%'
        )
        and p_occurred_at = v_snapshot_updated_at, false);

    select
        v_order.status in ('awaiting_payment', 'active')
        and v_settlement.status = 'held'
        and v_settlement.manual_review_reason is null
        and v_settlement.total_transferred_amount = 0
        and v_settlement.total_reversed_amount = 0
        and v_settlement.total_refunded_amount = 0
        and v_settlement.provider_transfer_id is null
        and v_fulfillment.status in (
            'awaiting_shipment', 'shipment_creating', 'label_created',
            'seller_handoff_declared', 'carrier_accepted', 'in_transit',
            'arrived_at_pickup_point', 'available_for_pickup'
        )
        and v_fulfillment.blocking_reason is null
        and v_fulfillment.recipient_handoff_at is null
        and v_fulfillment.recipient_handoff_first_observed_at is null
        and v_fulfillment.claim_window_started_at is null
        and v_fulfillment.claim_by_at is null
        and v_fulfillment.release_eligible_at is null
        and not exists (
            select 1 from commerce.financial_exceptions financial_exception
            where financial_exception.order_id = v_order.id
              and financial_exception.status in ('open', 'investigating')
        )
        and not exists (
            select 1 from commerce.marketplace_claims claim
            where claim.order_id = v_order.id
        )
        and not exists (
            select 1 from commerce.stripe_dispute_projections dispute
            where dispute.order_id = v_order.id
        )
        and not exists (
            select 1 from commerce.refund_requests refund
            where refund.order_id = v_order.id
        )
        and not exists (
            select 1 from commerce.order_cancellation_requests cancellation
            where cancellation.order_id = v_order.id
        )
        and not exists (
            select 1 from commerce.payment_cancellation_requests cancellation
            where cancellation.order_id = v_order.id
        )
        and not exists (
            select 1 from commerce.settlement_release_authorizations release_authorization
            where release_authorization.order_id = v_order.id
        )
        and not exists (
            select 1 from commerce.financial_operation_dispatch_claims dispatch
            where dispatch.order_id = v_order.id
        )
        and not exists (
            select 1 from commerce.seller_financial_exposures exposure
            where exposure.order_id = v_order.id
              and exposure.status in ('at_risk', 'debt')
        )
    into v_payment_review_transition_safe;
    v_event_id := commerce.claim_provider_projection_event(
        'stripe', p_provider_event_id, v_order.id, 'payment.' || p_status, p_occurred_at,
        jsonb_strip_nulls(jsonb_build_object(
            'providerPaymentId', p_provider_payment_id,
            'providerPaymentIntentId', p_provider_payment_intent_id,
            'providerChargeId', p_provider_charge_id,
            'amount', p_amount, 'currency', lower(p_currency),
            'financialTermsHash', p_financial_terms_hash,
            'snapshot', coalesce(p_provider_snapshot, '{}'::jsonb)
        ))
    );
    select * into v_attempt from commerce.order_payment_attempts
    where provider = 'stripe' and client_reference_id = v_order.public_id::text
    for update;
    if v_event_id is null then
        if not found then raise exception 'conflict: duplicate provider event has no payment projection'; end if;
        return to_jsonb(v_attempt) || jsonb_build_object('idempotentReplay', true);
    end if;
    if p_amount <> v_terms.buyer_total_amount or lower(p_currency) <> v_terms.currency
        or p_financial_terms_hash <> v_terms.financial_terms_hash then
        insert into commerce.financial_exceptions (
            order_id, kind, severity, reason, details
        ) values (
            v_order.id, 'payment_mismatch', 'critical',
            'Stripe payment projection does not match immutable Commerce terms',
            jsonb_build_object(
                'providerPaymentId', p_provider_payment_id,
                'providerAmount', p_amount,
                'providerCurrency', lower(p_currency),
                'providerTermsHash', p_financial_terms_hash
            )
        );
        update commerce.order_settlements set
            status = 'manual_review', manual_review_reason = 'payment_projection_mismatch'
        where order_id = v_order.id
          and v_payment_review_transition_safe;
        perform commerce.append_financial_event(
            v_order.id, 'payment', p_provider_payment_id::text, 'payment_mismatch',
            'provider', 'stripe', 'Provider payment differs from immutable Commerce terms',
            jsonb_build_object('providerEventId', p_provider_event_id),
            'commerce.order.payment_mismatch', 'stripe:' || p_provider_event_id || ':mismatch'
        );
        return jsonb_build_object(
            'orderId', v_order.id, 'status', 'manual_review',
            'accepted', false, 'idempotentReplay', false,
            'reason', 'provider_payment_does_not_match_immutable_terms'
        );
    end if;
    if v_attempt.id is null then
        insert into commerce.order_payment_attempts (
            order_id, provider_payment_id, provider_payment_intent_id,
            provider_charge_id, client_reference_id, status,
            amount, currency, financial_terms_hash, provider_snapshot,
            succeeded_at, failed_at, cancelled_at
        ) values (
            v_order.id, p_provider_payment_id, p_provider_payment_intent_id,
            p_provider_charge_id, v_order.public_id::text, p_status,
            p_amount, lower(p_currency), p_financial_terms_hash,
            coalesce(p_provider_snapshot, '{}'::jsonb),
            case when p_status = 'succeeded' then p_occurred_at end,
            case when p_status = 'failed' then p_occurred_at end,
            case when p_status = 'cancelled' then p_occurred_at end
        ) returning * into v_attempt;
    else
        if (v_attempt.provider_payment_id is not null
                and v_attempt.provider_payment_id is distinct from p_provider_payment_id)
            or (p_provider_payment_intent_id is not null and v_attempt.provider_payment_intent_id is not null
                and v_attempt.provider_payment_intent_id <> p_provider_payment_intent_id)
            or (p_provider_charge_id is not null and v_attempt.provider_charge_id is not null
                and v_attempt.provider_charge_id <> p_provider_charge_id)
            or v_attempt.amount <> p_amount or v_attempt.currency <> lower(p_currency)
            or v_attempt.financial_terms_hash <> p_financial_terms_hash then
            raise exception 'conflict: payment replay changed immutable provider terms';
        end if;
        if v_attempt.status = 'succeeded'
            and p_status not in ('succeeded', 'manual_review') then
            return to_jsonb(v_attempt) || jsonb_build_object('idempotentReplay', false, 'ignoredStaleEvent', true);
        end if;
        if v_attempt.status = 'cancelled' and p_status not in ('cancelled', 'succeeded') then
            raise exception 'conflict: cancelled provider payment cannot regress';
        end if;
        update commerce.order_payment_attempts set
            status = p_status,
            provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
            provider_payment_intent_id = coalesce(provider_payment_intent_id, p_provider_payment_intent_id),
            provider_charge_id = coalesce(provider_charge_id, p_provider_charge_id),
            provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb),
            succeeded_at = case when p_status = 'succeeded' then coalesce(succeeded_at, p_occurred_at) else succeeded_at end,
            failed_at = case when p_status = 'failed' then coalesce(failed_at, p_occurred_at) else failed_at end,
            cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, p_occurred_at) else cancelled_at end
        where id = v_attempt.id returning * into v_attempt;
    end if;
    update commerce.payment_cancellation_requests set
        provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
        provider_payment_intent_id = coalesce(provider_payment_intent_id, p_provider_payment_intent_id),
        provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb),
        status = case when p_status in ('created', 'requires_action', 'processing', 'failed')
            and status = 'requested' then 'processing' else status end
    where order_id = v_order.id
      and status in ('requested', 'processing', 'provider_cancelled', 'completed', 'manual_review');

    select * into v_cancellation from commerce.payment_cancellation_requests
    where order_id = v_order.id
    order by created_at desc, id desc limit 1 for update;

    if p_status = 'cancelled' and v_cancellation.id is not null
        and v_cancellation.status not in ('refund_pending', 'completed') then
        update commerce.payment_cancellation_requests set
            status = 'completed', provider_payment_id = p_provider_payment_id,
            provider_payment_intent_id = coalesce(provider_payment_intent_id, p_provider_payment_intent_id),
            provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb)
        where id = v_cancellation.id returning * into v_cancellation;
        perform commerce.restore_order_inventory(v_order.id);
        update commerce.orders set
            status = v_cancellation.target_order_status,
            version = version + 1, updated_at = now()
        where id = v_order.id and status = 'cancellation_pending';
        update commerce.order_fulfillments set
            status = 'cancelled', blocking_reason = case
                when v_cancellation.target_order_status = 'expired' then 'payment_window_expired'
                else 'order_cancelled_before_payment' end,
            version = version + 1, updated_at = now()
        where order_id = v_order.id;
        update commerce.order_settlements set
            status = 'blocked', manual_review_reason = case
                when v_cancellation.target_order_status = 'expired' then 'order_expired_without_payment'
                else 'order_cancelled_without_payment' end,
            version = version + 1, updated_at = now()
        where order_id = v_order.id;
        update commerce.order_cancellation_requests set status = 'completed'
        where id = v_cancellation.order_cancellation_request_id
          and status = 'provider_cancellation_pending';
        update commerce.financial_exceptions set
            status = 'resolved', resolved_at = now(), resolved_by = 'stripe-payment-cancellation'
        where deduplication_key = 'deadline:payment:' || v_order.id and status <> 'resolved';
        perform commerce.append_financial_event(
            v_order.id, 'payment_cancellation', v_cancellation.id::text,
            'payment_cancellation_provider_confirmed', 'provider', 'stripe', null,
            jsonb_build_object('providerPaymentId', p_provider_payment_id,
                'targetOrderStatus', v_cancellation.target_order_status),
            'commerce.order.payment_cancellation_confirmed',
            v_cancellation.business_key || ':provider-cancelled'
        );
    elsif p_status = 'succeeded' and (
        v_order.status in ('cancellation_pending', 'cancelled', 'expired')
        or (v_cancellation.id is not null and v_cancellation.status in ('requested', 'processing', 'provider_cancelled', 'completed'))
    ) then
        v_late_refund_key := 'late-payment-success:' || v_order.id || ':' || p_provider_payment_id;
        v_payment_already_fully_refunded :=
            v_settlement.status = 'refunded'
            and v_settlement.total_refunded_amount = v_terms.buyer_total_amount
            and v_settlement.authorized_seller_amount
                = v_settlement.total_transferred_amount - v_settlement.total_reversed_amount
            and v_settlement.seller_reserve_liability_remaining_amount = 0
            and v_settlement.platform_gross_remainder_amount = 0;
        select * into v_refund from commerce.refund_requests
        where business_key = v_late_refund_key for update;
        if not found and not v_payment_already_fully_refunded then
            v_refund_json := commerce.create_cancellation_refund_request(
                v_order.id, v_late_refund_key,
                'Automatic policy-governed refund after Stripe succeeded during or after provider cancellation',
                'system', 'late-payment-compensation'
            );
            if v_refund_json is not null then
                update commerce.refund_requests set
                    status = 'approved', requires_finance_approval = false,
                    dual_approval_required = false, approved_by = 'late-payment-compensation',
                    decision_reason = 'Mandatory automatic compensation for a late provider success'
                where id = (v_refund_json->>'id')::bigint returning * into v_refund;
            end if;
        end if;
        if v_cancellation.id is null then
            insert into commerce.payment_cancellation_requests (
                order_id, business_key, target_order_status, reason, status,
                provider_payment_id, provider_payment_intent_id, provider_snapshot
            ) values (
                v_order.id, 'payment-cancellation:late-success:' || v_order.id,
                case when v_order.status = 'expired' then 'expired' else 'cancelled' end,
                'Late Stripe success requires a full protected refund',
                case when v_payment_already_fully_refunded then 'completed' else 'refund_pending' end,
                p_provider_payment_id, p_provider_payment_intent_id,
                coalesce(p_provider_snapshot, '{}'::jsonb)
            ) returning * into v_cancellation;
        else
            update commerce.payment_cancellation_requests set
                status = case when v_payment_already_fully_refunded
                    then 'completed' else 'refund_pending' end,
                provider_payment_id = p_provider_payment_id,
                provider_payment_intent_id = coalesce(provider_payment_intent_id, p_provider_payment_intent_id),
                provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb)
            where id = v_cancellation.id returning * into v_cancellation;
        end if;
        update commerce.order_cancellation_requests set
            status = case when v_payment_already_fully_refunded
                then 'completed' else 'refund_pending' end
        where id = v_cancellation.order_cancellation_request_id
          and status in ('provider_cancellation_pending', 'refund_pending', 'completed', 'approved');
        if v_payment_already_fully_refunded then
            perform commerce.restore_order_inventory(v_order.id);
            update commerce.orders set
                status = v_cancellation.target_order_status,
                version = version + 1,
                updated_at = now()
            where id = v_order.id
              and status is distinct from v_cancellation.target_order_status;
            update commerce.order_fulfillments set
                status = 'cancelled',
                blocking_reason = case
                    when v_cancellation.target_order_status = 'expired'
                        then 'payment_window_expired_after_full_refund'
                    else 'order_cancelled_after_full_refund' end,
                version = version + 1,
                updated_at = now()
            where order_id = v_order.id
              and (
                  status is distinct from 'cancelled'
                  or blocking_reason is distinct from case
                      when v_cancellation.target_order_status = 'expired'
                          then 'payment_window_expired_after_full_refund'
                      else 'order_cancelled_after_full_refund' end
              );
        end if;
        insert into commerce.financial_exceptions (
            deduplication_key, order_id, kind, severity, reason, details
        ) values (
            v_late_refund_key, v_order.id, 'late_payment_success', 'critical',
            'Stripe succeeded after Commerce requested or finalized payment cancellation',
            jsonb_build_object('providerPaymentId', p_provider_payment_id,
                'providerPaymentIntentId', p_provider_payment_intent_id,
                'refundRequestId', v_refund.id)
        ) on conflict (deduplication_key) where deduplication_key is not null do update set
            status = 'open', resolved_at = null, resolved_by = null,
            details = excluded.details;
        if v_payment_already_fully_refunded then
            update commerce.financial_exceptions set
                status = 'resolved',
                resolved_at = now(),
                resolved_by = 'late-payment-compensation'
            where deduplication_key = v_late_refund_key;
        end if;
        perform commerce.append_financial_event(
            v_order.id, 'payment', v_attempt.id::text,
            case when v_payment_already_fully_refunded
                then 'late_payment_success_already_refunded'
                else 'late_payment_success_refund_authorized' end,
            'system', 'late-payment-compensation',
            case when v_payment_already_fully_refunded
                then 'Provider success was observed after the full protected refund was already terminal'
                else 'Provider success raced a Commerce cancellation; full refund authorized exactly once' end,
            jsonb_build_object('providerPaymentId', p_provider_payment_id,
                'refundRequestId', v_refund.id, 'businessKey', v_late_refund_key,
                'alreadyFullyRefunded', v_payment_already_fully_refunded),
            'commerce.order.late_payment_success', v_late_refund_key
        );
    elsif p_status = 'succeeded' then
        select * into v_settlement
        from commerce.order_settlements
        where order_id = v_order.id
        for update;
        if not found then raise exception 'conflict: order settlement is missing'; end if;
        select * into v_fulfillment
        from commerce.order_fulfillments
        where order_id = v_order.id
        for update;
        if not found then raise exception 'conflict: order fulfillment is not initialized'; end if;

        select * into v_review_exception
        from commerce.financial_exceptions financial_exception
        where financial_exception.order_id = v_order.id
          and financial_exception.kind = 'payment_mismatch'
          and financial_exception.severity = 'critical'
          and financial_exception.status in ('open', 'investigating')
          and financial_exception.details->>'providerPaymentId' = p_provider_payment_id::text
          and financial_exception.details->>'providerPaymentIntentId' = p_provider_payment_intent_id
          and financial_exception.details->>'providerChargeId' = p_provider_charge_id
          and financial_exception.details->>'providerManualReviewReason' =
                v_transient_provider_review_reason
          and (
              (
                  financial_exception.deduplication_key =
                      'ambiguous-payment-state:' || v_order.id || ':' || p_provider_payment_id
                  and financial_exception.reason = 'Ambiguous provider payment state'
                  and financial_exception.details->>'recoverable' = 'true'
              )
              or (
                  financial_exception.deduplication_key =
                      'provider-payment-review:' || v_order.id || ':' || p_provider_payment_id
                  and financial_exception.reason =
                      'Provider payment requires non-automatic manual review'
                  and financial_exception.details->>'recoverable' = 'false'
              )
          )
          and length(btrim(coalesce(financial_exception.details->>'providerEventId', ''))) > 0
          and financial_exception.details->>'providerOccurredAt'
                ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}'
        order by (
            financial_exception.deduplication_key =
                'ambiguous-payment-state:' || v_order.id || ':' || p_provider_payment_id
        ) desc, financial_exception.id desc
        limit 1
        for update;

        if v_review_exception.id is not null
            and v_review_exception.details->>'providerOccurredAt'
                ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}'
        then
            v_review_occurred_at :=
                (v_review_exception.details->>'providerOccurredAt')::timestamptz;
        end if;
        if v_settlement.status = 'manual_review'
            and v_settlement.manual_review_reason in (
                'ambiguous_payment_state', 'provider_payment_manual_review_nonrecoverable'
            )
            and v_order.status in ('awaiting_payment', 'active')
            and v_review_exception.id is not null
            and p_occurred_at > v_review_occurred_at
            and v_settlement.total_transferred_amount = 0
            and v_settlement.total_reversed_amount = 0
            and v_settlement.total_refunded_amount = 0
            and v_settlement.provider_transfer_id is null
            and coalesce(p_provider_snapshot, '{}'::jsonb) @> jsonb_build_object(
                'paymentStatus', 'succeeded',
                'commercePaymentStatus', 'succeeded',
                'settlementStatus', 'held',
                'disputeStatus', 'none',
                'sellerTransferAmount', v_terms.seller_proceeds_amount,
                'platformRetainedAmount', v_terms.platform_retained_amount,
                'refundedAmount', 0,
                'transferredAmount', 0,
                'reversedAmount', 0
            )
            and p_provider_snapshot->>'clientReferenceId' = v_order.public_id::text
            and p_provider_snapshot @> jsonb_build_object(
                'amountTotal', v_terms.buyer_total_amount
            )
            and lower(p_provider_snapshot->>'currency') = v_terms.currency
            and p_provider_snapshot->>'financialTermsHash' = v_terms.financial_terms_hash
            and p_occurred_at = v_snapshot_updated_at
            and (
                not (coalesce(p_provider_snapshot, '{}'::jsonb) ? 'manualReviewReason')
                or p_provider_snapshot->'manualReviewReason' = 'null'::jsonb
            )
            and p_provider_snapshot->>'paymentId' = p_provider_payment_id::text
            and p_provider_payment_intent_id is not null
            and p_provider_charge_id is not null
            and p_provider_snapshot->>'stripePaymentIntentId' = p_provider_payment_intent_id
            and p_provider_snapshot->>'stripeChargeId' = p_provider_charge_id
            and coalesce(p_provider_snapshot->>'stripeChargeBalanceTransactionId', '') like 'txn_%'
            and (
                nullif(v_review_exception.details->>'providerBalanceTransactionId', '') is null
                or p_provider_snapshot->>'stripeChargeBalanceTransactionId' =
                    v_review_exception.details->>'providerBalanceTransactionId'
            )
            and v_attempt.provider_payment_intent_id = p_provider_payment_intent_id
            and v_attempt.provider_charge_id = p_provider_charge_id
            and v_fulfillment.status in (
                'awaiting_shipment', 'shipment_creating', 'label_created',
                'seller_handoff_declared', 'carrier_accepted', 'in_transit',
                'arrived_at_pickup_point', 'available_for_pickup'
            )
            and v_fulfillment.blocking_reason is null
            and v_fulfillment.recipient_handoff_at is null
            and v_fulfillment.recipient_handoff_first_observed_at is null
            and v_fulfillment.claim_window_started_at is null
            and v_fulfillment.claim_by_at is null
            and v_fulfillment.release_eligible_at is null
            and not exists (
                select 1
                from commerce.financial_exceptions financial_exception
                where financial_exception.order_id = v_order.id
                  and financial_exception.status in ('open', 'investigating')
                  and not (
                      financial_exception.kind = 'payment_mismatch'
                      and financial_exception.severity = 'critical'
                      and financial_exception.details->>'providerPaymentId' = p_provider_payment_id::text
                      and financial_exception.details->>'providerPaymentIntentId' = p_provider_payment_intent_id
                      and financial_exception.details->>'providerChargeId' = p_provider_charge_id
                      and financial_exception.details->>'providerManualReviewReason' =
                          v_transient_provider_review_reason
                      and (
                          (
                              financial_exception.deduplication_key =
                                  'ambiguous-payment-state:' || v_order.id || ':' || p_provider_payment_id
                              and financial_exception.reason = 'Ambiguous provider payment state'
                              and financial_exception.details->>'recoverable' = 'true'
                          )
                          or (
                              financial_exception.deduplication_key =
                                  'provider-payment-review:' || v_order.id || ':' || p_provider_payment_id
                              and financial_exception.reason =
                                  'Provider payment requires non-automatic manual review'
                              and financial_exception.details->>'recoverable' = 'false'
                          )
                      )
                  )
            )
            and not exists (
                select 1
                from commerce.provider_projection_events provider_event
                where provider_event.authority = 'stripe'
                  and provider_event.order_id = v_order.id
                  and provider_event.event_type like 'payment.%'
                  and provider_event.provider_event_id <> p_provider_event_id
                  and provider_event.occurred_at >= p_occurred_at
            )
            and not exists (
                select 1 from commerce.marketplace_claims claim
                where claim.order_id = v_order.id
            )
            and not exists (
                select 1 from commerce.stripe_dispute_projections dispute
                where dispute.order_id = v_order.id
            )
            and not exists (
                select 1 from commerce.refund_requests refund
                where refund.order_id = v_order.id
            )
            and not exists (
                select 1 from commerce.order_cancellation_requests cancellation
                where cancellation.order_id = v_order.id
            )
            and not exists (
                select 1 from commerce.payment_cancellation_requests cancellation
                where cancellation.order_id = v_order.id
            )
            and not exists (
                select 1 from commerce.settlement_release_authorizations release_authorization
                where release_authorization.order_id = v_order.id
            )
            and not exists (
                select 1 from commerce.financial_operation_dispatch_claims dispatch
                where dispatch.order_id = v_order.id
            )
            and not exists (
                select 1 from commerce.seller_financial_exposures exposure
                where exposure.order_id = v_order.id
                  and exposure.status in ('at_risk', 'debt')
            )
        then
            update commerce.order_settlements set
                status = 'held', manual_review_reason = null,
                version = version + 1, updated_at = now()
            where order_id = v_order.id
            returning * into v_settlement;
            update commerce.financial_exceptions set
                status = 'resolved', resolved_at = now(),
                resolved_by = 'stripe-provider-truth-revalidation'
            where order_id = v_order.id
              and status in ('open', 'investigating')
              and kind = 'payment_mismatch'
              and severity = 'critical'
              and details->>'providerPaymentId' = p_provider_payment_id::text
              and details->>'providerPaymentIntentId' = p_provider_payment_intent_id
              and details->>'providerChargeId' = p_provider_charge_id
              and details->>'providerManualReviewReason' = v_transient_provider_review_reason
              and deduplication_key in (
                  'ambiguous-payment-state:' || v_order.id || ':' || p_provider_payment_id,
                  'provider-payment-review:' || v_order.id || ':' || p_provider_payment_id
              );
            perform commerce.append_financial_event(
                v_order.id, 'payment', v_attempt.id::text,
                'ambiguous_payment_state_revalidated', 'provider', 'stripe',
                'Stripe provider truth was fully revalidated before restoring the held settlement',
                jsonb_build_object(
                    'providerPaymentId', p_provider_payment_id,
                    'providerPaymentIntentId', p_provider_payment_intent_id,
                    'providerChargeId', p_provider_charge_id,
                    'providerEventId', p_provider_event_id,
                    'reviewProviderEventId', v_review_exception.details->>'providerEventId',
                    'reviewProviderOccurredAt', v_review_exception.details->>'providerOccurredAt',
                    'previousSettlementStatus', 'manual_review',
                    'nextSettlementStatus', 'held'
                ),
                'commerce.order.payment_review_recovered',
                'stripe:' || p_provider_event_id || ':ambiguous-payment-recovered'
            );
            v_recovered_ambiguous_payment := true;
        end if;

        if (v_settlement.status = 'held' or v_recovered_ambiguous_payment)
            and (v_payment_review_transition_safe or v_recovered_ambiguous_payment)
            and v_settlement.manual_review_reason is null
            and v_fulfillment.status in (
                'awaiting_shipment', 'shipment_creating', 'label_created',
                'seller_handoff_declared', 'carrier_accepted', 'in_transit',
                'arrived_at_pickup_point', 'available_for_pickup'
            )
            and v_fulfillment.blocking_reason is null
            and v_fulfillment.recipient_handoff_at is null
            and v_fulfillment.recipient_handoff_first_observed_at is null
            and v_fulfillment.claim_window_started_at is null
            and v_fulfillment.claim_by_at is null
            and v_fulfillment.release_eligible_at is null
        then
            update commerce.orders set status = 'active'
            where id = v_order.id and status = 'awaiting_payment';
        end if;
    elsif p_status = 'manual_review' then
        if v_payment_review_transition_safe then
            update commerce.order_settlements set
                status = 'manual_review',
                manual_review_reason = case
                    when v_provider_review_recoverable then 'ambiguous_payment_state'
                    else 'provider_payment_manual_review_nonrecoverable'
                end,
                version = version + 1, updated_at = now()
            where order_id = v_order.id
              and status = 'held'
              and manual_review_reason is null
            returning * into v_settlement;
            v_payment_review_transition_applied := found;
        end if;
        insert into commerce.financial_exceptions as financial_exception (
            deduplication_key, order_id, kind, severity, reason, details
        ) values (
            case when v_provider_review_recoverable
                then 'ambiguous-payment-state:' || v_order.id || ':' || p_provider_payment_id
                else 'provider-payment-review:' || v_order.id || ':' || p_provider_payment_id
            end,
            v_order.id, 'payment_mismatch', 'critical',
            case when v_provider_review_recoverable
                then 'Ambiguous provider payment state'
                else 'Provider payment requires non-automatic manual review'
            end,
            jsonb_strip_nulls(jsonb_build_object(
                'providerPaymentId', p_provider_payment_id,
                'providerPaymentIntentId', p_provider_payment_intent_id,
                'providerChargeId', p_provider_charge_id,
                'providerBalanceTransactionId',
                    p_provider_snapshot->>'stripeChargeBalanceTransactionId',
                'providerManualReviewReason', v_provider_review_reason,
                'providerEventId', p_provider_event_id,
                'providerOccurredAt', p_occurred_at,
                'recoverable', v_provider_review_recoverable,
                'settlementTransitionApplied', v_payment_review_transition_applied,
                'observedSettlementStatus', v_settlement.status,
                'observedSettlementReason', v_settlement.manual_review_reason,
                'observedFulfillmentStatus', v_fulfillment.status,
                'observedFulfillmentBlockingReason', v_fulfillment.blocking_reason
            ))
        ) on conflict (deduplication_key) where deduplication_key is not null do update set
            status = 'open', severity = 'critical',
            reason = excluded.reason,
            details = excluded.details,
            detected_at = now(), resolved_at = null, resolved_by = null
        where case
                when financial_exception.details->>'providerOccurredAt'
                    ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}'
                then (financial_exception.details->>'providerOccurredAt')::timestamptz
                else 'infinity'::timestamptz
            end <= case
                when excluded.details->>'providerOccurredAt'
                    ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}'
                then (excluded.details->>'providerOccurredAt')::timestamptz
                else '-infinity'::timestamptz
            end;
    end if;
    perform commerce.append_financial_event(
        v_order.id, 'payment', v_attempt.id::text, 'payment_' || p_status,
        'provider', 'stripe', null,
        jsonb_strip_nulls(jsonb_build_object(
            'providerPaymentId', p_provider_payment_id,
            'providerEventId', p_provider_event_id,
            'providerManualReviewReason', v_provider_review_reason,
            'paymentReviewRecoverable', case when p_status = 'manual_review'
                then v_provider_review_recoverable else null end,
            'settlementTransitionApplied', case when p_status = 'manual_review'
                then v_payment_review_transition_applied else null end
        )),
        'commerce.order.payment_projection', 'stripe:' || p_provider_event_id
    );
    return to_jsonb(v_attempt) || jsonb_build_object(
        'idempotentReplay', false,
        'paymentReviewRecoverable', v_provider_review_recoverable,
        'paymentReviewSettlementTransitioned', v_payment_review_transition_applied,
        'paymentReviewRecovered', v_recovered_ambiguous_payment
    );
end;
$$;
