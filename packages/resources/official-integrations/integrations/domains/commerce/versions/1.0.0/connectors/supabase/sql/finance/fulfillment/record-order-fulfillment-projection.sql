

create or replace function commerce.record_order_fulfillment_projection(
    p_order_public_id uuid,
    p_provider_event_id text,
    p_normalized_status text,
    p_occurred_at timestamptz,
    p_provider_reference text default null,
    p_recipient_handoff_at timestamptz default null,
    p_carrier_accepted_at timestamptz default null,
    p_seller_handoff_declared_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_event_id bigint;
    v_current_rank integer;
    v_next_rank integer;
    v_blocking boolean;
    v_projection_observed_at timestamptz;
    v_handoff_timestamp_anomalous boolean;
    v_terminal_occurred_at timestamptz;
    v_refund jsonb;
begin
    if p_normalized_status not in (
        'label_created', 'seller_handoff_declared', 'carrier_accepted', 'in_transit',
        'arrived_at_pickup_point', 'available_for_pickup', 'collected_by_recipient',
        'incident', 'lost', 'pickup_expired', 'returning_to_sender',
        'returned_to_sender', 'cancelled'
    ) then raise exception 'validation: unsupported normalized fulfillment status'; end if;
    select * into v_order from commerce.orders where public_id = p_order_public_id for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_fulfillment from commerce.order_fulfillments
    where order_id = v_order.id for update;
    if not found then raise exception 'conflict: order fulfillment is not initialized'; end if;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id for update;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    select * into v_protection from commerce.protection_policies where id = v_terms.protection_policy_id;
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id for update;
    v_event_id := commerce.claim_provider_projection_event(
        'delivery', p_provider_event_id, v_order.id,
        'fulfillment.' || p_normalized_status, p_occurred_at,
        jsonb_strip_nulls(jsonb_build_object(
            'providerReference', p_provider_reference,
            'recipientHandoffAt', p_recipient_handoff_at,
            'carrierAcceptedAt', p_carrier_accepted_at,
            'sellerHandoffDeclaredAt', p_seller_handoff_declared_at
        ))
    );
    if v_event_id is null then
        return to_jsonb(v_fulfillment) || jsonb_build_object('idempotentReplay', true);
    end if;
    if v_fulfillment.status = 'cancelled' and p_normalized_status in (
        'carrier_accepted', 'in_transit', 'arrived_at_pickup_point',
        'available_for_pickup', 'collected_by_recipient', 'lost',
        'pickup_expired', 'returning_to_sender', 'returned_to_sender'
    ) then
        update commerce.order_fulfillments set
            status = 'manual_review', blocking_reason = 'late_carrier_scan_after_cancellation',
            provider_reference = coalesce(nullif(p_provider_reference, ''), provider_reference),
            carrier_accepted_at = coalesce(carrier_accepted_at, p_carrier_accepted_at, p_occurred_at),
            version = version + 1, updated_at = now()
        where order_id = v_order.id returning * into v_fulfillment;
        update commerce.order_settlements set
            status = 'manual_review', manual_review_reason = 'late_carrier_scan_after_cancellation',
            version = version + 1, updated_at = now()
        where order_id = v_order.id and status not in ('refunded', 'reversed');
        insert into commerce.financial_exceptions (
            deduplication_key, order_id, kind, severity, reason, details
        ) values (
            'late-carrier-scan:' || p_provider_event_id, v_order.id,
            'fulfillment_ambiguity', 'critical',
            'Carrier accepted or advanced a shipment after local cancellation',
            jsonb_build_object('providerEventId', p_provider_event_id,
                'normalizedStatus', p_normalized_status, 'occurredAt', p_occurred_at)
        ) on conflict (deduplication_key) where deduplication_key is not null do update set
            status = 'open', details = excluded.details;
        return to_jsonb(v_fulfillment) || jsonb_build_object(
            'order_public_id', v_order.public_id, 'lateCarrierScan', true,
            'idempotentReplay', false
        );
    end if;
    if v_fulfillment.status in (
        'collected_by_recipient', 'lost', 'returned_to_sender', 'cancelled'
    ) and v_fulfillment.status <> p_normalized_status then
        select max(event.occurred_at) into v_terminal_occurred_at
        from commerce.provider_projection_events event
        where event.authority = 'delivery' and event.order_id = v_order.id
          and event.event_type = 'fulfillment.' || v_fulfillment.status;
        if v_terminal_occurred_at is not null and p_occurred_at <= v_terminal_occurred_at then
            perform commerce.append_financial_event(
                v_order.id, 'fulfillment', v_order.id::text,
                'fulfillment_stale_event_ignored', 'provider', 'delivery',
                'Older carrier event arrived after a terminal fulfillment projection',
                jsonb_build_object(
                    'providerEventId', p_provider_event_id,
                    'normalizedStatus', p_normalized_status,
                    'occurredAt', p_occurred_at,
                    'terminalStatus', v_fulfillment.status,
                    'terminalOccurredAt', v_terminal_occurred_at
                ),
                'commerce.order.fulfillment_stale_ignored',
                'delivery:' || p_provider_event_id || ':stale-ignored'
            );
            return to_jsonb(v_fulfillment) || jsonb_build_object(
                'order_public_id', v_order.public_id,
                'ignoredStaleEvent', true, 'idempotentReplay', false
            );
        end if;
        update commerce.order_fulfillments set
            status = 'manual_review',
            blocking_reason = 'contradictory_carrier_event_after_terminal',
            provider_reference = coalesce(nullif(p_provider_reference, ''), provider_reference),
            version = version + 1, updated_at = now()
        where order_id = v_order.id returning * into v_fulfillment;
        update commerce.order_settlements set
            status = 'manual_review',
            manual_review_reason = 'contradictory_carrier_event_after_terminal',
            version = version + 1, updated_at = now()
        where order_id = v_order.id and status not in ('refunded', 'reversed');
        insert into commerce.financial_exceptions (
            deduplication_key, order_id, kind, severity, reason, details
        ) values (
            'terminal-carrier-contradiction:' || p_provider_event_id,
            v_order.id, 'fulfillment_ambiguity', 'critical',
            'A newer or unanchored carrier event contradicted terminal fulfillment truth',
            jsonb_build_object(
                'providerEventId', p_provider_event_id,
                'normalizedStatus', p_normalized_status,
                'occurredAt', p_occurred_at,
                'terminalOccurredAt', v_terminal_occurred_at
            )
        ) on conflict (deduplication_key) where deduplication_key is not null do update set
            status = 'open', details = excluded.details;
        return to_jsonb(v_fulfillment) || jsonb_build_object(
            'order_public_id', v_order.public_id,
            'manualReview', true, 'idempotentReplay', false
        );
    end if;
    v_current_rank := case v_fulfillment.status
        when 'awaiting_shipment' then 0 when 'label_created' then 10
        when 'seller_handoff_declared' then 20 when 'carrier_accepted' then 30
        when 'in_transit' then 40 when 'arrived_at_pickup_point' then 50
        when 'available_for_pickup' then 60 when 'collected_by_recipient' then 70
        else 0 end;
    v_next_rank := case p_normalized_status
        when 'label_created' then 10 when 'seller_handoff_declared' then 20
        when 'carrier_accepted' then 30 when 'in_transit' then 40
        when 'arrived_at_pickup_point' then 50 when 'available_for_pickup' then 60
        when 'collected_by_recipient' then 70 else v_current_rank end;
    v_blocking := p_normalized_status in (
        'incident', 'lost', 'pickup_expired', 'returning_to_sender', 'returned_to_sender', 'cancelled'
    );
    if not v_blocking and v_next_rank < v_current_rank then
        raise exception 'conflict: fulfillment state cannot regress';
    end if;
    if p_normalized_status = 'label_created' and v_order.status <> 'active' then
        raise exception 'conflict: shipment label requires a confirmed protected payment';
    end if;
    if p_normalized_status = 'collected_by_recipient' and p_recipient_handoff_at is null then
        raise exception 'validation: trusted recipient handoff timestamp is required';
    end if;
    v_projection_observed_at := clock_timestamp();
    v_handoff_timestamp_anomalous := p_normalized_status = 'collected_by_recipient'
        and (
            p_recipient_handoff_at > v_projection_observed_at + interval '5 minutes'
            or p_occurred_at > v_projection_observed_at + interval '5 minutes'
            or p_recipient_handoff_at > p_occurred_at + interval '5 minutes'
            or v_fulfillment.blocking_reason = 'recipient_handoff_timestamp_anomaly'
        );
    update commerce.order_fulfillments set
        status = case when v_handoff_timestamp_anomalous
            then 'manual_review' else p_normalized_status end,
        provider_reference = coalesce(nullif(p_provider_reference, ''), provider_reference),
        seller_handoff_declared_at = case when p_normalized_status = 'seller_handoff_declared'
            then coalesce(p_seller_handoff_declared_at, p_occurred_at) else seller_handoff_declared_at end,
        carrier_accepted_at = case when v_next_rank >= 30
            then coalesce(carrier_accepted_at, p_carrier_accepted_at, p_occurred_at) else carrier_accepted_at end,
        arrived_at_pickup_point_at = case when v_next_rank >= 50
            then coalesce(arrived_at_pickup_point_at, p_occurred_at) else arrived_at_pickup_point_at end,
        available_for_pickup_at = case when v_next_rank >= 60
            then coalesce(available_for_pickup_at, p_occurred_at) else available_for_pickup_at end,
        recipient_handoff_at = case when p_normalized_status = 'collected_by_recipient'
            then coalesce(recipient_handoff_at, p_recipient_handoff_at) else recipient_handoff_at end,
        recipient_handoff_first_observed_at = case
            when p_normalized_status = 'collected_by_recipient'
            then coalesce(recipient_handoff_first_observed_at, v_projection_observed_at)
            else recipient_handoff_first_observed_at end,
        claim_window_started_at = case
            when p_normalized_status = 'collected_by_recipient'
            then coalesce(claim_window_started_at,
                greatest(p_recipient_handoff_at, v_projection_observed_at))
            else claim_window_started_at end,
        claim_by_at = case when p_normalized_status = 'collected_by_recipient'
            then coalesce(claim_by_at,
                greatest(p_recipient_handoff_at, v_projection_observed_at)
                    + make_interval(hours => v_protection.claim_window_hours))
            else claim_by_at end,
        release_eligible_at = case when p_normalized_status = 'collected_by_recipient'
            then coalesce(release_eligible_at,
                greatest(p_recipient_handoff_at, v_projection_observed_at)
                    + make_interval(hours => v_protection.claim_window_hours))
            else release_eligible_at end,
        blocking_reason = case
            when v_handoff_timestamp_anomalous then 'recipient_handoff_timestamp_anomaly'
            when v_blocking then p_normalized_status
            when blocking_reason = 'seller_handoff_deadline_elapsed_without_declaration'
                and v_next_rank < 30
            then blocking_reason
            else null end,
        version = version + 1,
        updated_at = now()
    where order_id = v_order.id returning * into v_fulfillment;
    if v_blocking then
        update commerce.order_settlements set
            status = case when p_normalized_status = 'returned_to_sender'
                then 'manual_review' else 'blocked' end,
            manual_review_reason = 'fulfillment_' || p_normalized_status
        where order_id = v_order.id and status not in ('released', 'refunded', 'reversed');
    end if;
    if p_normalized_status = 'lost' then
        v_refund := commerce.create_cancellation_refund_request(
            v_order.id,
            'fulfillment:lost:' || p_provider_event_id,
            'carrier_confirmed_lost',
            'system',
            'delivery'
        );
    elsif p_normalized_status = 'returned_to_sender' then
        insert into commerce.financial_exceptions (
            deduplication_key, order_id, kind, severity, reason, details
        ) values (
            'returned-to-sender:' || p_provider_event_id,
            v_order.id,
            'fulfillment_ambiguity',
            'warning',
            'Returned shipment requires an allocated refund decision',
            jsonb_build_object(
                'providerEventId', p_provider_event_id,
                'providerReference', p_provider_reference,
                'occurredAt', p_occurred_at,
                'requiredAllocations', jsonb_build_array(
                    'merchandiseRefundAmount',
                    'shippingRefundAmount',
                    'protectionFeeRefundAmount'
                )
            )
        ) on conflict (deduplication_key) where deduplication_key is not null do update set
            status = 'open', details = excluded.details;
    end if;
    if v_handoff_timestamp_anomalous then
        update commerce.order_settlements set
            status = 'manual_review',
            manual_review_reason = 'recipient_handoff_timestamp_anomaly'
        where order_id = v_order.id and status not in ('released', 'refunded', 'reversed');
        insert into commerce.financial_exceptions (
            deduplication_key, order_id, kind, severity, reason, details
        ) values (
            'fulfillment-handoff-timestamp:' || p_provider_event_id,
            v_order.id, 'fulfillment_ambiguity', 'critical',
            'Recipient handoff timestamp is inconsistent with the provider event or database clock',
            jsonb_build_object(
                'providerEventId', p_provider_event_id,
                'providerOccurredAt', p_occurred_at,
                'recipientHandoffAt', p_recipient_handoff_at,
                'firstObservedAt', v_projection_observed_at
            )
        ) on conflict (deduplication_key) where deduplication_key is not null do update set
            status = 'open', details = excluded.details;
    end if;
    if v_next_rank >= 30 and not v_handoff_timestamp_anomalous then
        update commerce.financial_exceptions set
            status = 'resolved',
            resolved_at = now(),
            resolved_by = 'trusted-carrier-acceptance',
            details = details || jsonb_build_object(
                'resolvedByProviderEventId', p_provider_event_id,
                'carrierAcceptedAt', v_fulfillment.carrier_accepted_at
            )
        where deduplication_key = 'deadline:seller-handoff:' || v_order.id
          and status <> 'resolved';
    end if;
    perform commerce.append_financial_event(
        v_order.id, 'fulfillment', v_order.id::text, 'fulfillment_' || p_normalized_status,
        'provider', 'delivery', null,
        jsonb_build_object('providerEventId', p_provider_event_id, 'occurredAt', p_occurred_at),
        'commerce.order.fulfillment_projection', 'delivery:' || p_provider_event_id
    );
    return to_jsonb(v_fulfillment) || jsonb_build_object(
        'order_public_id', v_order.public_id,
        'refundRequest', v_refund,
        'idempotentReplay', false
    );
end;
$$;
