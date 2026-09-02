insert into commerce.fee_policies (
    id, policy_key, version, name, status, currency, shipping_beneficiary,
    estimated_stripe_cost_amount, estimated_carrier_cost_amount,
    platform_risk_reserve_contribution_amount, configured_minimum_margin_amount,
    cost_estimates_configured, subsidy_override, subsidy_reason,
    published_at, created_by, created_at
) values (
    9600000000101, 'c2c-read-baseline', 7, 'C2C read baseline', 'draft', 'eur',
    'platform', 125, 275, 50, 100, true, true, 'Launch subsidy', null,
    'admin-c2c-9', '2026-07-17 09:00+00'
);

insert into commerce.protection_policies (
    id, policy_key, version, name, status, currency, payment_window_minutes,
    seller_handoff_hours, scan_grace_hours, claim_window_hours,
    seller_response_hours, return_ship_hours, finance_review_threshold_amount,
    dual_approval_threshold_amount, published_at, created_by, created_at
) values (
    9600000000201, 'c2c-read-baseline', 7, 'C2C read baseline', 'published',
    'eur', 30, 72, 48, 48, 72, 168, 50000, 100000,
    '2026-07-17 09:05+00', 'admin-c2c-9', '2026-07-17 09:00+00'
);

insert into commerce.seller_risk_policies (
    id, policy_key, version, name, status, currency, reserve_rate_bps,
    payout_delay_days, reserve_liability_days, order_transfer_limit_amount,
    velocity_limit_amount, high_value_review_amount, claim_ratio_review_bps,
    chargeback_ratio_review_bps, published_at, created_by, created_at
) values (
    9600000000301, 'c2c-read-baseline', 7, 'C2C read baseline', 'published',
    'eur', 1000, 14, 120, 500000, 1000000, 50000, 1000, 200,
    '2026-07-17 09:05+00', 'admin-c2c-9', '2026-07-17 09:00+00'
);

insert into commerce.fee_policy_components (
    id, fee_policy_id, component_key, payer, basis, rate_bps, fixed_amount,
    minimum_amount, maximum_amount, rounding_mode, refund_policy, position, created_at
) values
    (9600000001002, 9600000000101, 'buyer_protection', 'buyer',
        'merchandise_and_shipping', 500, 75, null, 2500,
        'round_half_up', 'resolution_defined', 5, '2026-07-17 09:01+00'),
    (9600000001001, 9600000000101, 'seller_commission', 'seller',
        'merchandise', 1000, 50, 100, null,
        'round_half_up', 'never', 5, '2026-07-17 09:01+00');

insert into commerce.financial_subsidy_overrides (
    id, fee_policy_id, maximum_deficit_amount, reason, approved_by, expires_at, created_at
) values
    (9600000001101, 9600000000101, 300, 'Older subsidy', 'admin-c2c-7',
        '2026-08-01 00:00+00', '2026-07-16 09:03+00'),
    (9600000001102, 9600000000101, 450, 'Launch subsidy', 'admin-c2c-11',
        null, '2026-07-17 09:03+00');

update commerce.settings set
    mode = 'marketplace',
    default_currency = 'eur',
    active_c2c_fee_policy_id = 9600000000101,
    active_c2c_protection_policy_id = 9600000000201,
    active_c2c_seller_risk_policy_id = 9600000000301,
    version = 9
where id = 'default';
