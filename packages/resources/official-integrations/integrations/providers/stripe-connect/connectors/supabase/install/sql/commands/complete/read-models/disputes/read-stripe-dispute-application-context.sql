

create or replace function stripe_connect.read_stripe_dispute_application_context(
    p_stripe_charge_id text,
    p_stripe_dispute_id text
)
returns table (
    payment jsonb,
    dispute jsonb
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_payment jsonb;
    v_dispute jsonb;
begin
    -- Keep payment precedence and the later dispute snapshot from the former
    -- sequential PostgREST requests.
    select pg_catalog.to_jsonb(payment_row)
    into v_payment
    from stripe_connect.payments payment_row
    where payment_row.stripe_charge_id = p_stripe_charge_id;

    if v_payment is null then
        return query select null::jsonb, null::jsonb;
        return;
    end if;

    select pg_catalog.to_jsonb(dispute_row)
    into v_dispute
    from stripe_connect.stripe_disputes dispute_row
    where dispute_row.stripe_dispute_id = p_stripe_dispute_id;

    return query select v_payment, v_dispute;
end;
$$;

revoke execute on function stripe_connect.read_stripe_dispute_application_context(text, text)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_stripe_dispute_application_context(text, text)
    to service_role;
