\set ON_ERROR_STOP on

begin;
set local role service_role;

insert into commerce.products (slug, title, status, visibility)
values ('auto-restore-product', 'Auto restore product', 'active', 'public')
returning id as product_id \gset

select id as seller_id from commerce.sellers where slug = 'default' \gset

insert into commerce.offers (
    seller_id, product_id, slug, title, condition_code, publication_status,
    workflow_state, accepted_price_amount, currency, availability, quantity_available
) values (
    :seller_id, :product_id, 'auto-restore-offer', 'Auto restore offer', 'good', 'active',
    'approved', 100, 'eur', 'available', 1
)
returning id as offer_id, inventory_revision \gset

insert into commerce.orders (
    order_number, seller_id, buyer_cms_user_id, currency,
    subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'CO-AUTO-RESTORE', :seller_id, 'auto-restore-buyer', 'eur',
    100, 100, 'auto-restore-key', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
)
returning id as order_id, version as order_version \gset

insert into commerce.order_lines (
    order_id, seller_id, offer_id, product_id, title, quantity,
    inventory_reserved, availability_before, inventory_revision_before,
    unit_amount, total_amount, product_snapshot, offer_snapshot, seller_snapshot
) values (
    :order_id, :seller_id, :offer_id, :product_id, 'Auto restore offer', 1,
    1, 'available', :inventory_revision,
    100, 100, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
);

update commerce.offers
set quantity_available = 0, availability = 'unavailable'
where id = :offer_id;

select commerce.transition_order(
    :order_id, 'cancelled', 'smoke-admin', :order_version
);

do $$
begin
    if not exists (
        select 1 from commerce.offers
        where slug = 'auto-restore-offer'
          and quantity_available = 1
          and availability = 'available'
    ) then raise exception 'smoke: automatic sold-out availability was not restored'; end if;
end;
$$;

rollback;
