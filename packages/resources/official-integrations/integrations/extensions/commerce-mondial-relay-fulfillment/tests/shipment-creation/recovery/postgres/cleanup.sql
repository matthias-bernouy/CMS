drop table if exists shipment_creation_cleanup_order_ids;
create temporary table shipment_creation_cleanup_order_ids as
select id
from commerce.orders
where public_id in (
    '00000000-0000-4000-8000-000000000041'::uuid,
    '00000000-0000-4000-8000-000000000042'::uuid,
    '00000000-0000-4000-8000-000000000043'::uuid
);

delete from commerce.audit_events
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.outbox_events
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.shipment_creation_operations
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.platform_payout_order_liabilities
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.order_payment_attempts
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.order_settlements
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.order_fulfillments
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.order_financial_terms
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.order_events
where order_id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.orders
where id in (select id from shipment_creation_cleanup_order_ids);
delete from commerce.checkout_groups
where id in (
    '10000000-0000-4000-8000-000000000041'::uuid,
    '10000000-0000-4000-8000-000000000042'::uuid,
    '10000000-0000-4000-8000-000000000043'::uuid
);
delete from commerce.sellers
where cms_user_id in ('order-read-seller-17', 'order-read-seller-18');

drop table shipment_creation_cleanup_order_ids;
