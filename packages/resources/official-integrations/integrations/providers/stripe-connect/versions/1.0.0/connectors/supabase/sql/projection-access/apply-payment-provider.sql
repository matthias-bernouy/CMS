

create or replace function stripe_connect.apply_payment_provider_projection(
    p_payment_id bigint,
    p_expected_payment jsonb,
    p_projection jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payment stripe_connect.payments%rowtype;
    v_expected_payment stripe_connect.payments%rowtype;
    v_payment_json jsonb;
    v_kind text;
    v_payment_status text;
    v_payment_intent_id text;
    v_charge_id text;
    v_balance_transaction_id text;
    v_charge_fee_amount bigint;
    v_processing_fee_amount bigint;
    v_charge_net_amount bigint;
    v_fee_currency text;
    v_fee_details jsonb;
    v_paid_at timestamptz;
    v_cancelled_at timestamptz;
    v_provider_synced_at timestamptz;
    v_projection_key text;
    v_recovered_projection_key text;
    v_projection_key_pattern text;
    v_recovery jsonb;
    v_recovery_result jsonb;
    v_recovered boolean := false;
    v_was_transient_review boolean;
    v_exception_key text;
    v_actor_kind text;
    v_actor_id text;
    v_details jsonb;
    v_mismatches text[];
    v_manual_review_reason text;
    v_provider_payment_intent_id text;
    v_apply_mutable_fields constant text[] := array[
        'payment_status', 'stripe_payment_intent_id', 'stripe_charge_id',
        'stripe_charge_balance_transaction_id', 'actual_stripe_charge_fee_amount',
        'actual_stripe_processing_fee_amount', 'actual_stripe_charge_net_amount',
        'actual_stripe_fee_currency', 'actual_stripe_charge_fee_details',
        'paid_at', 'cancelled_at', 'last_provider_sync_at', 'updated_at'
    ];
begin
    if p_payment_id is null or p_payment_id <= 0 then
        raise exception 'validation: payment id must be positive';
    end if;
    if p_expected_payment is null or jsonb_typeof(p_expected_payment) <> 'object'
        or not p_expected_payment ?& array[
            'id', 'client_reference_id', 'financial_terms_hash', 'financial_revision',
            'dual_approval_threshold_amount', 'buyer_cms_user_id', 'seller_cms_user_id',
            'seller_stripe_account_id', 'stripe_payment_intent_id', 'stripe_charge_id',
            'stripe_charge_balance_transaction_id', 'last_stripe_event_id', 'transfer_group',
            'currency', 'amount_total', 'seller_transfer_amount', 'platform_retained_amount',
            'refunded_amount', 'transferred_amount', 'reversed_amount',
            'actual_stripe_charge_fee_amount', 'actual_stripe_refund_fee_amount',
            'actual_stripe_processing_fee_amount', 'actual_stripe_charge_net_amount',
            'actual_stripe_fee_currency', 'actual_stripe_charge_fee_details', 'payment_status',
            'settlement_status', 'dispute_status', 'description', 'manual_review_reason',
            'paid_at', 'cancelled_at', 'last_provider_sync_at', 'created_at', 'updated_at'
        ]
        or exists (
            select 1
            from jsonb_object_keys(p_expected_payment) as expected_field(key)
            where expected_field.key not in (
                'id', 'client_reference_id', 'financial_terms_hash', 'financial_revision',
                'dual_approval_threshold_amount', 'buyer_cms_user_id', 'seller_cms_user_id',
                'seller_stripe_account_id', 'stripe_payment_intent_id', 'stripe_charge_id',
                'stripe_charge_balance_transaction_id', 'last_stripe_event_id', 'transfer_group',
                'currency', 'amount_total', 'seller_transfer_amount', 'platform_retained_amount',
                'refunded_amount', 'transferred_amount', 'reversed_amount',
                'actual_stripe_charge_fee_amount', 'actual_stripe_refund_fee_amount',
                'actual_stripe_processing_fee_amount', 'actual_stripe_charge_net_amount',
                'actual_stripe_fee_currency', 'actual_stripe_charge_fee_details', 'payment_status',
                'settlement_status', 'dispute_status', 'description', 'manual_review_reason',
                'paid_at', 'cancelled_at', 'last_provider_sync_at', 'created_at', 'updated_at'
            )
        )
    then
        raise exception 'validation: expected payment must be an exact payment projection';
    end if;
    begin
        select expected.* into v_expected_payment
        from jsonb_populate_record(
            null::stripe_connect.payments,
            p_expected_payment
        ) as expected;
    exception when others then
        raise exception 'validation: expected payment contains invalid values';
    end;
    if v_expected_payment.id is distinct from p_payment_id then
        raise exception 'validation: expected payment id does not match payment id';
    end if;

    if p_projection is null or jsonb_typeof(p_projection) <> 'object' then
        raise exception 'validation: payment provider projection must be an object';
    end if;
    v_kind := p_projection->>'kind';
    if v_kind is null or v_kind not in ('apply', 'quarantine') then
        raise exception 'validation: invalid payment provider projection kind';
    end if;

    if v_kind = 'apply' then
        if not p_projection ?& array[
                'kind', 'paymentStatus', 'stripePaymentIntentId', 'stripeChargeId',
                'stripeChargeBalanceTransactionId', 'actualStripeChargeFeeAmount',
                'actualStripeProcessingFeeAmount', 'actualStripeChargeNetAmount',
                'actualStripeFeeCurrency', 'actualStripeChargeFeeDetails', 'paidAt',
                'cancelledAt', 'lastProviderSyncAt', 'projectionKey',
                'recoveredProjectionKey', 'recovery'
            ]
            or exists (
                select 1
                from jsonb_object_keys(p_projection) as projection_field(key)
                where projection_field.key not in (
                    'kind', 'paymentStatus', 'stripePaymentIntentId', 'stripeChargeId',
                    'stripeChargeBalanceTransactionId', 'actualStripeChargeFeeAmount',
                    'actualStripeProcessingFeeAmount', 'actualStripeChargeNetAmount',
                    'actualStripeFeeCurrency', 'actualStripeChargeFeeDetails', 'paidAt',
                    'cancelledAt', 'lastProviderSyncAt', 'projectionKey',
                    'recoveredProjectionKey', 'recovery'
                )
            )
        then
            raise exception 'validation: invalid apply payment provider projection fields';
        end if;

        v_payment_status := p_projection->>'paymentStatus';
        v_payment_intent_id := p_projection->>'stripePaymentIntentId';
        v_charge_id := p_projection->>'stripeChargeId';
        v_balance_transaction_id := p_projection->>'stripeChargeBalanceTransactionId';
        v_fee_currency := p_projection->>'actualStripeFeeCurrency';
        v_fee_details := p_projection->'actualStripeChargeFeeDetails';
        v_projection_key := nullif(btrim(p_projection->>'projectionKey'), '');
        v_recovered_projection_key := nullif(btrim(p_projection->>'recoveredProjectionKey'), '');
        v_recovery := p_projection->'recovery';

        if v_payment_status is null
            or v_payment_status not in ('created', 'requires_action', 'processing', 'succeeded', 'failed', 'cancelled')
            or v_payment_intent_id is null or v_payment_intent_id not like 'pi_%'
            or (v_charge_id is not null and v_charge_id not like 'ch_%')
            or (v_balance_transaction_id is not null and v_balance_transaction_id not like 'txn_%')
            or (v_fee_currency is not null and v_fee_currency <> 'eur')
            or jsonb_typeof(v_fee_details) <> 'array'
            or jsonb_typeof(p_projection->'actualStripeChargeFeeAmount') <> 'number'
            or (p_projection->>'actualStripeChargeFeeAmount') !~ '^[0-9]+$'
            or jsonb_typeof(p_projection->'actualStripeProcessingFeeAmount') <> 'number'
            or (p_projection->>'actualStripeProcessingFeeAmount') !~ '^-?[0-9]+$'
            or jsonb_typeof(p_projection->'actualStripeChargeNetAmount') not in ('number', 'null')
            or (jsonb_typeof(p_projection->'actualStripeChargeNetAmount') = 'number'
                and (p_projection->>'actualStripeChargeNetAmount') !~ '^-?[0-9]+$')
            or jsonb_typeof(p_projection->'paidAt') not in ('string', 'null')
            or jsonb_typeof(p_projection->'cancelledAt') not in ('string', 'null')
            or jsonb_typeof(p_projection->'lastProviderSyncAt') <> 'string'
            or jsonb_typeof(p_projection->'recoveredProjectionKey') not in ('string', 'null')
            or jsonb_typeof(v_recovery) not in ('object', 'null')
            or v_projection_key is null
        then
            raise exception 'validation: invalid apply payment provider projection';
        end if;
        begin
            v_charge_fee_amount := (p_projection->>'actualStripeChargeFeeAmount')::bigint;
            v_processing_fee_amount := (p_projection->>'actualStripeProcessingFeeAmount')::bigint;
            v_charge_net_amount := (p_projection->>'actualStripeChargeNetAmount')::bigint;
            v_paid_at := (p_projection->>'paidAt')::timestamptz;
            v_cancelled_at := (p_projection->>'cancelledAt')::timestamptz;
            v_provider_synced_at := (p_projection->>'lastProviderSyncAt')::timestamptz;
        exception when others then
            raise exception 'validation: apply payment provider projection contains invalid values';
        end;
        if v_charge_fee_amount not between 0 and 9007199254740991
            or v_processing_fee_amount not between -9007199254740991 and 9007199254740991
            or (v_charge_net_amount is not null
                and v_charge_net_amount not between -9007199254740991 and 9007199254740991)
            or v_provider_synced_at is null
        then
            raise exception 'validation: apply payment provider projection values are out of range';
        end if;

        v_projection_key_pattern := '^payment:' || p_payment_id
            || ':.+:' || v_payment_status
            || ':' || coalesce(v_charge_id, 'none') || ':[0-9a-f]{64}$';
        if v_projection_key !~ v_projection_key_pattern
            or (v_recovered_projection_key is not null
                and v_recovered_projection_key !~ v_projection_key_pattern)
        then
            raise exception 'validation: invalid payment provider projection key';
        end if;

        if jsonb_typeof(v_recovery) = 'object' then
            if not v_recovery ?& array[
                    'exceptionKey', 'paymentIntentId', 'chargeId',
                    'balanceTransactionId', 'actorKind', 'actorId'
                ]
                or exists (
                    select 1
                    from jsonb_object_keys(v_recovery) as recovery_field(key)
                    where recovery_field.key not in (
                        'exceptionKey', 'paymentIntentId', 'chargeId',
                        'balanceTransactionId', 'actorKind', 'actorId'
                    )
                )
            then
                raise exception 'validation: invalid provider truth recovery fields';
            end if;
            v_exception_key := nullif(btrim(v_recovery->>'exceptionKey'), '');
            v_actor_kind := v_recovery->>'actorKind';
            v_actor_id := nullif(btrim(v_recovery->>'actorId'), '');
            if v_exception_key is distinct from (
                    'provider-payment-truth:' || p_payment_id || ':' || v_payment_intent_id
                )
                or v_recovery->>'paymentIntentId' is distinct from v_payment_intent_id
                or v_recovery->>'chargeId' is distinct from v_charge_id
                or v_recovery->>'balanceTransactionId' is distinct from v_balance_transaction_id
                or v_actor_kind is null
                or v_actor_kind not in ('system', 'webhook', 'reconciliation')
                or v_actor_id is null
                or v_recovered_projection_key is null
            then
                raise exception 'validation: invalid provider truth recovery';
            end if;
        elsif v_recovered_projection_key is not null then
            raise exception 'validation: recovered projection key requires provider truth recovery';
        end if;
    else
        if not p_projection ?& array[
                'kind', 'paymentStatus', 'settlementStatus', 'manualReviewReason',
                'stripePaymentIntentId', 'stripeChargeId', 'paidAt',
                'lastProviderSyncAt', 'projectionKey', 'exceptionKey',
                'actorKind', 'actorId', 'details'
            ]
            or exists (
                select 1
                from jsonb_object_keys(p_projection) as projection_field(key)
                where projection_field.key not in (
                    'kind', 'paymentStatus', 'settlementStatus', 'manualReviewReason',
                    'stripePaymentIntentId', 'stripeChargeId', 'paidAt',
                    'lastProviderSyncAt', 'projectionKey', 'exceptionKey',
                    'actorKind', 'actorId', 'details'
                )
            )
        then
            raise exception 'validation: invalid quarantine payment provider projection fields';
        end if;

        v_payment_status := p_projection->>'paymentStatus';
        v_payment_intent_id := p_projection->>'stripePaymentIntentId';
        v_charge_id := p_projection->>'stripeChargeId';
        v_projection_key := nullif(btrim(p_projection->>'projectionKey'), '');
        v_exception_key := nullif(btrim(p_projection->>'exceptionKey'), '');
        v_actor_kind := p_projection->>'actorKind';
        v_actor_id := nullif(btrim(p_projection->>'actorId'), '');
        v_details := p_projection->'details';
        v_manual_review_reason := nullif(btrim(p_projection->>'manualReviewReason'), '');

        if v_payment_status is distinct from 'failed'
            or p_projection->>'settlementStatus' is distinct from 'manual_review'
            or jsonb_typeof(p_projection->'paidAt') <> 'null'
            or jsonb_typeof(p_projection->'lastProviderSyncAt') <> 'string'
            or (v_payment_intent_id is not null and v_payment_intent_id not like 'pi_%')
            or (v_charge_id is not null and v_charge_id not like 'ch_%')
            or v_manual_review_reason is null or length(v_manual_review_reason) > 2000
            or v_projection_key is null or v_exception_key is null
            or v_actor_kind is null
            or v_actor_kind not in ('system', 'webhook', 'reconciliation')
            or v_actor_id is null
            or jsonb_typeof(v_details) <> 'object'
            or not v_details ?& array['paymentIntentId', 'chargeId', 'mismatches']
            or exists (
                select 1
                from jsonb_object_keys(v_details) as detail_field(key)
                where detail_field.key not in ('paymentIntentId', 'chargeId', 'mismatches')
            )
            or nullif(btrim(v_details->>'paymentIntentId'), '') is null
            or (v_details->>'paymentIntentId' <> 'missing'
                and v_details->>'paymentIntentId' not like 'pi_%')
            or (v_details->>'chargeId' is not null and v_details->>'chargeId' not like 'ch_%')
            or jsonb_typeof(v_details->'mismatches') <> 'array'
            or jsonb_array_length(v_details->'mismatches') not between 1 and 32
            or exists (
                select 1
                from jsonb_array_elements(v_details->'mismatches') as mismatch(value)
                where jsonb_typeof(mismatch.value) <> 'string'
                    or nullif(btrim(mismatch.value #>> '{}'), '') is null
                    or length(mismatch.value #>> '{}') > 200
            )
        then
            raise exception 'validation: invalid quarantine payment provider projection';
        end if;
        begin
            v_provider_synced_at := (p_projection->>'lastProviderSyncAt')::timestamptz;
        exception when others then
            raise exception 'validation: quarantine payment provider projection contains invalid values';
        end;
        if v_provider_synced_at is null then
            raise exception 'validation: quarantine provider sync timestamp is required';
        end if;
        select array_agg(mismatch.value #>> '{}' order by mismatch.ordinality)
        into v_mismatches
        from jsonb_array_elements(v_details->'mismatches') with ordinality as mismatch(value, ordinality);
        if v_manual_review_reason is distinct from (
            'Stripe payment provider truth mismatch: ' || array_to_string(v_mismatches, ', ')
        ) then
            raise exception 'validation: quarantine reason does not match provider truth mismatches';
        end if;
        v_provider_payment_intent_id := v_details->>'paymentIntentId';
        if v_exception_key is distinct from (
                'provider-payment-truth:' || p_payment_id || ':' || v_provider_payment_intent_id
            )
        then
            raise exception 'validation: invalid provider truth exception key';
        end if;
        v_projection_key_pattern := 'payment:' || p_payment_id || ':' || v_actor_id || ':quarantine:';
        if left(v_projection_key, length(v_projection_key_pattern)) <> v_projection_key_pattern
            or substring(v_projection_key from length(v_projection_key_pattern) + 1) !~ '^[0-9a-f]{64}$'
        then
            raise exception 'validation: invalid quarantine projection key';
        end if;
    end if;

    select * into v_payment
    from stripe_connect.payments
    where id = p_payment_id
    for no key update;
    if not found then
        raise exception 'not_found: payment';
    end if;
    if v_payment is distinct from v_expected_payment then
        if v_kind <> 'apply'
            or jsonb_typeof(v_recovery) <> 'null'
            or v_recovered_projection_key is not null
            or (to_jsonb(v_payment) - v_apply_mutable_fields)
                is distinct from (to_jsonb(v_expected_payment) - v_apply_mutable_fields)
            or v_payment.payment_status is distinct from v_payment_status
            or v_payment.stripe_payment_intent_id is distinct from v_payment_intent_id
            or v_payment.stripe_charge_id is distinct from v_charge_id
            or v_payment.stripe_charge_balance_transaction_id is distinct from v_balance_transaction_id
            or v_payment.actual_stripe_charge_fee_amount is distinct from v_charge_fee_amount
            or v_payment.actual_stripe_processing_fee_amount is distinct from v_processing_fee_amount
            or v_payment.actual_stripe_charge_net_amount is distinct from v_charge_net_amount
            or v_payment.actual_stripe_fee_currency is distinct from v_fee_currency
            or v_payment.actual_stripe_charge_fee_details is distinct from v_fee_details
            or not (
                (v_payment.paid_at is not distinct from v_paid_at
                    and v_payment.paid_at is not distinct from v_expected_payment.paid_at)
                or (v_payment_status = 'succeeded'
                    and v_expected_payment.paid_at is null
                    and v_payment.paid_at is not null
                    and v_paid_at is not null)
            )
            or not (
                (v_payment.cancelled_at is not distinct from v_cancelled_at
                    and v_payment.cancelled_at is not distinct from v_expected_payment.cancelled_at)
                or (v_payment_status = 'cancelled'
                    and v_expected_payment.cancelled_at is null
                    and v_payment.cancelled_at is not null
                    and v_cancelled_at is not null)
            )
            or not exists (
                select 1
                from stripe_connect.commerce_projection_outbox projection
                where projection.payment_id = p_payment_id
                  and projection.projection_key = v_projection_key
                  and projection.projection_kind = 'payment'
                  and projection.provider_object_id = p_payment_id::text
                  and projection.operation_id is null
                  and projection.recovery_key is null
                  and projection.causal_sequence = 0
            )
        then
            return jsonb_build_object('applied', false, 'payment', to_jsonb(v_payment));
        end if;

        update stripe_connect.payments
        set last_provider_sync_at = greatest(
                v_payment.last_provider_sync_at,
                v_provider_synced_at
            )
        where id = p_payment_id
        returning * into v_payment;
        perform stripe_connect.enqueue_commerce_provider_projection(
            p_payment_id,
            v_projection_key,
            'payment',
            p_payment_id::text
        );
        return jsonb_build_object('applied', true, 'payment', to_jsonb(v_payment));
    end if;

    if v_kind = 'apply' then
        if v_processing_fee_amount is distinct from (
                v_charge_fee_amount + v_payment.actual_stripe_refund_fee_amount
            )
        then
            raise exception 'validation: Stripe processing fee projection is inconsistent';
        end if;
        v_was_transient_review := v_payment.settlement_status = 'manual_review'
            and v_payment.manual_review_reason is not distinct from
                'Stripe payment provider truth mismatch: charge_balance_transaction_expansion';
        if (v_was_transient_review and v_payment_status = 'succeeded')
            is distinct from (jsonb_typeof(v_recovery) = 'object')
        then
            raise exception 'validation: provider truth recovery does not match payment state';
        end if;

        update stripe_connect.payments
        set payment_status = v_payment_status,
            stripe_payment_intent_id = v_payment_intent_id,
            stripe_charge_id = v_charge_id,
            stripe_charge_balance_transaction_id = v_balance_transaction_id,
            actual_stripe_charge_fee_amount = v_charge_fee_amount,
            actual_stripe_processing_fee_amount = v_processing_fee_amount,
            actual_stripe_charge_net_amount = v_charge_net_amount,
            actual_stripe_fee_currency = v_fee_currency,
            actual_stripe_charge_fee_details = v_fee_details,
            paid_at = v_paid_at,
            cancelled_at = v_cancelled_at,
            last_provider_sync_at = greatest(
                v_payment.last_provider_sync_at,
                v_provider_synced_at
            )
        where id = p_payment_id
        returning * into v_payment;
        v_payment_json := to_jsonb(v_payment);

        if jsonb_typeof(v_recovery) = 'object' then
            insert into stripe_connect.provider_exceptions (
                deduplication_key, payment_id, operation_id, exception_type,
                severity, status, message, details, resolved_at, resolved_by
            ) values (
                v_exception_key, p_payment_id, null, 'provider_payment_truth_mismatch',
                'critical', 'open',
                'Stripe payment provider truth mismatch: charge_balance_transaction_expansion',
                jsonb_build_object(
                    'paymentIntentId', v_payment_intent_id,
                    'chargeId', v_charge_id,
                    'mismatches', jsonb_build_array('charge_balance_transaction_expansion')
                ),
                null, null
            ) on conflict (deduplication_key) do update
            set payment_id = excluded.payment_id,
                operation_id = excluded.operation_id,
                exception_type = excluded.exception_type,
                severity = excluded.severity,
                status = excluded.status,
                message = excluded.message,
                details = excluded.details,
                resolved_at = null,
                resolved_by = null;
            v_recovery_result := stripe_connect.recover_transient_provider_truth_review(
                p_payment_id,
                v_recovery->>'paymentIntentId',
                v_recovery->>'chargeId',
                v_recovery->>'balanceTransactionId',
                v_actor_kind,
                v_actor_id
            );
            v_recovered := coalesce((v_recovery_result->>'recovered')::boolean, false);
            v_payment_json := v_recovery_result->'payment';
            if v_recovered then
                v_projection_key := v_recovered_projection_key;
            end if;
        end if;

        perform stripe_connect.enqueue_commerce_provider_projection(
            p_payment_id,
            v_projection_key,
            'payment',
            p_payment_id::text
        );
        return jsonb_build_object('applied', true, 'payment', v_payment_json);
    end if;

    update stripe_connect.payments
    set payment_status = 'failed',
        settlement_status = 'manual_review',
        manual_review_reason = v_manual_review_reason,
        stripe_payment_intent_id = v_payment_intent_id,
        stripe_charge_id = v_charge_id,
        paid_at = null,
        last_provider_sync_at = greatest(
            v_payment.last_provider_sync_at,
            v_provider_synced_at
        )
    where id = p_payment_id
    returning * into v_payment;

    perform stripe_connect.enqueue_commerce_provider_projection(
        p_payment_id,
        v_projection_key,
        'payment',
        p_payment_id::text
    );
    insert into stripe_connect.provider_exceptions (
        deduplication_key, payment_id, operation_id, exception_type,
        severity, status, message, details, resolved_at, resolved_by
    ) values (
        v_exception_key, p_payment_id, null, 'provider_payment_truth_mismatch',
        'critical', 'open', v_manual_review_reason, v_details, null, null
    ) on conflict (deduplication_key) do update
    set payment_id = excluded.payment_id,
        exception_type = excluded.exception_type,
        severity = excluded.severity,
        status = excluded.status,
        message = excluded.message,
        details = excluded.details,
        resolved_at = null,
        resolved_by = null;
    begin
        insert into stripe_connect.payment_events (
            payment_id, event_type, actor_kind, actor_id, data
        ) values (
            p_payment_id, 'provider_payment_truth_mismatch',
            v_actor_kind, v_actor_id, v_details
        );
    exception when others then
        null;
    end;
    return jsonb_build_object('applied', true, 'payment', to_jsonb(v_payment));
end;
$$;