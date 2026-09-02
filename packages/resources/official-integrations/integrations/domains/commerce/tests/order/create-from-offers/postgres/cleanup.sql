reset role;

drop trigger if exists order_creation_concurrency_barrier
on commerce.order_lines;
drop schema if exists commerce_order_creation_test cascade;

delete from commerce.order_events
where order_id in (
    select id from commerce.orders
    where buyer_cms_user_id like 'order-create-%'
);
delete from commerce.order_lines
where order_id in (
    select id from commerce.orders
    where buyer_cms_user_id like 'order-create-%'
);
delete from commerce.orders
where buyer_cms_user_id like 'order-create-%';
delete from commerce.checkout_groups
where buyer_cms_user_id like 'order-create-%';
delete from commerce.offer_price_proposals
where offer_id in (
    select id from commerce.offers where slug like 'order-create-%'
);
delete from commerce.offers where slug like 'order-create-%';
delete from commerce.product_variant_selections
where product_id in (
    select id from commerce.products where slug like 'order-create-%'
);
delete from commerce.product_variant_axis_values
where product_id in (
    select id from commerce.products where slug like 'order-create-%'
);
delete from commerce.product_variant_axes
where product_id in (
    select id from commerce.products where slug like 'order-create-%'
);
delete from commerce.product_variants
where product_id in (
    select id from commerce.products where slug like 'order-create-%'
);
delete from commerce.products where slug like 'order-create-%';
delete from commerce.sellers where slug like 'order-create-%';
