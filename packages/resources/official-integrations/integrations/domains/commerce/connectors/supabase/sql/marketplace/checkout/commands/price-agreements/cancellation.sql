
create or replace function commerce.cancel_price_agreement(
    p_authority_key text,
    p_authority_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_agreement commerce.price_agreements%rowtype;
begin
    select * into v_agreement
    from commerce.price_agreements
    where authority_key = p_authority_key
      and authority_reference = p_authority_reference
    for update;
    if not found then raise exception 'not_found: price agreement'; end if;
    if v_agreement.status = 'consumed' then
        raise exception 'conflict: consumed price agreements cannot be canceled';
    end if;
    if v_agreement.status = 'active' and v_agreement.expires_at <= now() then
        update commerce.price_agreements
        set status = 'expired'
        where id = v_agreement.id
        returning * into v_agreement;
    elsif v_agreement.status = 'active' then
        update commerce.price_agreements
        set status = 'canceled', canceled_at = now()
        where id = v_agreement.id
        returning * into v_agreement;
    end if;
    return to_jsonb(v_agreement);
end;
$$;
