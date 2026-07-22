
grant insert, update on
    commerce.settings,
    commerce.brands,
    commerce.categories,
    commerce.products,
    commerce.product_categories,
    commerce.product_variants,
    commerce.product_variant_axes,
    commerce.product_variant_axis_values,
    commerce.product_variant_selections,
    commerce.media,
    commerce.product_media,
    commerce.sellers,
    commerce.offer_conditions,
    commerce.offer_workflow_states,
    commerce.offer_workflow_transitions,
    commerce.offers,
    commerce.offer_media,
    commerce.offer_price_rules,
    commerce.offer_price_proposals,
    commerce.carts,
    commerce.cart_items,
    commerce.checkout_groups,
    commerce.orders,
    commerce.order_lines,
    commerce.order_payment_attempts,
    commerce.order_fulfillments,
    commerce.order_settlements,
    commerce.marketplace_claims,
    commerce.refund_requests,
    commerce.settlement_release_authorizations,
    commerce.financial_operation_dispatch_claims,
    commerce.stripe_dispute_projections,
    commerce.platform_payout_liability_controls,
    commerce.platform_payout_order_liabilities,
    commerce.platform_payout_order_contributions,
    commerce.platform_payout_liability_revisions,
    commerce.order_cancellation_requests,
    commerce.shipment_creation_operations,
    commerce.shipment_cancellation_operations,
    commerce.delivery_reconciliation_health,
    commerce.delivery_order_reconciliation_health,
    commerce.payment_cancellation_requests,
    commerce.financial_exceptions,
    commerce.seller_financial_exposures,
    commerce.seller_risk_states,
    commerce.outbox_events,
    commerce.custom_field_definitions,
    commerce.category_custom_fields
to service_role;
grant delete on
    commerce.brands,
    commerce.categories,
    commerce.custom_field_definitions,
    commerce.product_variant_axes,
    commerce.product_variant_axis_values,
    commerce.product_variant_selections,
    commerce.product_categories,
    commerce.category_custom_fields,
    commerce.media,
    commerce.product_media,
    commerce.offer_media,
    commerce.cart_items,
    commerce.checkout_groups,
    commerce.platform_payout_liability_pending_orders
to service_role;
grant update on commerce.platform_payout_liability_cache_state to service_role;
grant insert on
    commerce.fee_policies,
    commerce.fee_policy_components,
    commerce.protection_policies,
    commerce.seller_risk_policies,
    commerce.financial_subsidy_overrides,
    commerce.order_financial_terms,
    commerce.seller_verification_events,
    commerce.offer_events,
    commerce.order_events,
    commerce.marketplace_claim_events,
    commerce.marketplace_claim_evidence,
    commerce.marketplace_claim_return_events,
    commerce.provider_projection_events,
    commerce.audit_events,
    commerce.platform_payout_liability_pending_orders
to service_role;
grant usage, select on all sequences in schema commerce to service_role;
grant execute on all functions in schema commerce to service_role;

alter default privileges in schema commerce revoke execute on functions from public;
alter default privileges in schema commerce
    grant select on tables to service_role;
alter default privileges in schema commerce
    grant usage, select on sequences to service_role;
alter default privileges in schema commerce
    grant execute on functions to service_role;