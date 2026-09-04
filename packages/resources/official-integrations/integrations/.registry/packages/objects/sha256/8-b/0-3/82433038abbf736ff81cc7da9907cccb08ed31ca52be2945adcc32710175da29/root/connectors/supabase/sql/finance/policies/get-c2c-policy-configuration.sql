

create or replace function commerce.get_c2c_policy_configuration_read_model()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce((
        select jsonb_build_object(
            'state', 'ok',
            'settings', jsonb_build_object(
                'id', settings.id,
                'mode', settings.mode,
                'default_currency', settings.default_currency,
                'active_c2c_fee_policy_id', settings.active_c2c_fee_policy_id,
                'active_c2c_protection_policy_id', settings.active_c2c_protection_policy_id,
                'active_c2c_seller_risk_policy_id', settings.active_c2c_seller_risk_policy_id,
                'version', settings.version,
                'updated_at', settings.updated_at
            ),
            'fee_policy', (
                select jsonb_build_object(
                    'id', fee.id,
                    'policy_key', fee.policy_key,
                    'version', fee.version,
                    'name', fee.name,
                    'status', fee.status,
                    'currency', fee.currency,
                    'shipping_beneficiary', fee.shipping_beneficiary,
                    'estimated_stripe_cost_amount', fee.estimated_stripe_cost_amount,
                    'estimated_carrier_cost_amount', fee.estimated_carrier_cost_amount,
                    'platform_risk_reserve_contribution_amount',
                        fee.platform_risk_reserve_contribution_amount,
                    'configured_minimum_margin_amount', fee.configured_minimum_margin_amount,
                    'cost_estimates_configured', fee.cost_estimates_configured,
                    'subsidy_override', fee.subsidy_override,
                    'subsidy_reason', fee.subsidy_reason,
                    'published_at', fee.published_at,
                    'created_by', fee.created_by,
                    'created_at', fee.created_at
                )
                from commerce.fee_policies fee
                where fee.id = settings.active_c2c_fee_policy_id
            ),
            'protection_policy', (
                select jsonb_build_object(
                    'id', protection.id,
                    'policy_key', protection.policy_key,
                    'version', protection.version,
                    'name', protection.name,
                    'status', protection.status,
                    'currency', protection.currency,
                    'payment_window_minutes', protection.payment_window_minutes,
                    'seller_handoff_hours', protection.seller_handoff_hours,
                    'scan_grace_hours', protection.scan_grace_hours,
                    'claim_window_hours', protection.claim_window_hours,
                    'seller_response_hours', protection.seller_response_hours,
                    'return_ship_hours', protection.return_ship_hours,
                    'finance_review_threshold_amount',
                        protection.finance_review_threshold_amount,
                    'dual_approval_threshold_amount', protection.dual_approval_threshold_amount,
                    'published_at', protection.published_at,
                    'created_by', protection.created_by,
                    'created_at', protection.created_at
                )
                from commerce.protection_policies protection
                where protection.id = settings.active_c2c_protection_policy_id
            ),
            'seller_risk_policy', (
                select jsonb_build_object(
                    'id', risk.id,
                    'policy_key', risk.policy_key,
                    'version', risk.version,
                    'name', risk.name,
                    'status', risk.status,
                    'currency', risk.currency,
                    'reserve_rate_bps', risk.reserve_rate_bps,
                    'payout_delay_days', risk.payout_delay_days,
                    'reserve_liability_days', risk.reserve_liability_days,
                    'order_transfer_limit_amount', risk.order_transfer_limit_amount,
                    'velocity_limit_amount', risk.velocity_limit_amount,
                    'high_value_review_amount', risk.high_value_review_amount,
                    'claim_ratio_review_bps', risk.claim_ratio_review_bps,
                    'chargeback_ratio_review_bps', risk.chargeback_ratio_review_bps,
                    'published_at', risk.published_at,
                    'created_by', risk.created_by,
                    'created_at', risk.created_at
                )
                from commerce.seller_risk_policies risk
                where risk.id = settings.active_c2c_seller_risk_policy_id
            ),
            'components', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', component.id,
                    'fee_policy_id', component.fee_policy_id,
                    'component_key', component.component_key,
                    'payer', component.payer,
                    'basis', component.basis,
                    'rate_bps', component.rate_bps,
                    'fixed_amount', component.fixed_amount,
                    'minimum_amount', component.minimum_amount,
                    'maximum_amount', component.maximum_amount,
                    'rounding_mode', component.rounding_mode,
                    'refund_policy', component.refund_policy,
                    'position', component.position,
                    'created_at', component.created_at
                ) order by component.position, component.id)
                from commerce.fee_policy_components component
                where component.fee_policy_id = settings.active_c2c_fee_policy_id
            ), '[]'::jsonb),
            'subsidy_overrides', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', subsidy.id,
                    'fee_policy_id', subsidy.fee_policy_id,
                    'maximum_deficit_amount', subsidy.maximum_deficit_amount,
                    'reason', subsidy.reason,
                    'approved_by', subsidy.approved_by,
                    'expires_at', subsidy.expires_at,
                    'created_at', subsidy.created_at
                ) order by subsidy.created_at desc)
                from commerce.financial_subsidy_overrides subsidy
                where subsidy.fee_policy_id = settings.active_c2c_fee_policy_id
            ), '[]'::jsonb)
        )
        from commerce.settings settings
        where settings.id = 'default'
    ), jsonb_build_object('state', 'settings_missing'));
$$;

revoke execute on function commerce.get_c2c_policy_configuration_read_model()
from public, anon, authenticated;
grant execute on function commerce.get_c2c_policy_configuration_read_model()
to service_role;