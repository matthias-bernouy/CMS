

create or replace function stripe_connect.read_settlement_release_context(
    p_payment_id bigint,
    p_seller_cms_user_id text,
    p_release_authorization_id text
)
returns table (
    seller_account jsonb,
    existing_transfer jsonb,
    seller_recovery_amount numeric
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_seller_account jsonb;
    v_existing_transfer jsonb;
    v_seller_recovery_amount numeric;
begin
    -- VOLATILE is deliberate: each SELECT retains the fresh READ COMMITTED
    -- observation point of the former sequential PostgREST requests.
    select pg_catalog.to_jsonb(account_row)
    into v_seller_account
    from stripe_connect.accounts account_row
    where account_row.cms_user_id = p_seller_cms_user_id;

    select pg_catalog.to_jsonb(transfer_row)
    into v_existing_transfer
    from stripe_connect.transfers transfer_row
    where transfer_row.release_authorization_id = p_release_authorization_id;

    select coalesce(
        pg_catalog.sum(refund_row.seller_entitlement_reduction_amount),
        0
    )
    into v_seller_recovery_amount
    from stripe_connect.refunds refund_row
    where refund_row.payment_id = p_payment_id
      and refund_row.status = 'succeeded';

    return query select
        v_seller_account,
        v_existing_transfer,
        v_seller_recovery_amount;
end;
$$;

revoke execute on function stripe_connect.read_settlement_release_context(
    bigint, text, text
) from public, anon, authenticated;
grant execute on function stripe_connect.read_settlement_release_context(
    bigint, text, text
) to service_role;
