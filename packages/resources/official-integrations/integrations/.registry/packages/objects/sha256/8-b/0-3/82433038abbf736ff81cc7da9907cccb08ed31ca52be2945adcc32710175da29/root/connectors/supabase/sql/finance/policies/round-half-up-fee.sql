

create or replace function commerce.round_half_up_fee(
    p_basis_amount bigint,
    p_rate_bps integer,
    p_fixed_amount bigint,
    p_minimum_amount bigint default null,
    p_maximum_amount bigint default null
)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare v_amount numeric;
begin
    if p_basis_amount < 0 or p_rate_bps not between 0 and 10000 or p_fixed_amount < 0 then
        raise exception 'validation: invalid fee component';
    end if;
    v_amount := floor((p_basis_amount::numeric * p_rate_bps::numeric + 5000) / 10000)
        + p_fixed_amount;
    if p_minimum_amount is not null then v_amount := greatest(v_amount, p_minimum_amount); end if;
    if p_maximum_amount is not null then v_amount := least(v_amount, p_maximum_amount); end if;
    if v_amount < 0 or v_amount > 9007199254740991 then
        raise exception 'validation: calculated fee exceeds supported amount';
    end if;
    return v_amount::bigint;
end;
$$;