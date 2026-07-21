update commerce.order_fulfillments
set status = 'label_created', provider_reference = '12345678'
where order_id = :order_42_id;

insert into commerce.shipment_creation_operations (
    order_id, business_key, delivery_quote_id, financial_terms_hash,
    status, provider_reference, provider_shipment_id
) values (
    :order_42_id, 'seller-context:order-42', 'quote-42', repeat('a', 64),
    'succeeded', '12345678', 'shipment-42'
);
