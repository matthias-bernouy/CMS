

drop trigger if exists settings_set_updated_at on commerce.settings;
create trigger settings_set_updated_at before update on commerce.settings
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists products_set_updated_at on commerce.products;
create trigger products_set_updated_at before update on commerce.products
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists brands_set_updated_at on commerce.brands;
create trigger brands_set_updated_at before update on commerce.brands
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists categories_set_full_slug on commerce.categories;
create trigger categories_set_full_slug before insert or update of parent_id, slug on commerce.categories
for each row execute function commerce.set_category_full_slug();
drop trigger if exists categories_cascade_full_slug on commerce.categories;
create trigger categories_cascade_full_slug after update of full_slug on commerce.categories
for each row execute function commerce.cascade_category_full_slug();
drop trigger if exists categories_set_updated_at on commerce.categories;
create trigger categories_set_updated_at before update on commerce.categories
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists product_variants_set_updated_at on commerce.product_variants;
create trigger product_variants_set_updated_at before update on commerce.product_variants
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists media_set_updated_at on commerce.media;
create trigger media_set_updated_at before update on commerce.media
for each row execute function commerce.set_updated_at();
drop trigger if exists sellers_set_updated_at on commerce.sellers;
create trigger sellers_set_updated_at before update on commerce.sellers
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists sale_capability_requirements_set_updated_at
on commerce.sale_capability_requirements;
create trigger sale_capability_requirements_set_updated_at
before update on commerce.sale_capability_requirements
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists seller_sale_capabilities_set_updated_at
on commerce.seller_sale_capabilities;
create trigger seller_sale_capabilities_set_updated_at
before update on commerce.seller_sale_capabilities
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists price_agreements_set_updated_at on commerce.price_agreements;
create trigger price_agreements_set_updated_at before update on commerce.price_agreements
for each row execute function commerce.set_updated_at();
drop trigger if exists price_agreements_enforce_immutability on commerce.price_agreements;
create trigger price_agreements_enforce_immutability
before update or delete on commerce.price_agreements
for each row execute function commerce.enforce_price_agreement_immutability();
drop trigger if exists offer_conditions_set_updated_at on commerce.offer_conditions;
create trigger offer_conditions_set_updated_at before update on commerce.offer_conditions
for each row execute function commerce.set_updated_at();
drop trigger if exists offer_workflow_states_set_updated_at on commerce.offer_workflow_states;
create trigger offer_workflow_states_set_updated_at before update on commerce.offer_workflow_states
for each row execute function commerce.set_updated_at();
drop trigger if exists offers_set_updated_at on commerce.offers;
create trigger offers_set_updated_at before update on commerce.offers
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists offer_price_rules_set_updated_at on commerce.offer_price_rules;
create trigger offer_price_rules_set_updated_at before update on commerce.offer_price_rules
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists carts_set_updated_at on commerce.carts;
create trigger carts_set_updated_at before update on commerce.carts
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists cart_items_set_updated_at on commerce.cart_items;
create trigger cart_items_set_updated_at before update on commerce.cart_items
for each row execute function commerce.set_updated_at();
drop trigger if exists orders_ensure_checkout_group on commerce.orders;
create trigger orders_ensure_checkout_group before insert on commerce.orders
for each row execute function commerce.ensure_order_checkout_group();
drop trigger if exists orders_set_updated_at on commerce.orders;
create trigger orders_set_updated_at before update on commerce.orders
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists order_payment_attempts_set_updated_at on commerce.order_payment_attempts;
create trigger order_payment_attempts_set_updated_at before update on commerce.order_payment_attempts
for each row execute function commerce.set_updated_at();
drop trigger if exists order_fulfillments_set_updated_at on commerce.order_fulfillments;
create trigger order_fulfillments_set_updated_at before update on commerce.order_fulfillments
for each row execute function commerce.set_updated_at();
drop trigger if exists order_settlements_set_updated_at on commerce.order_settlements;
create trigger order_settlements_set_updated_at before update on commerce.order_settlements
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists marketplace_claims_set_updated_at on commerce.marketplace_claims;
create trigger marketplace_claims_set_updated_at before update on commerce.marketplace_claims
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists refund_requests_set_updated_at on commerce.refund_requests;
create trigger refund_requests_set_updated_at before update on commerce.refund_requests
for each row execute function commerce.set_updated_at_and_version();
drop trigger if exists cancellation_requests_set_updated_at on commerce.order_cancellation_requests;
create trigger cancellation_requests_set_updated_at before update on commerce.order_cancellation_requests
for each row execute function commerce.set_updated_at();

drop trigger if exists payment_cancellation_requests_set_updated_at on commerce.payment_cancellation_requests;
create trigger payment_cancellation_requests_set_updated_at before update on commerce.payment_cancellation_requests
for each row execute function commerce.set_updated_at();
drop trigger if exists custom_field_definitions_set_updated_at on commerce.custom_field_definitions;
create trigger custom_field_definitions_set_updated_at before update on commerce.custom_field_definitions
for each row execute function commerce.set_updated_at();
drop trigger if exists category_custom_fields_set_updated_at on commerce.category_custom_fields;
create trigger category_custom_fields_set_updated_at before update on commerce.category_custom_fields
for each row execute function commerce.set_updated_at();
