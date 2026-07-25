create or replace function commerce.resolve_allocated_marketplace_claim(
    p_claim_id bigint,
    p_outcome text,
    p_merchandise_refund_amount bigint,
    p_shipping_refund_amount bigint,
    p_seller_transfer_amount bigint,
    p_protection_fee_refund_amount bigint,
    p_decision_reason text,
    p_actor_kind text,
    p_actor_id text,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_claim commerce.marketplace_claims%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_buyer_refund_amount bigint;
    v_expected_protection_refund bigint;
    v_expected_seller_recovery bigint;
    v_platform_contribution bigint;
    v_refund jsonb;
    v_existing_refund commerce.refund_requests%rowtype;
    v_has_existing_refund boolean := false;
    v_expected_settlement_status text;
begin
    if p_actor_kind is distinct from 'admin' then
        raise exception 'forbidden: admin claim resolution actor is required';
    end if;
    if p_outcome not in ('buyer', 'seller', 'split', 'return_required') then
        raise exception 'validation: unsupported claim outcome';
    end if;
    if p_merchandise_refund_amount is null or p_merchandise_refund_amount < 0
        or p_shipping_refund_amount is null or p_shipping_refund_amount < 0
        or p_protection_fee_refund_amount is null or p_protection_fee_refund_amount < 0
        or p_seller_transfer_amount is null or p_seller_transfer_amount < 0 then
        raise exception 'validation: claim refund allocations must be non-negative integers';
    end if;
    v_buyer_refund_amount := p_merchandise_refund_amount
        + p_shipping_refund_amount + p_protection_fee_refund_amount;
    if v_buyer_refund_amount > 9007199254740991 then
        raise exception 'validation: claim refund exceeds the safe-integer range';
    end if;
    select * into v_claim
    from commerce.marketplace_claims
    where id = p_claim_id;
    if not found then raise exception 'not_found: claim'; end if;
    select * into v_settlement
    from commerce.order_settlements
    where order_id = v_claim.order_id
    for update;
    if not found then
        raise exception 'conflict: claim resolution requires an order settlement';
    end if;
    select * into v_claim
    from commerce.marketplace_claims
    where id = p_claim_id
    for update;
    select request.* into v_existing_refund
    from commerce.refund_requests request
    where request.claim_id = v_claim.id
      and request.allocation_version = 1
      and request.business_key like 'claim:' || v_claim.id || ':resolution:%'
    order by request.id desc
    limit 1
    for update;
    v_has_existing_refund := found;
    if v_claim.resolution_outcome is not distinct from p_outcome
        and v_claim.resolution_buyer_refund_amount is not distinct from v_buyer_refund_amount
        and v_claim.resolution_seller_transfer_amount is not distinct from p_seller_transfer_amount
        and v_claim.resolution_protection_fee_refund_amount
            is not distinct from p_protection_fee_refund_amount
        and v_claim.decision_reason is not distinct from p_decision_reason
        and v_claim.resolved_by is not distinct from p_actor_id
        and (
            (
                v_buyer_refund_amount = 0
                and not v_has_existing_refund
                and p_merchandise_refund_amount = 0
                and p_shipping_refund_amount = 0
            )
            or (
                v_buyer_refund_amount > 0
                and v_has_existing_refund
                and v_existing_refund.requested_amount = v_buyer_refund_amount
                and v_existing_refund.merchandise_refund_amount = p_merchandise_refund_amount
                and v_existing_refund.shipping_refund_amount = p_shipping_refund_amount
                and v_existing_refund.protection_fee_refund_amount
                    = p_protection_fee_refund_amount
                and v_existing_refund.requested_by_kind = p_actor_kind
                and v_existing_refund.requested_by = p_actor_id
            )
        ) then
        v_refund := case
            when v_has_existing_refund then to_jsonb(v_existing_refund)
            else null
        end;
        return to_jsonb(v_claim) || jsonb_build_object(
            'refundRequest', v_refund,
            'refundAuthorization', case
                when v_refund is null then null
                else commerce.refund_authorization_payload(v_existing_refund.id)
            end
        );
    end if;
    if v_claim.version is distinct from p_expected_version then
        raise exception 'conflict: stale claim version';
    end if;
    if v_claim.status in ('resolved_buyer', 'resolved_seller', 'resolved_split') then
        raise exception 'conflict: claim is already resolved';
    end if;
    if v_claim.status = 'return_required' and p_outcome <> 'return_required'
        and v_claim.return_recipient_handoff_at is null then
        raise exception 'conflict: required return needs trusted recipient handoff before monetary resolution';
    end if;
    if v_claim.status = 'return_required' and p_outcome = 'return_required' then
        raise exception 'conflict: claim is already awaiting the required return';
    end if;
    select * into v_terms
    from commerce.order_financial_terms
    where order_id = v_claim.order_id;
    if not found then
        raise exception 'conflict: claim resolution requires immutable financial terms';
    end if;
    select * into v_protection
    from commerce.protection_policies
    where id = v_terms.protection_policy_id;
    if not found then
        raise exception 'conflict: claim resolution requires an immutable protection policy';
    end if;
    if p_outcome = 'return_required' then
        if v_buyer_refund_amount <> 0 or p_seller_transfer_amount <> 0 then
            raise exception 'validation: return-required resolution cannot authorize money movement';
        end if;
        update commerce.marketplace_claims set
            status = 'return_required',
            resolution_outcome = 'return_required',
            decision_reason = p_decision_reason,
            resolution_buyer_refund_amount = 0,
            resolution_seller_transfer_amount = 0,
            resolution_protection_fee_refund_amount = 0,
            return_ship_by_at = now() + make_interval(hours => v_protection.return_ship_hours),
            return_delivery_status = 'awaiting_carrier',
            resolved_by = p_actor_id,
            version = version + 1,
            updated_at = now()
        where id = v_claim.id and version = p_expected_version
        returning * into v_claim;
        if not found then
            raise exception 'conflict: stale claim version';
        end if;
        update commerce.order_settlements set
            status = 'blocked',
            manual_review_reason = 'marketplace_claim_return_required',
            version = version + 1,
            updated_at = now()
        where order_id = v_claim.order_id and version = v_settlement.version
        returning * into v_settlement;
        if not found then
            raise exception 'conflict: stale settlement version';
        end if;
    else
        if p_merchandise_refund_amount > v_terms.merchandise_subtotal_amount
            or p_shipping_refund_amount > v_terms.shipping_amount
            or v_buyer_refund_amount > v_terms.buyer_total_amount
            or p_seller_transfer_amount < 0
            or p_seller_transfer_amount > v_settlement.authorized_seller_amount
            or p_protection_fee_refund_amount > v_terms.buyer_protection_fee_amount then
            raise exception 'validation: claim resolution exceeds immutable financial terms';
        end if;
        if v_buyer_refund_amount > 0 then
            v_expected_protection_refund :=
                commerce.calculate_allocated_protection_fee_refund(
                    v_claim.order_id,
                    v_buyer_refund_amount,
                    p_merchandise_refund_amount,
                    p_protection_fee_refund_amount
                );
            if p_protection_fee_refund_amount is distinct from v_expected_protection_refund then
                raise exception 'validation: claim protection fee refund does not match the immutable fee policy';
            end if;
        end if;
        if p_outcome = 'buyer' and p_seller_transfer_amount <> 0 then
            raise exception 'validation: buyer resolution cannot authorize a seller transfer';
        end if;
        if p_outcome = 'buyer' and v_buyer_refund_amount = 0 then
            raise exception 'validation: buyer resolution requires a refund';
        end if;
        if p_outcome = 'seller' and (
            v_buyer_refund_amount <> 0
            or p_seller_transfer_amount <> v_settlement.authorized_seller_amount
        ) then
            raise exception 'validation: seller resolution must preserve the immutable seller entitlement';
        end if;
        if p_outcome = 'split' and (
            v_buyer_refund_amount = 0
            or p_seller_transfer_amount <= 0
            or p_seller_transfer_amount >= v_settlement.authorized_seller_amount
        ) then
            raise exception 'validation: split resolution requires both a refund and reduced seller release';
        end if;
        v_expected_seller_recovery := greatest(
            0,
            v_settlement.authorized_seller_amount - p_seller_transfer_amount
        );
        update commerce.marketplace_claims set
            status = case
                when p_outcome = 'seller' then 'resolved_seller'
                else 'resolution_pending'
            end,
            resolution_outcome = p_outcome,
            resolution_buyer_refund_amount = v_buyer_refund_amount,
            resolution_seller_transfer_amount = p_seller_transfer_amount,
            resolution_protection_fee_refund_amount = p_protection_fee_refund_amount,
            decision_reason = p_decision_reason,
            resolved_at = case when p_outcome = 'seller' then now() else null end,
            resolved_by = p_actor_id,
            version = version + 1,
            updated_at = now()
        where id = v_claim.id and version = p_expected_version
        returning * into v_claim;
        if not found then
            raise exception 'conflict: stale claim version';
        end if;
        if v_buyer_refund_amount > 0 then
            v_refund := commerce.create_allocated_refund_request(
                v_claim.order_id,
                v_claim.id,
                'claim:' || v_claim.id || ':resolution:' || p_expected_version,
                'marketplace_claim_' || p_outcome,
                p_merchandise_refund_amount,
                p_shipping_refund_amount,
                p_protection_fee_refund_amount,
                p_actor_kind,
                p_actor_id,
                true
            );
            if (v_refund->>'seller_recovery_amount')::bigint
                is distinct from v_expected_seller_recovery then
                raise exception 'validation: claim allocation does not match the seller transfer decision';
            end if;
            v_platform_contribution := (v_refund->>'requested_amount')::bigint
                - (v_refund->>'protection_fee_refund_amount')::bigint
                - (v_refund->>'seller_recovery_amount')::bigint;
            select * into v_settlement
            from commerce.order_settlements
            where order_id = v_claim.order_id
            for update;
            v_expected_settlement_status := case
                when v_settlement.total_transferred_amount > v_settlement.total_reversed_amount
                  and (v_refund->>'seller_recovery_amount')::bigint
                    > (v_refund->>'seller_reserve_offset_amount')::bigint
                    then 'reversal_pending'
                else 'refund_pending'
            end;
            if v_settlement.status = 'manual_review' then
                update commerce.order_settlements set
                    status = v_expected_settlement_status,
                    manual_review_reason = null,
                    version = version + 1,
                    updated_at = now()
                where order_id = v_claim.order_id and version = v_settlement.version
                returning * into v_settlement;
            elsif v_settlement.status is distinct from v_expected_settlement_status
                or v_settlement.manual_review_reason is not null then
                raise exception 'conflict: claim refund did not transition the settlement';
            end if;
        else
            update commerce.order_settlements
            set status = 'held',
                manual_review_reason = null,
                version = version + 1,
                updated_at = now()
            where order_id = v_claim.order_id and version = v_settlement.version
            returning * into v_settlement;
        end if;
        if v_buyer_refund_amount = 0 and not found then
            raise exception 'conflict: stale settlement version';
        end if;
    end if;
    insert into commerce.marketplace_claim_events (
        claim_id, event_type, actor_kind, actor_id, message, data
    ) values (
        v_claim.id,
        'resolution_decided',
        p_actor_kind,
        p_actor_id,
        p_decision_reason,
        jsonb_build_object(
            'outcome', p_outcome,
            'buyerRefundAmount', v_buyer_refund_amount,
            'merchandiseRefundAmount', p_merchandise_refund_amount,
            'shippingRefundAmount', p_shipping_refund_amount,
            'sellerTransferAmount', p_seller_transfer_amount,
            'platformContributionAmount', coalesce(v_platform_contribution, 0)
        )
    );
    perform commerce.append_financial_event(
        v_claim.order_id,
        'marketplace_claim',
        v_claim.id::text,
        'claim_resolution_decided',
        p_actor_kind,
        p_actor_id,
        p_decision_reason,
        jsonb_build_object('outcome', p_outcome, 'refund', v_refund),
        'commerce.claim.resolution_decided',
        'claim:' || v_claim.id || ':resolution:' || p_expected_version
    );
    return to_jsonb(v_claim) || jsonb_build_object(
        'refundRequest', v_refund,
        'refundAuthorization', case
            when v_refund is null then null
            else commerce.refund_authorization_payload((v_refund->>'id')::bigint)
        end
    );
end;
$$;
