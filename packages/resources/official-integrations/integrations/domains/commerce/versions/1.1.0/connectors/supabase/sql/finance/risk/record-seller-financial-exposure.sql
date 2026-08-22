

create or replace function commerce.record_seller_financial_exposure(
    p_order_id bigint,
    p_exposure_key text,
    p_exposure_type text,
    p_status text,
    p_amount bigint,
    p_recovered_amount bigint,
    p_reason text,
    p_details jsonb default '{}'::jsonb
)
returns commerce.seller_financial_exposures
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_exposure commerce.seller_financial_exposures%rowtype;
begin
    select * into v_order from commerce.orders where id = p_order_id;
    if not found then raise exception 'not_found: order'; end if;
    if p_exposure_key is null or length(btrim(p_exposure_key)) = 0 then
        raise exception 'validation: seller exposure key is required';
    end if;
    insert into commerce.seller_financial_exposures (
        seller_id, order_id, exposure_key, exposure_type, status, amount,
        recovered_amount, currency, reason, details
    ) values (
        v_order.seller_id, v_order.id, p_exposure_key, p_exposure_type, p_status,
        p_amount, p_recovered_amount, 'eur', p_reason, coalesce(p_details, '{}'::jsonb)
    ) on conflict (exposure_key) do update set
        status = excluded.status,
        amount = greatest(commerce.seller_financial_exposures.amount, excluded.amount),
        recovered_amount = greatest(commerce.seller_financial_exposures.recovered_amount, excluded.recovered_amount),
        reason = excluded.reason,
        details = commerce.seller_financial_exposures.details || excluded.details,
        updated_at = now()
    returning * into v_exposure;
    perform commerce.refresh_seller_risk_state(v_order.seller_id);
    if p_status = 'debt' then
        insert into commerce.financial_exceptions (order_id, kind, severity, reason, details)
        values (
            v_order.id, 'seller_debt', 'critical', p_reason,
            jsonb_build_object('exposureKey', p_exposure_key, 'amount', p_amount)
                || coalesce(p_details, '{}'::jsonb)
        );
    end if;
    return v_exposure;
end;
$$;