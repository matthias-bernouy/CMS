do $missing_receipts$
declare v_order commerce_buyer_legal_test.orders%rowtype;
begin
    select * into strict v_order from commerce_buyer_legal_test.orders where label = 'missing';
    begin
        perform commerce.prepare_protected_payment(v_order.order_id, v_order.buyer_cms_user_id);
        raise exception 'test: payment without receipts passed';
    exception when others then
        if sqlerrm <> 'conflict: CONSENT_RECEIPTS_REQUIRED' then raise; end if;
    end;
    perform commerce_buyer_legal_test.assert_true(
        not exists (select 1 from commerce.order_payment_attempts where order_id = v_order.order_id)
        and not exists (select 1 from commerce.platform_payout_order_liabilities where order_id = v_order.order_id),
        'failed consent gate must leave no payment or liability reservation');
end;
$missing_receipts$;

do $operation_binding$
declare v_order commerce_buyer_legal_test.orders%rowtype; v_receipts jsonb; v_case jsonb;
begin
    select * into strict v_order from commerce_buyer_legal_test.orders where label = 'mismatch';
    v_receipts := commerce_buyer_legal_test.receipts(v_order.order_id);
    for v_case in select value from jsonb_array_elements(jsonb_build_array(
        jsonb_set(v_receipts, '{0,cmsUserId}', '"other-buyer"'),
        jsonb_set(v_receipts, '{0,operationKey}', '"other-operation"'),
        jsonb_set(v_receipts, '{0,metadata,orderId}', '9999'),
        jsonb_set(v_receipts, '{0,metadata,checkoutGroupId}', '"other-checkout"'),
        jsonb_set(v_receipts, '{0,metadata,paymentProvider}', '"other-provider"')
    )) loop
        begin
            perform commerce.prepare_protected_payment(v_order.order_id, v_order.buyer_cms_user_id, 'stripe', gen_random_uuid(), v_case);
            raise exception 'test: mismatched receipt passed';
        exception when others then
            if sqlerrm <> 'conflict: consent receipt does not match payment operation' then raise; end if;
        end;
    end loop;
    perform commerce_buyer_legal_test.assert_true(
        not exists (select 1 from commerce.order_consent_acceptances where order_id = v_order.order_id),
        'rejected operation identities must leave no evidence');
end;
$operation_binding$;

do $required_and_retry$
declare v_order commerce_buyer_legal_test.orders%rowtype; v_receipts jsonb; v_first jsonb; v_retry jsonb; v_changed jsonb;
begin
    select * into strict v_order from commerce_buyer_legal_test.orders where label = 'required';
    v_receipts := commerce_buyer_legal_test.receipts(v_order.order_id);
    v_first := commerce.prepare_protected_payment(v_order.order_id, v_order.buyer_cms_user_id, 'stripe', gen_random_uuid(), v_receipts);
    v_retry := commerce.prepare_protected_payment(v_order.order_id, v_order.buyer_cms_user_id, 'stripe', gen_random_uuid(), v_receipts);
    perform commerce_buyer_legal_test.assert_true(
        v_first->>'paymentAttemptId' = v_retry->>'paymentAttemptId'
        and v_first->>'financialTermsHash' = v_order.financial_terms_hash
        and jsonb_array_length(v_first->'buyerLegalAcceptances') = 3
        and (select count(*) from commerce.order_consent_acceptances where order_id = v_order.order_id) = 3,
        'retry must preserve financial terms and reuse the three immutable context links');
    v_changed := jsonb_set(v_receipts, '{0,documents,0,contentHash}', to_jsonb(repeat('c',64)));
    begin
        perform commerce.prepare_protected_payment(v_order.order_id, v_order.buyer_cms_user_id, 'stripe', gen_random_uuid(), v_changed);
        raise exception 'test: changed receipt passed';
    exception when others then
        if sqlerrm <> 'conflict: payment consent evidence changed' then raise; end if;
    end;
    perform commerce.record_order_payment_projection(v_order.public_id, 'evt-consent-contract', 810001, 'created',
        (v_first->>'buyerTotalAmount')::bigint, 'eur', v_order.financial_terms_hash, now(), '{}'::jsonb);
    v_retry := commerce.prepare_protected_payment(v_order.order_id, v_order.buyer_cms_user_id);
    perform commerce_buyer_legal_test.assert_true(
        v_retry->>'paymentAttemptId' = v_first->>'paymentAttemptId'
        and jsonb_array_length(v_retry->'buyerLegalAcceptances') = 3
        and (commerce.get_buyer_consent_context(v_order.order_id, v_order.buyer_cms_user_id, 'stripe')->>'requiresConsent')::boolean = false,
        'provider-created retry must use the original proof without new policy evaluation');
    insert into commerce_buyer_legal_test.state values ('prepared', v_first);
end;
$required_and_retry$;

do $disabled_and_negotiated$
declare v_order commerce_buyer_legal_test.orders%rowtype; v_prepared jsonb; v_context jsonb;
begin
    select * into strict v_order from commerce_buyer_legal_test.orders where label = 'disabled';
    v_prepared := commerce.prepare_protected_payment(v_order.order_id, v_order.buyer_cms_user_id, 'stripe', gen_random_uuid(), commerce_buyer_legal_test.receipts(v_order.order_id, false));
    perform commerce_buyer_legal_test.assert_true(v_prepared->'buyerLegalAcceptances' = '[]'::jsonb,
        'disabled policies must yield no fabricated acceptance proof');
    select * into strict v_order from commerce_buyer_legal_test.orders where label = 'negotiated';
    v_context := commerce.get_buyer_consent_context(v_order.order_id, v_order.buyer_cms_user_id, 'stripe');
    perform commerce_buyer_legal_test.assert_true(v_context->'contexts' ? 'negotiated_offer',
        'agreement checkout must use its own consent context');
    v_prepared := commerce.prepare_protected_payment(v_order.order_id, v_order.buyer_cms_user_id, 'stripe', gen_random_uuid(), commerce_buyer_legal_test.receipts(v_order.order_id));
    perform commerce_buyer_legal_test.assert_true(v_prepared->>'financialTermsHash' = v_order.financial_terms_hash
        and exists (select 1 from commerce.order_consent_acceptances where order_id = v_order.order_id and context_key = 'negotiated_offer'),
        'negotiated payment must preserve its financial terms and operation proof');
end;
$disabled_and_negotiated$;
