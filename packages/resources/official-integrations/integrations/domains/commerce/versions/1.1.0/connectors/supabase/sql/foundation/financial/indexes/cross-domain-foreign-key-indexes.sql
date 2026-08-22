

create index if not exists financial_exceptions_order_idx
    on commerce.financial_exceptions(order_id);
create index if not exists financial_operation_dispatch_claims_order_idx
    on commerce.financial_operation_dispatch_claims(order_id);
create index if not exists order_financial_terms_subsidy_idx
    on commerce.order_financial_terms(subsidy_override_id);
create index if not exists outbox_events_order_idx
    on commerce.outbox_events(order_id);
create index if not exists payment_cancellations_order_request_idx
    on commerce.payment_cancellation_requests(order_cancellation_request_id);
create index if not exists payout_liability_revisions_prospective_order_idx
    on commerce.platform_payout_liability_revisions(included_prospective_order_id);
create index if not exists seller_financial_exposures_order_idx
    on commerce.seller_financial_exposures(order_id);
create index if not exists settings_c2c_fee_policy_idx
    on commerce.settings(active_c2c_fee_policy_id);
create index if not exists settings_c2c_protection_policy_idx
    on commerce.settings(active_c2c_protection_policy_id);
create index if not exists settings_c2c_risk_policy_idx
    on commerce.settings(active_c2c_seller_risk_policy_id);
create index if not exists shipment_cancellation_operations_order_idx
    on commerce.shipment_cancellation_operations(order_id);