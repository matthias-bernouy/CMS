

create or replace function commerce.record_claim_return_delivery(
    p_claim_id bigint,
    p_provider_event_id text,
    p_provider_reference text,
    p_normalized_status text,
    p_occurred_at timestamptz,
    p_provider_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_claim commerce.marketplace_claims%rowtype;
    v_existing commerce.marketplace_claim_return_events%rowtype;
begin
    if p_normalized_status not in (
        'carrier_accepted', 'in_transit', 'arrived_at_pickup_point', 'available_for_pickup',
        'recipient_handoff', 'pickup_expired', 'returning_to_sender', 'returned_to_sender',
        'incident', 'lost'
    ) then
        raise exception 'validation: unsupported claim return delivery status';
    end if;
    if p_occurred_at is null or p_occurred_at > now() + interval '5 minutes' then
        raise exception 'validation: invalid claim return event timestamp';
    end if;
    select * into v_existing from commerce.marketplace_claim_return_events
    where provider_event_id = p_provider_event_id;
    if found then
        if v_existing.claim_id is distinct from p_claim_id
            or v_existing.provider_reference is distinct from p_provider_reference
            or v_existing.normalized_status is distinct from p_normalized_status
            or v_existing.occurred_at is distinct from p_occurred_at
            or v_existing.provider_evidence is distinct from coalesce(p_provider_evidence, '{}'::jsonb) then
            raise exception 'conflict: claim return provider event replay mismatch';
        end if;
        select * into v_claim from commerce.marketplace_claims where id = p_claim_id;
        return to_jsonb(v_claim) || jsonb_build_object('idempotentReplay', true);
    end if;
    select * into v_claim from commerce.marketplace_claims where id = p_claim_id for update;
    if not found then raise exception 'not_found: claim'; end if;
    if v_claim.status not in ('return_required', 'under_review')
        or v_claim.resolution_outcome <> 'return_required' then
        raise exception 'conflict: claim is not awaiting a required return';
    end if;
    insert into commerce.marketplace_claim_return_events (
        claim_id, provider_event_id, provider_reference, normalized_status,
        occurred_at, provider_evidence
    ) values (
        v_claim.id, p_provider_event_id, p_provider_reference, p_normalized_status,
        p_occurred_at, coalesce(p_provider_evidence, '{}'::jsonb)
    );
    update commerce.marketplace_claims set
        return_delivery_status = case
            when p_normalized_status = 'recipient_handoff' then 'recipient_handoff'
            when return_delivery_status = 'recipient_handoff' then return_delivery_status
            else p_normalized_status end,
        return_provider_reference = p_provider_reference,
        return_carrier_accepted_at = coalesce(
            return_carrier_accepted_at,
            case when p_normalized_status in ('carrier_accepted', 'recipient_handoff') then p_occurred_at end
        ),
        return_recipient_handoff_at = coalesce(
            return_recipient_handoff_at,
            case when p_normalized_status = 'recipient_handoff' then p_occurred_at end
        )
    where id = v_claim.id returning * into v_claim;
    insert into commerce.marketplace_claim_events (
        claim_id, event_type, actor_kind, actor_id, data
    ) values (
        v_claim.id, 'return_delivery_' || p_normalized_status, 'system', 'delivery-provider',
        jsonb_build_object('providerEventId', p_provider_event_id,
            'providerReference', p_provider_reference, 'occurredAt', p_occurred_at)
    );
    perform commerce.append_financial_event(
        v_claim.order_id, 'marketplace_claim', v_claim.id::text,
        'claim_return_delivery_' || p_normalized_status,
        'system', 'delivery-provider', null,
        jsonb_build_object('providerEventId', p_provider_event_id,
            'providerReference', p_provider_reference, 'occurredAt', p_occurred_at),
        'commerce.claim.return_delivery', 'claim-return:' || p_provider_event_id
    );
    return to_jsonb(v_claim) || jsonb_build_object('idempotentReplay', false);
end;
$$;