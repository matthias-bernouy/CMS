drop schema if exists seller_price_submission_test cascade;

create temporary table seller_price_cleanup_offer_ids (id bigint primary key);
insert into seller_price_cleanup_offer_ids
select id from commerce.offers where slug = 'seller-price-concurrency-offer';

delete from commerce.order_lines
where offer_id in (select id from seller_price_cleanup_offer_ids);
delete from commerce.cart_items
where offer_id in (select id from seller_price_cleanup_offer_ids);
delete from commerce.offer_media
where offer_id in (select id from seller_price_cleanup_offer_ids);
delete from commerce.offer_events
where offer_id in (select id from seller_price_cleanup_offer_ids);
delete from commerce.offer_price_proposals
where offer_id in (select id from seller_price_cleanup_offer_ids);
delete from commerce.offer_price_rules
where offer_id in (select id from seller_price_cleanup_offer_ids);
delete from commerce.offers
where id in (select id from seller_price_cleanup_offer_ids);

delete from commerce.seller_verification_events
where seller_id in (
    select id from commerce.sellers
    where cms_user_id = 'seller-price-concurrency-user'
);
delete from commerce.sellers
where cms_user_id = 'seller-price-concurrency-user';
delete from commerce.product_categories
where product_id in (
    select id from commerce.products
    where slug = 'seller-price-concurrency-product'
);
delete from commerce.product_media
where product_id in (
    select id from commerce.products
    where slug = 'seller-price-concurrency-product'
);
delete from commerce.products
where slug = 'seller-price-concurrency-product';

drop table seller_price_cleanup_offer_ids;
