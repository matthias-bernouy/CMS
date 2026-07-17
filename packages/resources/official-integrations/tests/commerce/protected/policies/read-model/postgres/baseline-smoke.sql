\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir c2c.fixture.sql

create function pg_temp.jsonb_keys(p_value jsonb)
returns text[] language sql immutable as $$
    select coalesce(array_agg(key order by key), array[]::text[])
    from jsonb_object_keys(p_value) key;
$$;

do $$
declare
    v_settings jsonb;
    v_fee jsonb;
    v_protection jsonb;
    v_risk jsonb;
    v_components jsonb;
    v_subsidies jsonb;
begin
    select jsonb_build_object(
        'id', settings.id,
        'mode', settings.mode,
        'default_currency', settings.default_currency,
        'active_c2c_fee_policy_id', settings.active_c2c_fee_policy_id,
        'active_c2c_protection_policy_id', settings.active_c2c_protection_policy_id,
        'active_c2c_seller_risk_policy_id', settings.active_c2c_seller_risk_policy_id,
        'version', settings.version,
        'updated_at', settings.updated_at
    ) into v_settings from commerce.settings settings where settings.id = 'default';
    select to_jsonb(fee) into v_fee from commerce.fee_policies fee
    where fee.id = 9600000000101;
    select to_jsonb(protection) into v_protection from commerce.protection_policies protection
    where protection.id = 9600000000201;
    select to_jsonb(risk) into v_risk from commerce.seller_risk_policies risk
    where risk.id = 9600000000301;
    select coalesce(jsonb_agg(to_jsonb(component) order by component.position, component.id), '[]')
    into v_components from commerce.fee_policy_components component
    where component.fee_policy_id = 9600000000101;
    select coalesce(jsonb_agg(to_jsonb(subsidy) order by subsidy.created_at desc), '[]')
    into v_subsidies from commerce.financial_subsidy_overrides subsidy
    where subsidy.fee_policy_id = 9600000000101;

    if pg_temp.jsonb_keys(v_settings) <> array[
        'active_c2c_fee_policy_id', 'active_c2c_protection_policy_id',
        'active_c2c_seller_risk_policy_id', 'default_currency',
        'id', 'mode', 'updated_at', 'version'
    ] or (v_settings->>'version')::integer <> 9 then
        raise exception 'C2C policy baseline: settings projection changed';
    end if;
    if pg_temp.jsonb_keys(v_fee) <> array[
        'configured_minimum_margin_amount', 'cost_estimates_configured',
        'created_at', 'created_by', 'currency', 'estimated_carrier_cost_amount',
        'estimated_stripe_cost_amount', 'id', 'name',
        'platform_risk_reserve_contribution_amount', 'policy_key', 'published_at',
        'shipping_beneficiary', 'status', 'subsidy_override', 'subsidy_reason', 'version'
    ] or v_fee->'published_at' <> 'null'::jsonb then
        raise exception 'C2C policy baseline: fee projection/null changed';
    end if;
    if pg_temp.jsonb_keys(v_protection) <> array[
        'claim_window_hours', 'created_at', 'created_by', 'currency',
        'dual_approval_threshold_amount', 'finance_review_threshold_amount',
        'id', 'name', 'payment_window_minutes', 'policy_key', 'published_at',
        'return_ship_hours', 'scan_grace_hours', 'seller_handoff_hours',
        'seller_response_hours', 'status', 'version'
    ] then raise exception 'C2C policy baseline: protection projection changed'; end if;
    if pg_temp.jsonb_keys(v_risk) <> array[
        'chargeback_ratio_review_bps', 'claim_ratio_review_bps', 'created_at',
        'created_by', 'currency', 'high_value_review_amount', 'id', 'name',
        'order_transfer_limit_amount', 'payout_delay_days', 'policy_key',
        'published_at', 'reserve_liability_days', 'reserve_rate_bps', 'status',
        'velocity_limit_amount', 'version'
    ] then raise exception 'C2C policy baseline: risk projection changed'; end if;
    if pg_temp.jsonb_keys(v_components->0) <> array[
        'basis', 'component_key', 'created_at', 'fee_policy_id', 'fixed_amount',
        'id', 'maximum_amount', 'minimum_amount', 'payer', 'position', 'rate_bps',
        'refund_policy', 'rounding_mode'
    ] or (select array_agg((item->>'id')::bigint)
        from jsonb_array_elements(v_components) item)
        <> array[9600000001001, 9600000001002]::bigint[]
        or v_components->0->'maximum_amount' <> 'null'::jsonb
        or v_components->1->'minimum_amount' <> 'null'::jsonb then
        raise exception 'C2C policy baseline: component projection/order/null changed';
    end if;
    if pg_temp.jsonb_keys(v_subsidies->0) <> array[
        'approved_by', 'created_at', 'expires_at', 'fee_policy_id',
        'id', 'maximum_deficit_amount', 'reason'
    ] or (select array_agg((item->>'id')::bigint)
        from jsonb_array_elements(v_subsidies) item)
        <> array[9600000001102, 9600000001101]::bigint[]
        or v_subsidies->0->'expires_at' <> 'null'::jsonb then
        raise exception 'C2C policy baseline: subsidy projection/order/null changed';
    end if;
end;
$$;

rollback;
