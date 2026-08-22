create or replace function commerce.offer_has_active_price_agreement(
    p_offer_id bigint
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
    select exists (
        select 1
        from commerce.price_agreements agreement
        where agreement.offer_id = p_offer_id
          and agreement.status = 'active'
          and agreement.expires_at > now()
    );
$$;

create or replace function commerce.expire_price_agreements(
    p_offer_id bigint default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_count integer;
begin
    update commerce.price_agreements
    set status = 'expired'
    where status = 'active'
      and expires_at <= now()
      and (p_offer_id is null or offer_id = p_offer_id);
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

revoke execute on function commerce.expire_price_agreements(bigint)
from public, anon, authenticated;

create or replace function commerce.enforce_price_agreement_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        raise exception 'conflict: price agreements cannot be deleted';
    end if;
    if row(
        new.id,
        new.public_id,
        new.authority_key,
        new.authority_reference,
        new.authority_version,
        new.offer_id,
        new.seller_id,
        new.buyer_cms_user_id,
        new.unit_amount,
        new.currency,
        new.quantity,
        new.expires_at,
        new.created_at
    ) is distinct from row(
        old.id,
        old.public_id,
        old.authority_key,
        old.authority_reference,
        old.authority_version,
        old.offer_id,
        old.seller_id,
        old.buyer_cms_user_id,
        old.unit_amount,
        old.currency,
        old.quantity,
        old.expires_at,
        old.created_at
    ) then
        raise exception 'conflict: price agreement terms are immutable';
    end if;
    if old.status <> 'active' and row(
        new.status, new.order_id, new.consumed_at, new.canceled_at
    ) is distinct from row(
        old.status, old.order_id, old.consumed_at, old.canceled_at
    ) then
        raise exception 'conflict: terminal price agreement lifecycle is immutable';
    end if;
    if old.status = 'active'
       and new.status not in ('active', 'consumed', 'expired', 'canceled') then
        raise exception 'conflict: invalid price agreement lifecycle transition';
    end if;
    if old.status = 'active'
       and new.status = 'active'
       and row(new.order_id, new.consumed_at, new.canceled_at)
           is distinct from row(old.order_id, old.consumed_at, old.canceled_at) then
        raise exception 'conflict: active price agreement lifecycle cannot be changed';
    end if;
    if old.status = 'active'
       and new.status = 'consumed'
       and not exists (
           select 1
           from commerce.orders orders
           join commerce.order_lines line
             on line.order_id = orders.id
            and line.price_agreement_id = new.id
           where orders.id = new.order_id
             and orders.seller_id = new.seller_id
             and orders.buyer_cms_user_id = new.buyer_cms_user_id
             and orders.currency = new.currency
             and orders.subtotal_amount
                 = new.unit_amount::numeric * new.quantity
             and line.offer_id = new.offer_id
             and line.quantity = new.quantity
             and line.unit_amount = new.unit_amount
             and line.total_amount
                 = new.unit_amount::numeric * new.quantity
       ) then
        raise exception 'conflict: consumed price agreement order does not match its terms';
    end if;
    return new;
end;
$$;

revoke execute on function commerce.enforce_price_agreement_immutability()
from public, anon, authenticated;
