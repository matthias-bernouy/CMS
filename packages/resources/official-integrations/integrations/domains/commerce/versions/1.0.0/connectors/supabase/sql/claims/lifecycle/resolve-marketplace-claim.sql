

create or replace function commerce.resolve_marketplace_claim(
    p_claim_id bigint,
    p_outcome text,
    p_buyer_refund_amount bigint,
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
    v_expected_protection_refund bigint;
    v_seller_recovery bigint;
    v_existing_platform_contribution bigint;
    v_platform_contribution bigint;
    v_platform_contribution_cap bigint;
    v_refund jsonb;
begin
    if p_actor_kind is distinct from 'admin' then
        raise exception 'forbidden: admin claim resolution actor is required';
    end if;
    if p_outcome not in ('buyer', 'seller', 'split', 'return_required') then
        raise exception 'validation: unsupported claim outcome';
    end if;
    select * into v_claim from commerce.marketplace_claims where id = p_claim_id;
    if not found then raise exception 'not_found: claim'; end if;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_claim.order_id for update;
    select * into v_claim from commerce.marketplace_claims where id = p_claim_id for update;
    if v_claim.version is distinct from p_expected_version then raise exception 'conflict: stale claim version'; end if;
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
    select * into v_terms from commerce.order_financial_terms where order_id = v_claim.order_id;
    select * into v_protection from commerce.protection_policies where id = v_terms.protection_policy_id;
    if p_outcome = 'return_required' then
        if p_buyer_refund_amount <> 0 or p_seller_transfer_amount <> 0
            or p_protection_fee_refund_amount <> 0 then
            raise exception 'validation: return-required resolution cannot authorize money movement';
        end if;
        update commerce.marketplace_claims set
            status = 'return_required', resolution_outcome = 'return_required',
            decision_reason = p_decision_reason,
            return_ship_by_at = now() + make_interval(hours => v_protection.return_ship_hours),
            return_delivery_status = 'awaiting_carrier',
            resolved_by = p_actor_id
        where id = v_claim.id returning * into v_claim;
    else
        if p_buyer_refund_amount < 0 or p_buyer_refund_amount > v_terms.buyer_total_amount
            or p_seller_transfer_amount < 0
            or p_seller_transfer_amount > v_settlement.authorized_seller_amount
            or p_protection_fee_refund_amount < 0 or p_protection_fee_refund_amount > v_terms.buyer_protection_fee_amount then
            raise exception 'validation: claim resolution exceeds immutable financial terms';
        end if;
        if p_buyer_refund_amount > 0 then
            v_expected_protection_refund := commerce.calculate_protection_fee_refund(
                v_claim.order_id,
                p_buyer_refund_amount,
                p_protection_fee_refund_amount
            );
            if p_protection_fee_refund_amount is distinct from v_expected_protection_refund then
                raise exception 'validation: claim protection fee refund does not match the immutable fee policy';
            end if;
        end if;
        if p_outcome = 'buyer' and p_seller_transfer_amount <> 0 then
            raise exception 'validation: buyer resolution cannot authorize a seller transfer';
        end if;
        if p_protection_fee_refund_amount > p_buyer_refund_amount then
            raise exception 'validation: protection fee refund exceeds buyer refund';
        end if;
        if p_outcome = 'buyer' and p_buyer_refund_amount = 0 then
            raise exception 'validation: buyer resolution requires a refund';
        end if;
        if p_outcome = 'seller' and (
            p_buyer_refund_amount <> 0 or p_protection_fee_refund_amount <> 0
            or p_seller_transfer_amount <> v_settlement.authorized_seller_amount
        ) then
            raise exception 'validation: seller resolution must preserve the immutable seller entitlement';
        end if;
        if p_outcome = 'split' and (
            p_buyer_refund_amount = 0
            or p_seller_transfer_amount <= 0
            or p_seller_transfer_amount >= v_settlement.authorized_seller_amount
        ) then
            raise exception 'validation: split resolution requires both a refund and reduced seller release';
        end if;
        v_seller_recovery := greatest(
            0,
            v_settlement.authorized_seller_amount - p_seller_transfer_amount
        );
        v_platform_contribution := p_buyer_refund_amount
            - v_seller_recovery - p_protection_fee_refund_amount;
        select coalesce(sum(
            requested_amount - protection_fee_refund_amount - seller_recovery_amount
        ), 0)
        into v_existing_platform_contribution
        from commerce.refund_requests
        where order_id = v_claim.order_id
          and status not in ('rejected', 'cancelled', 'failed');
        v_platform_contribution_cap := greatest(
            0,
            v_terms.platform_retained_amount - v_terms.buyer_protection_fee_amount
        );
        if v_platform_contribution < 0 then
            raise exception 'validation: claim refund cannot be lower than seller recovery plus protection fee refund';
        end if;
        if v_existing_platform_contribution + v_platform_contribution
            > v_platform_contribution_cap then
            raise exception 'validation: claim refund exceeds immutable platform contribution';
        end if;
        update commerce.marketplace_claims set
            status = case when p_outcome = 'seller' then 'resolved_seller' else 'resolution_pending' end,
            resolution_outcome = p_outcome,
            resolution_buyer_refund_amount = p_buyer_refund_amount,
            resolution_seller_transfer_amount = p_seller_transfer_amount,
            resolution_protection_fee_refund_amount = p_protection_fee_refund_amount,
            decision_reason = p_decision_reason,
            resolved_at = case when p_outcome = 'seller' then now() else null end,
            resolved_by = p_actor_id
        where id = v_claim.id returning * into v_claim;
        -- The refund request carries the delta from the current locked seller
        -- entitlement. Keep that entitlement and reserve untouched until Stripe confirms
        -- that refund; record_order_settlement_projection then applies the
        -- recovery exactly once. Pre-applying p_seller_transfer_amount here
        -- would double-decrement split/buyer resolutions on provider success.
        update commerce.order_settlements set
            status = case when p_buyer_refund_amount > 0 then 'refund_pending' else 'held' end,
            manual_review_reason = null
        where order_id = v_claim.order_id;
        if p_buyer_refund_amount > 0 then
            v_refund := commerce.create_refund_request(
                v_claim.order_id, v_claim.id,
                'claim:' || v_claim.id || ':resolution:' || p_expected_version,
                'marketplace_claim_' || p_outcome, p_buyer_refund_amount,
                p_protection_fee_refund_amount,
                v_seller_recovery,
                p_actor_kind, p_actor_id, true
            );
        end if;
    end if;
    insert into commerce.marketplace_claim_events (
        claim_id, event_type, actor_kind, actor_id, message, data
    ) values (
        v_claim.id, 'resolution_decided', p_actor_kind, p_actor_id, p_decision_reason,
        jsonb_build_object('outcome', p_outcome, 'buyerRefundAmount', p_buyer_refund_amount,
            'sellerTransferAmount', p_seller_transfer_amount,
            'platformContributionAmount', coalesce(v_platform_contribution, 0))
    );
    perform commerce.append_financial_event(
        v_claim.order_id, 'marketplace_claim', v_claim.id::text, 'claim_resolution_decided',
        p_actor_kind, p_actor_id, p_decision_reason,
        jsonb_build_object('outcome', p_outcome, 'refund', v_refund),
        'commerce.claim.resolution_decided', 'claim:' || v_claim.id || ':resolution:' || p_expected_version
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