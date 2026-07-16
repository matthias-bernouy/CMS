\set ON_ERROR_STOP on

begin;
set local role service_role;

do $$
begin
    begin
        perform commerce.create_c2c_policy_revision(
            jsonb_build_object(
                'name', 'Unsafe capped fee policy',
                'costEstimatesConfigured', true,
                'estimatedStripeCostAmount', 500,
                'estimatedCarrierCostAmount', 0,
                'configuredMinimumMarginAmount', 0,
                'buyerFeeFixedAmount', 1000,
                'buyerFeeMaximumAmount', 100,
                'sellerFeeFixedAmount', 0,
                'sellerFeeRefundPolicy', 'never'
            ),
            'finance-unsafe-cap-smoke',
            (select version from commerce.settings where id = 'default')
        );
        raise exception 'smoke: fixed fee above its maximum was published';
    exception when others then
        if sqlerrm = 'smoke: fixed fee above its maximum was published'
            or sqlerrm <> 'validation: fee fixed amount cannot exceed its maximum amount' then raise; end if;
    end;
end;
$$;

select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Dual approval smoke policy',
        'costEstimatesConfigured', false,
        'subsidyOverride', true,
        'subsidyReason', 'Smoke test zero-deficit subsidy',
        'subsidyMaximumDeficitAmount', 0,
        'financeReviewThresholdAmount', 5000,
        'dualApprovalThresholdAmount', 8000,
        'highValueReviewAmount', 500000
    ),
    'finance-policy-smoke',
    (select version from commerce.settings where id = 'default')
);

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name, verification_status, verified_at, verified_by
) values (
    'user', 'approval-seller', 'approval-seller', 'Approval seller',
    'verified', now(), 'smoke-admin'
) returning id as seller_id \gset

insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'approval-buyer', 'approval-checkout', left(encode(extensions.digest('approval-checkout', 'sha256'), 'hex'), 32)
) returning id as checkout_group_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'APPROVAL-SMOKE-1', :'checkout_group_id', :seller_id, 'approval-buyer',
    'eur', 120000, 120000, 'approval-checkout', left(encode(extensions.digest('approval-checkout', 'sha256'), 'hex'), 32)
) returning id as order_id, public_id as order_public_id, version as order_version \gset

select result->>'financial_terms_hash' as terms_hash,
    (result->>'buyer_total_amount')::bigint as buyer_total
from (select commerce.lock_order_financial_terms(
    :'order_public_id', 'approval-buyer', 'approval-quote', 0, 'eur',
    :order_version, 'delivery-smoke'
) result) locked \gset

select commerce.record_order_payment_projection(
    :'order_public_id', 'evt-approval-payment', 901, 'succeeded',
    :buyer_total, 'eur', :'terms_hash', now(), '{}', 'ch_approval', 'pi_approval'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
begin
    select * into v_order from commerce.orders where order_number = 'APPROVAL-SMOKE-1';
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    begin
        perform commerce.record_order_payment_projection(
            v_order.public_id, 'evt-approval-payment', 901, 'succeeded',
            v_terms.buyer_total_amount - 1, 'eur', v_terms.financial_terms_hash,
            now(), '{}', 'ch_approval', 'pi_approval'
        );
        raise exception 'smoke: mismatched provider replay was accepted';
    exception when others then
        if sqlerrm = 'smoke: mismatched provider replay was accepted'
            or sqlerrm <> 'conflict: provider event replay changed canonical payload' then raise; end if;
    end;
end;
$$;

do $$
declare
    v_order_id bigint;
    v_prior jsonb;
    v_request jsonb;
    v_first jsonb;
    v_final jsonb;
    v_batch jsonb;
    v_mismatch jsonb;
begin
    select id into v_order_id from commerce.orders where order_number = 'APPROVAL-SMOKE-1';
    v_prior := commerce.request_order_refund(
        v_order_id, 'first split remedy', 4000, 'support', 'support-smoke'
    );
    if v_prior->>'status' <> 'approved'
        or (v_prior->>'dual_approval_required')::boolean is true then
        raise exception 'smoke: first sub-threshold refund was not policy-approved';
    end if;
    update commerce.refund_requests set status = 'succeeded'
    where id = (v_prior->>'id')::bigint;
    v_request := commerce.request_order_refund(
        v_order_id, 'cumulative high-value support remedy', 5000, 'support', 'support-smoke'
    );
    if v_request->>'status' <> 'requested'
        or (v_request->>'dual_approval_required')::boolean is not true
        or (v_request->>'seller_recovery_amount')::bigint <> 5000 then
        raise exception 'smoke: cumulative refund thresholds were not applied';
    end if;
    v_first := commerce.review_refund_request(
        (v_request->>'id')::bigint, 'approved', 'finance-one', 'first approval',
        (v_request->>'version')::integer
    );
    if v_first->>'status' <> 'requested' or v_first->>'first_approved_by' <> 'finance-one' then
        raise exception 'smoke: first approval became executable';
    end if;
    begin
        perform commerce.review_refund_request(
            (v_request->>'id')::bigint, 'approved', 'finance-one', 'duplicate actor',
            (v_first->>'version')::integer
        );
        raise exception 'smoke: one actor completed dual approval';
    exception when others then
        if sqlerrm = 'smoke: one actor completed dual approval'
            or sqlerrm <> 'forbidden: dual approval requires a second finance actor' then raise; end if;
    end;
    v_final := commerce.review_refund_request(
        (v_request->>'id')::bigint, 'approved', 'finance-two', 'second approval',
        (v_first->>'version')::integer
    );
    if v_final->>'status' <> 'approved' or v_final->>'second_approved_by' <> 'finance-two' then
        raise exception 'smoke: second approval did not authorize refund';
    end if;
    v_batch := commerce.pending_order_refund_authorizations('dual-refund-smoke', 25);
    if jsonb_array_length(v_batch->'authorizations') <> 1
        or (v_batch->'authorizations'->0->>'requiresDualApproval')::boolean is not true then
        raise exception 'smoke: approved refund was not dispatched exactly once';
    end if;
    v_mismatch := commerce.record_order_payment_projection(
        (select public_id from commerce.orders where id = v_order_id),
        'evt-payment-quarantine', 902, 'succeeded',
        (select buyer_total_amount - 1 from commerce.order_financial_terms where order_id = v_order_id),
        'eur', (select financial_terms_hash from commerce.order_financial_terms where order_id = v_order_id),
        now(), '{}', 'ch_quarantine', 'pi_quarantine'
    );
    if v_mismatch->>'status' <> 'manual_review'
        or not exists (select 1 from commerce.financial_exceptions
            where order_id = v_order_id and kind = 'payment_mismatch') then
        raise exception 'smoke: provider mismatch was not quarantined durably';
    end if;
end;
$$;

rollback;
