select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Buyer legal acceptance contract policy',
        'costEstimatesConfigured', true,
        'estimatedStripeCostAmount', 50,
        'estimatedCarrierCostAmount', 100,
        'platformRiskReserveContributionAmount', 50,
        'configuredMinimumMarginAmount', 100,
        'buyerFeeFixedAmount', 500,
        'sellerFeeRateBps', 500,
        'sellerReserveRateBps', 1000,
        'payoutDelayDays', 14,
        'reserveLiabilityDays', 120,
        'highValueReviewAmount', 500000,
        'claimRatioReviewBps', 10000
    ),
    'buyer-legal-contract-admin',
    (select version from commerce.settings where id = 'default')
);

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name,
    verification_status, verified_at, verified_by
) values (
    'user',
    'buyer-legal-contract-seller',
    'buyer-legal-contract-seller',
    'Buyer legal contract seller',
    'verified',
    now(),
    'buyer-legal-contract-admin'
);

insert into commerce.products (slug, title, status, visibility)
values (
    'buyer-legal-negotiated-product',
    'Buyer legal negotiated product',
    'active',
    'public'
);

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code,
    publication_status, workflow_state, accepted_price_amount,
    currency, availability, quantity_available, inventory_revision
) select
    seller.id,
    product.id,
    'buyer-legal-negotiated-offer',
    'Buyer legal negotiated offer',
    'very_good',
    'active',
    'approved',
    11000,
    'eur',
    'available',
    1,
    1
from commerce.sellers seller
cross join commerce.products product
where seller.slug = 'buyer-legal-contract-seller'
  and product.slug = 'buyer-legal-negotiated-product';

select commerce_buyer_legal_test.seed_order(label) from unnest(array['missing','required','disabled','mismatch']) label;
select commerce_buyer_legal_test.seed_order('negotiated', true);
