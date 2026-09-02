\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir c2c.fixture.sql

do $$
declare
    v_actual jsonb;
    v_expected jsonb;
begin
    select commerce.get_c2c_policy_configuration_read_model() into v_actual;
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
            select to_jsonb(fee) from commerce.fee_policies fee
            where fee.id = settings.active_c2c_fee_policy_id
        ),
        'protection_policy', (
            select to_jsonb(protection) from commerce.protection_policies protection
            where protection.id = settings.active_c2c_protection_policy_id
        ),
        'seller_risk_policy', (
            select to_jsonb(risk) from commerce.seller_risk_policies risk
            where risk.id = settings.active_c2c_seller_risk_policy_id
        ),
        'components', coalesce((
            select jsonb_agg(to_jsonb(component) order by component.position, component.id)
            from commerce.fee_policy_components component
            where component.fee_policy_id = settings.active_c2c_fee_policy_id
        ), '[]'::jsonb),
        'subsidy_overrides', coalesce((
            select jsonb_agg(to_jsonb(subsidy) order by subsidy.created_at desc)
            from commerce.financial_subsidy_overrides subsidy
            where subsidy.fee_policy_id = settings.active_c2c_fee_policy_id
        ), '[]'::jsonb)
    ) into v_expected
    from commerce.settings settings
    where settings.id = 'default';

    if v_actual is distinct from v_expected then
        raise exception 'C2C policy read model changed the six-query projection';
    end if;
    if (select array_agg((item->>'id')::bigint)
        from jsonb_array_elements(v_actual->'components') item)
        <> array[9600000001001, 9600000001002]::bigint[] then
        raise exception 'C2C policy read model changed component order';
    end if;
    if (select array_agg((item->>'id')::bigint)
        from jsonb_array_elements(v_actual->'subsidy_overrides') item)
        <> array[9600000001102, 9600000001101]::bigint[] then
        raise exception 'C2C policy read model changed subsidy order';
    end if;
    if v_actual->'fee_policy'->'published_at' <> 'null'::jsonb
        or v_actual->'components'->0->'maximum_amount' <> 'null'::jsonb
        or v_actual->'components'->1->'minimum_amount' <> 'null'::jsonb
        or v_actual->'subsidy_overrides'->0->'expires_at' <> 'null'::jsonb then
        raise exception 'C2C policy read model changed nullable fields';
    end if;
end;
$$;

reset role;

do $$
declare
    v_function regprocedure :=
        'commerce.get_c2c_policy_configuration_read_model()'::regprocedure;
    v_security_definer boolean;
    v_volatility "char";
    v_settings text[];
begin
    select procedure.prosecdef, procedure.provolatile, procedure.proconfig
    into v_security_definer, v_volatility, v_settings
    from pg_catalog.pg_proc procedure
    where procedure.oid = v_function;
    if v_security_definer or v_volatility <> 's'
        or array_position(v_settings, 'search_path=""') is null then
        raise exception 'C2C policy read model has unsafe execution settings';
    end if;
    if pg_catalog.has_function_privilege(
        'anon', v_function, 'EXECUTE'
    ) or pg_catalog.has_function_privilege(
        'authenticated', v_function, 'EXECUTE'
    ) or not pg_catalog.has_function_privilege(
        'service_role', v_function, 'EXECUTE'
    ) then
        raise exception 'C2C policy read model has unsafe execution privileges';
    end if;
end;
$$;

delete from commerce.settings where id = 'default';
set local role service_role;

do $$
begin
    if commerce.get_c2c_policy_configuration_read_model()
        <> jsonb_build_object('state', 'settings_missing') then
        raise exception 'C2C policy read model changed the missing-settings state';
    end if;
end;
$$;

rollback;
