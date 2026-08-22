

create or replace function commerce.ensure_order_checkout_group()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_group commerce.checkout_groups%rowtype;
begin
    select * into v_group
    from commerce.checkout_groups
    where id = new.checkout_group_id;
    if found then
        if v_group.buyer_cms_user_id <> new.buyer_cms_user_id
            or v_group.idempotency_key <> new.idempotency_key
            or v_group.request_hash <> new.request_hash then
            raise exception 'conflict: checkout group does not match order';
        end if;
        return new;
    end if;
    insert into commerce.checkout_groups (
        id, buyer_cms_user_id, idempotency_key, request_hash, created_at
    ) values (
        new.checkout_group_id, new.buyer_cms_user_id,
        new.idempotency_key, new.request_hash, new.created_at
    );
    return new;
end;
$$;