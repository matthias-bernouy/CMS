do $negotiated_public_flow$
declare v_offer commerce.offers%rowtype; v_agreement jsonb; v_checkout jsonb; v_order commerce.orders%rowtype;
    v_terms jsonb; v_prepared jsonb;
begin
    select * into strict v_offer from commerce.offers where slug = 'buyer-legal-negotiated-offer';
    v_agreement := commerce.register_price_agreement('buyer-legal-contract', 'negotiated-public-flow', 1,
        v_offer.id, 'buyer-legal-contract-seller', 'legal-buyer-negotiated-public', 12000, 'eur', 1, now() + interval '1 hour');
    v_checkout := commerce.create_order_from_price_agreement('legal-buyer-negotiated-public',
        'buyer-legal-negotiated-public-checkout', (v_agreement->>'public_id')::uuid);
    select * into strict v_order from commerce.orders where id = (v_checkout->>'id')::bigint;
    perform commerce_buyer_legal_test.assert_true(v_offer.accepted_price_amount = 11000
        and v_order.subtotal_amount = 12000 and v_order.checkout_group_id is not null
        and (select unit_amount from commerce.order_lines where order_id = v_order.id) = 12000,
        'public agreement checkout must preserve listing price and use the agreed amount');
    v_terms := commerce.lock_order_financial_terms(v_order.public_id, v_order.buyer_cms_user_id,
        'buyer-legal-negotiated-public-quote', 0, 'eur', v_order.version, 'buyer-legal-contract');
    v_prepared := commerce.prepare_protected_payment(v_order.id, v_order.buyer_cms_user_id, 'stripe',
        gen_random_uuid(), commerce_buyer_legal_test.receipts(v_order.id));
    perform commerce_buyer_legal_test.assert_true((v_prepared->>'merchandiseSubtotalMinorAmount')::bigint = 12000
        and v_prepared->>'financialTermsHash' = v_terms->>'financial_terms_hash'
        and exists (select 1 from commerce.order_consent_acceptances where order_id = v_order.id
            and checkout_group_id = v_order.checkout_group_id and context_key = 'negotiated_offer'),
        'public negotiated checkout must pass the same operation-bound payment consent gate');
end;
$negotiated_public_flow$;
