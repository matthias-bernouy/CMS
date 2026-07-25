

create or replace function commerce.process_due_order_deadlines(
    p_run_key text,
    p_limit integer default 25
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_candidate record;
    v_attempt commerce.order_payment_attempts%rowtype;
    v_review jsonb;
    v_payment_cancellation jsonb;
    v_events jsonb := '[]'::jsonb;
    v_limit integer;
    v_processed integer := 0;
begin
    if p_run_key is null or length(btrim(p_run_key)) = 0 then
        raise exception 'validation: deadline run key is required';
    end if;
    v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);

    -- Expiration is a provider cancellation saga. Missing, failed, created,
    -- requires-action, and processing attempts all retain inventory until a
    -- Stripe `canceled` projection is durably attached.
    for v_candidate in
        select order_row.id, order_row.public_id, settlement.status settlement_status,
               exception.detected_at exception_checked_at
        from commerce.orders order_row
        join commerce.order_financial_terms terms on terms.order_id = order_row.id
        join commerce.order_settlements settlement on settlement.order_id = order_row.id
        left join commerce.financial_exceptions exception
          on exception.deduplication_key = 'deadline:payment:' || order_row.id
        where order_row.status = 'awaiting_payment'
          and terms.pay_by_at <= now()
          and (
              settlement.status <> 'manual_review'
              or (
                  settlement.manual_review_reason = 'payment_deadline_provider_truth_required'
                  and (
                      exception.detected_at is null
                      or exception.detected_at <= now() - interval '5 minutes'
                  )
              )
          )
        order by coalesce(exception.detected_at, terms.pay_by_at), order_row.id
        limit v_limit - v_processed
        for update of order_row, settlement skip locked
    loop
        select * into v_attempt
        from commerce.order_payment_attempts attempt
        where attempt.order_id = v_candidate.id
        order by attempt.created_at desc
        limit 1;
        if v_attempt.status = 'succeeded' then
            update commerce.order_settlements set
                status = 'manual_review', manual_review_reason = 'payment_deadline_late_success_projection',
                version = version + 1, updated_at = now()
            where order_id = v_candidate.id;
            insert into commerce.financial_exceptions (
                deduplication_key, order_id, kind, severity, reason, details
            ) values (
                'deadline:payment:' || v_candidate.id,
                v_candidate.id, 'payment_mismatch', 'critical',
                'Payment deadline worker found a succeeded attempt on an order not activated by its projection',
                jsonb_build_object('runKey', p_run_key, 'paymentStatus', v_attempt.status)
            ) on conflict (deduplication_key) where deduplication_key is not null do update set
                status = 'open', details = excluded.details;
            v_events := v_events || jsonb_build_array(jsonb_build_object(
                'kind', 'payment_deadline', 'orderId', v_candidate.id,
                'orderPublicId', v_candidate.public_id, 'outcome', 'manual_review'
            ));
        else
            v_payment_cancellation := commerce.ensure_payment_cancellation_request(
                v_candidate.id, 'expired', 'Protected payment window expired',
                'deadline-worker:' || p_run_key, null
            );
            if v_payment_cancellation->>'status' = 'completed' then
                update commerce.financial_exceptions set
                    status = 'resolved', resolved_at = now(), resolved_by = 'deadline-worker:' || p_run_key
                where deduplication_key = 'deadline:payment:' || v_candidate.id and status <> 'resolved';
            else
                update commerce.order_settlements set
                    status = 'blocked', manual_review_reason = 'payment_deadline_provider_cancellation_pending',
                    version = version + 1, updated_at = now()
                where order_id = v_candidate.id;
                insert into commerce.financial_exceptions (
                    deduplication_key, order_id, kind, severity, reason, details
                ) values (
                    'deadline:payment:' || v_candidate.id,
                    v_candidate.id, 'payment_mismatch', 'high',
                    'Payment deadline elapsed; provider cancellation must be confirmed before inventory restoration',
                    jsonb_build_object('runKey', p_run_key,
                        'paymentStatus', coalesce(v_attempt.status, 'missing'),
                        'paymentCancellationRequestId', v_payment_cancellation->>'paymentCancellationRequestId')
                ) on conflict (deduplication_key) where deduplication_key is not null do update set
                    status = 'open', detected_at = now(), resolved_at = null, resolved_by = null,
                    details = commerce.financial_exceptions.details || excluded.details;
            end if;
            v_events := v_events || jsonb_build_array(jsonb_build_object(
                'kind', 'payment_deadline', 'orderId', v_candidate.id,
                'orderPublicId', v_candidate.public_id,
                'outcome', case when v_payment_cancellation->>'status' = 'completed'
                    then 'expired' else 'provider_cancellation_pending' end,
                'paymentCancellationAuthorization', v_payment_cancellation
            ));
        end if;
        v_processed := v_processed + 1;
        exit when v_processed >= v_limit;
    end loop;

    -- A buyer cancellation after label creation may be auto-approved only
    -- after the scan grace period and only while both seller handoff and
    -- trusted carrier acceptance are still absent under the same row locks.
    if v_processed < v_limit then
        for v_candidate in
            select request.id, request.order_id
            from commerce.order_cancellation_requests request
            join commerce.orders order_row on order_row.id = request.order_id
            join commerce.order_fulfillments fulfillment on fulfillment.order_id = request.order_id
            where request.status = 'requested'
              and request.requested_by_kind = 'buyer'
              and fulfillment.status in ('awaiting_shipment', 'label_created')
              and fulfillment.payment_confirmed_at is not null
              and fulfillment.scan_grace_deadline <= now()
              and fulfillment.seller_handoff_declared_at is null
              and fulfillment.carrier_accepted_at is null
            order by fulfillment.scan_grace_deadline, request.id
            limit v_limit - v_processed
            for update of request, order_row, fulfillment skip locked
        loop
            v_review := commerce.review_order_cancellation_as(
                v_candidate.id, 'approved', 'system', 'deadline-worker:' || p_run_key,
                'Buyer cancellation auto-approved after scan grace without seller handoff or carrier acceptance'
            );
            v_events := v_events || jsonb_build_array(jsonb_build_object(
                'kind', 'cancellation_scan_grace', 'orderId', v_candidate.order_id,
                'cancellationRequestId', v_candidate.id,
                'outcome', v_review->>'status'
            ));
            v_processed := v_processed + 1;
            exit when v_processed >= v_limit;
        end loop;
    end if;

    -- The seller handoff deadline and carrier scan grace are separate facts.
    -- Missing seller declaration at the first deadline blocks new shipment
    -- work, but keeps the settlement held and permits a trusted carrier scan
    -- to recover the order during the remaining grace period.
    if v_processed < v_limit then
        for v_candidate in
            select order_row.id, order_row.public_id,
                   fulfillment.seller_handoff_deadline,
                   fulfillment.scan_grace_deadline
            from commerce.orders order_row
            join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
            join commerce.order_settlements settlement on settlement.order_id = order_row.id
            where order_row.status = 'active'
              and fulfillment.payment_confirmed_at is not null
              and fulfillment.status in (
                  'awaiting_shipment', 'shipment_creating', 'label_created'
              )
              and fulfillment.seller_handoff_deadline <= now()
              and fulfillment.scan_grace_deadline > now()
              and fulfillment.seller_handoff_declared_at is null
              and fulfillment.carrier_accepted_at is null
              and fulfillment.blocking_reason is null
              and settlement.status = 'held'
              and not exists (
                  select 1 from commerce.order_cancellation_requests request
                  where request.order_id = order_row.id
                    and request.status in (
                        'requested', 'approved', 'refund_pending', 'manual_review'
                    )
              )
              and not exists (
                  select 1 from commerce.financial_exceptions financial_exception
                  where financial_exception.deduplication_key =
                      'deadline:seller-handoff:' || order_row.id
              )
            order by fulfillment.seller_handoff_deadline, order_row.id
            limit v_limit - v_processed
            for update of order_row, fulfillment, settlement skip locked
        loop
            update commerce.order_fulfillments set
                blocking_reason = 'seller_handoff_deadline_elapsed_without_declaration',
                version = version + 1,
                updated_at = now()
            where order_id = v_candidate.id;
            insert into commerce.financial_exceptions (
                deduplication_key, order_id, kind, severity, reason, details
            ) values (
                'deadline:seller-handoff:' || v_candidate.id,
                v_candidate.id, 'fulfillment_ambiguity', 'medium',
                'Seller handoff deadline elapsed without declaration or trusted carrier acceptance',
                jsonb_build_object(
                    'runKey', p_run_key,
                    'sellerHandoffDeadline', v_candidate.seller_handoff_deadline,
                    'scanGraceDeadline', v_candidate.scan_grace_deadline
                )
            ) on conflict (deduplication_key) where deduplication_key is not null do nothing;
            perform commerce.append_financial_event(
                v_candidate.id, 'fulfillment', v_candidate.id::text,
                'seller_handoff_deadline_elapsed', 'system',
                'deadline-worker:' || p_run_key, null,
                jsonb_build_object(
                    'sellerHandoffDeadline', v_candidate.seller_handoff_deadline,
                    'scanGraceDeadline', v_candidate.scan_grace_deadline
                ),
                'commerce.order.seller_handoff_deadline_elapsed',
                'deadline:seller-handoff:' || v_candidate.id
            );
            v_events := v_events || jsonb_build_array(jsonb_build_object(
                'kind', 'fulfillment_seller_handoff',
                'orderId', v_candidate.id,
                'orderPublicId', v_candidate.public_id,
                'outcome', 'blocked_until_carrier_scan'
            ));
            v_processed := v_processed + 1;
            exit when v_processed >= v_limit;
        end loop;
    end if;

    -- Missing scans without an eligible cancellation never imply a refund.
    -- They block release and enter the exception queue for carrier recovery.
    if v_processed < v_limit then
        for v_candidate in
            select order_row.id, order_row.public_id
            from commerce.orders order_row
            join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
            join commerce.order_settlements settlement on settlement.order_id = order_row.id
            where order_row.status = 'active'
              and fulfillment.payment_confirmed_at is not null
              and fulfillment.status in (
                  'awaiting_shipment', 'shipment_creating', 'label_created',
                  'seller_handoff_declared'
              )
              and fulfillment.scan_grace_deadline <= now()
              and fulfillment.carrier_accepted_at is null
              and settlement.status not in ('manual_review', 'refunded', 'reversed')
              and not exists (
                  select 1 from commerce.order_cancellation_requests request
                  where request.order_id = order_row.id
                    and request.status in ('requested', 'approved', 'refund_pending', 'manual_review')
              )
            order by fulfillment.scan_grace_deadline, order_row.id
            limit v_limit - v_processed
            for update of order_row, fulfillment, settlement skip locked
        loop
            update commerce.order_fulfillments set
                status = 'manual_review', blocking_reason = 'scan_grace_elapsed_without_carrier_acceptance',
                version = version + 1, updated_at = now()
            where order_id = v_candidate.id;
            update commerce.order_settlements set
                status = 'manual_review', manual_review_reason = 'fulfillment_reconciliation_required',
                version = version + 1, updated_at = now()
            where order_id = v_candidate.id;
            update commerce.financial_exceptions set
                status = 'resolved',
                resolved_at = now(),
                resolved_by = 'deadline-worker:' || p_run_key,
                details = details || jsonb_build_object(
                    'escalatedTo', 'scan_grace_elapsed_without_carrier_acceptance'
                )
            where deduplication_key = 'deadline:seller-handoff:' || v_candidate.id
              and status <> 'resolved';
            insert into commerce.financial_exceptions (
                deduplication_key, order_id, kind, severity, reason, details
            ) values (
                'deadline:fulfillment:' || v_candidate.id,
                v_candidate.id, 'fulfillment_ambiguity', 'high',
                'Scan grace elapsed without trusted carrier acceptance',
                jsonb_build_object('runKey', p_run_key)
            ) on conflict (deduplication_key) where deduplication_key is not null do update set
                status = 'open', detected_at = now(), resolved_at = null, resolved_by = null,
                details = commerce.financial_exceptions.details || excluded.details;
            perform commerce.append_financial_event(
                v_candidate.id, 'fulfillment', v_candidate.id::text, 'scan_grace_manual_review',
                'system', 'deadline-worker:' || p_run_key, null, '{}'::jsonb,
                'commerce.order.fulfillment_deadline_review',
                'deadline:fulfillment:' || v_candidate.id || ':manual-review'
            );
            v_events := v_events || jsonb_build_array(jsonb_build_object(
                'kind', 'fulfillment_scan_grace', 'orderId', v_candidate.id,
                'orderPublicId', v_candidate.public_id, 'outcome', 'manual_review'
            ));
            v_processed := v_processed + 1;
            exit when v_processed >= v_limit;
        end loop;
    end if;

    -- Missing seller evidence or an expired return is a manual-review fact,
    -- never an automatic monetary decision or admission of fault.
    if v_processed < v_limit then
        for v_candidate in
            select claim.id, claim.order_id, claim.status, claim.version,
                   case
                       when claim.status = 'awaiting_seller_response' then 'seller_response_deadline'
                       else 'return_ship_deadline'
                   end deadline_kind
            from commerce.marketplace_claims claim
            where (claim.status = 'awaiting_seller_response' and claim.seller_response_by_at <= now())
               or (claim.status = 'return_required' and claim.return_ship_by_at <= now())
            order by least(claim.seller_response_by_at, coalesce(claim.return_ship_by_at, claim.seller_response_by_at)), claim.id
            limit v_limit - v_processed
            for update of claim skip locked
        loop
            update commerce.marketplace_claims set
                status = 'under_review', version = version + 1, updated_at = now()
            where id = v_candidate.id;
            insert into commerce.marketplace_claim_events (
                claim_id, event_type, actor_kind, actor_id, message,
                data
            ) values (
                v_candidate.id, v_candidate.deadline_kind, 'system',
                'deadline-worker:' || p_run_key,
                'Deadline elapsed; manual review is required before any financial decision',
                jsonb_build_object('previousStatus', v_candidate.status)
            );
            perform commerce.append_financial_event(
                v_candidate.order_id, 'marketplace_claim', v_candidate.id::text,
                'claim_' || v_candidate.deadline_kind,
                'system', 'deadline-worker:' || p_run_key, null,
                jsonb_build_object('previousStatus', v_candidate.status),
                'commerce.claim.deadline_review',
                'deadline:claim:' || v_candidate.id || ':' || v_candidate.deadline_kind
            );
            v_events := v_events || jsonb_build_array(jsonb_build_object(
                'kind', v_candidate.deadline_kind, 'orderId', v_candidate.order_id,
                'claimId', v_candidate.id, 'outcome', 'under_review'
            ));
            v_processed := v_processed + 1;
            exit when v_processed >= v_limit;
        end loop;
    end if;

    return jsonb_build_object(
        'runKey', p_run_key,
        'processed', v_processed,
        'events', v_events
    );
end;
$$;
