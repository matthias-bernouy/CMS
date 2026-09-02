create or replace function commerce.assert_offer_price_increment(
    p_amount bigint,
    p_field text default 'price'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_whole_unit_prices boolean;
begin
    if p_amount is null then
        return;
    end if;
    select whole_unit_prices into v_whole_unit_prices
    from commerce.settings
    where id = 'default'
    for share;
    if not found then
        raise exception 'conflict: commerce settings are missing';
    end if;
    if v_whole_unit_prices and mod(p_amount, 100) <> 0 then
        raise exception 'validation: % must use whole currency units', p_field;
    end if;
end;
$$;
