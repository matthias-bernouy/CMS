

create or replace function stripe_connect.reserve_account_financial_operation(
    p_cms_user_id text,
    p_business_key text,
    p_operation_type text,
    p_request jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_operation stripe_connect.financial_operations%rowtype;
begin
    if p_cms_user_id is null or length(btrim(p_cms_user_id)) = 0 then
        raise exception 'validation: CMS user id is required';
    end if;
    if p_business_key is null or length(btrim(p_business_key)) = 0 then
        raise exception 'validation: business key is required';
    end if;
    if p_operation_type <> 'payout_schedule_update' then
        raise exception 'validation: unsupported account financial operation';
    end if;
    if p_request is null or jsonb_typeof(p_request) <> 'object' then
        raise exception 'validation: operation request must be an object';
    end if;

    select * into v_account
    from stripe_connect.accounts
    where cms_user_id = p_cms_user_id
    for update;
    if not found or v_account.stripe_account_id is null then
        raise exception 'not_found: connected account';
    end if;

    select * into v_operation
    from stripe_connect.financial_operations
    where business_key = p_business_key;
    if found then
        if v_operation.payment_id is not null
            or v_operation.operation_type is distinct from p_operation_type
            or v_operation.request is distinct from p_request then
            raise exception 'conflict: account financial operation replay mismatch';
        end if;
        return to_jsonb(v_operation);
    end if;

    insert into stripe_connect.financial_operations (
        payment_id, business_key, operation_type, request
    ) values (
        null, p_business_key, p_operation_type, p_request
    ) returning * into v_operation;

    return to_jsonb(v_operation);
end;
$$;
