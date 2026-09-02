select commerce_liability_test.seed_order('response-order', 10000);

do $response_contracts$
declare
    v_prepare jsonb;
    v_control jsonb;
    v_pending jsonb;
    v_authorized jsonb;
    v_receipt jsonb;
    v_required bigint;
    v_revision bigint;
    v_authorization_id uuid;
begin
    select preparation into v_prepare
    from commerce_liability_test.orders where label = 'response-order';
    if (select array_agg(key order by key)
        from jsonb_object_keys(v_prepare) keys(key)) is distinct from array[
            'buyerCmsUserId', 'buyerTotalAmount', 'currency', 'deliveryQuoteId',
            'dualApprovalThresholdAmount', 'financialRevision', 'financialTermsHash',
            'merchandiseSubtotalMinorAmount', 'orderId', 'orderNumber', 'orderPublicId',
            'payByAt', 'payoutDelayDays', 'platformLiabilityRevision',
            'platformPayoutChangeDirection', 'platformPayoutDecreaseAuthorizationId',
            'platformRequiredMinimumBalanceAmount', 'platformRetainedAmount',
            'protectionRequired', 'sellerId', 'sellerProceedsAmount',
            'sellerRequiredMinimumBalanceAmount', 'sellerReserveLiabilityAmount',
            'sellerReserveLiabilityDays', 'sellerTransferReleaseAmount', 'shippingAmount'
        ]::text[]
       or (v_prepare->>'sellerRequiredMinimumBalanceAmount')::bigint <> 0
       or v_prepare->>'platformPayoutChangeDirection' <> 'increase' then
        raise exception 'platform liability: prepare response changed: %', v_prepare;
    end if;

    v_control := commerce.refresh_platform_payout_liability(
        'Response contract refresh', null
    );
    if (select array_agg(key order by key)
        from jsonb_object_keys(v_control) keys(key)) is distinct from array[
            'calculatedAt', 'changeDirection', 'decreaseAuthorizationId',
            'decreaseAuthorizedAt', 'lastProviderAppliedAmount',
            'lastProviderAppliedRevision', 'liabilityRevision',
            'requiredMinimumAmount'
        ]::text[] then
        raise exception 'platform liability: control response keys changed: %', v_control;
    end if;
    v_required := (v_control->>'requiredMinimumAmount')::bigint;
    v_revision := (v_control->>'liabilityRevision')::bigint;
    v_receipt := commerce.record_platform_payout_liability_applied(
        v_revision, v_required + 100, null
    );
    if v_receipt is distinct from jsonb_build_object(
        'accepted', true, 'needsReapply', false,
        'liabilityRevision', v_revision,
        'requiredMinimumAmount', v_required,
        'lastProviderAppliedAmount', v_required + 100
    ) then
        raise exception 'platform liability: accepted receipt changed: %', v_receipt;
    end if;

    v_control := commerce.refresh_platform_payout_liability(
        'Response contract decrease', null
    );
    v_pending := commerce.pending_platform_payout_liability_authorizations(
        'response-contract-before-authorization'
    );
    if (select array_agg(key order by key)
        from jsonb_object_keys(v_pending) keys(key))
            is distinct from array['authorizations', 'control', 'runKey']::text[]
       or v_pending->'authorizations' <> '[]'::jsonb then
        raise exception 'platform liability: pending response changed: %', v_pending;
    end if;

    v_authorized := commerce.authorize_platform_payout_liability_decrease(
        (v_control->>'liabilityRevision')::bigint,
        'response-contract-admin', 'Exact response contract'
    );
    v_authorization_id := (v_authorized->>'decreaseAuthorizationId')::uuid;
    v_pending := commerce.pending_platform_payout_liability_authorizations(
        'response-contract-after-authorization'
    );
    if jsonb_array_length(v_pending->'authorizations') <> 1
       or (select array_agg(key order by key)
           from jsonb_object_keys(v_pending->'authorizations'->0) keys(key))
            is distinct from array[
                'changeDirection', 'decreaseAuthorizationId',
                'liabilityRevision', 'requiredMinimumAmount'
            ]::text[] then
        raise exception 'platform liability: authorization response changed: %', v_pending;
    end if;
    v_receipt := commerce.record_platform_payout_liability_applied(
        (v_authorized->>'liabilityRevision')::bigint,
        (v_authorized->>'requiredMinimumAmount')::bigint,
        v_authorization_id
    );
    if v_receipt->>'accepted' <> 'true'
       or v_receipt->>'needsReapply' <> 'false'
       or (select count(*) from jsonb_object_keys(v_receipt)) <> 5 then
        raise exception 'platform liability: authorized receipt changed: %', v_receipt;
    end if;
end;
$response_contracts$;
