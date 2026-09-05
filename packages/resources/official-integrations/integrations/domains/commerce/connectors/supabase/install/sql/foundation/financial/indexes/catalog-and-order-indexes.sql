

create index if not exists products_listing_idx
    on commerce.products(status, visibility, updated_at desc, id desc);
create index if not exists products_brand_idx on commerce.products(brand_id);
create index if not exists products_metadata_gin_idx on commerce.products using gin(metadata jsonb_path_ops);
create index if not exists brands_listing_idx on commerce.brands(status, name, id);
create index if not exists brands_position_listing_idx on commerce.brands(status, position, name, id);
create index if not exists categories_parent_listing_idx on commerce.categories(parent_id, status, position, label, id);
create index if not exists product_categories_category_idx on commerce.product_categories(category_id, product_id);
create index if not exists category_custom_fields_listing_idx
    on commerce.category_custom_fields(category_id, filterable, position, field_key);
create index if not exists category_custom_fields_definition_idx
    on commerce.category_custom_fields(entity_type, field_key);
create index if not exists product_variants_product_idx
    on commerce.product_variants(product_id, status, position, id);
create index if not exists product_variant_axes_product_idx
    on commerce.product_variant_axes(product_id, position, id);
create index if not exists product_variant_axis_values_axis_idx
    on commerce.product_variant_axis_values(product_id, axis_id, position, id);
create index if not exists product_variant_selections_product_idx
    on commerce.product_variant_selections(product_id, variant_id, axis_id);
create index if not exists product_variant_selections_axis_value_fk_idx
    on commerce.product_variant_selections(product_id, axis_id, value_id);
create index if not exists product_variant_selections_value_idx
    on commerce.product_variant_selections(value_id);
create index if not exists product_media_product_idx
    on commerce.product_media(product_id, sort_order, id);
create index if not exists product_media_media_idx
    on commerce.product_media(media_id);
create index if not exists offer_media_offer_idx
    on commerce.offer_media(offer_id, sort_order, id);
create index if not exists offer_media_media_idx
    on commerce.offer_media(media_id);
create index if not exists sellers_verification_idx
    on commerce.sellers(verification_status, updated_at desc, id desc);
create index if not exists seller_verification_events_seller_idx
    on commerce.seller_verification_events(seller_id, created_at desc, id desc);
create index if not exists offer_workflow_transitions_to_idx
    on commerce.offer_workflow_transitions(to_state);
create index if not exists offers_seller_workflow_idx
    on commerce.offers(seller_id, workflow_state, updated_at desc, id desc);
create index if not exists offers_workflow_state_fk_idx
    on commerce.offers(workflow_state);
create index if not exists offers_seller_publication_idx
    on commerce.offers(seller_id, publication_status, updated_at desc, id desc);
create index if not exists offers_product_variant_idx
    on commerce.offers(product_id, variant_id, publication_status);
create index if not exists offers_condition_idx
    on commerce.offers(condition_code);
create index if not exists offers_public_active_idx
    on commerce.offers(updated_at desc, id desc)
    where publication_status = 'active';
create index if not exists offer_price_proposals_offer_idx
    on commerce.offer_price_proposals(offer_id, created_at desc, id desc);
create index if not exists offer_events_offer_idx
    on commerce.offer_events(offer_id, created_at desc, id desc);
create index if not exists carts_buyer_history_idx
    on commerce.carts(buyer_cms_user_id, updated_at desc, id desc);
create index if not exists cart_items_offer_idx
    on commerce.cart_items(offer_id, cart_id);
create index if not exists checkout_groups_created_idx
    on commerce.checkout_groups(created_at desc, id);
create index if not exists orders_seller_status_idx
    on commerce.orders(seller_id, status, created_at desc, id desc);
create index if not exists orders_buyer_status_idx
    on commerce.orders(buyer_cms_user_id, status, created_at desc, id desc);
create index if not exists orders_awaiting_payment_idx
    on commerce.orders(id)
    where status = 'awaiting_payment';
create index if not exists orders_checkout_group_idx
    on commerce.orders(checkout_group_id, seller_id, id);
create index if not exists order_lines_order_idx
    on commerce.order_lines(order_id, id);
create index if not exists order_lines_seller_order_idx
    on commerce.order_lines(seller_id, order_id);
create index if not exists order_lines_offer_idx
    on commerce.order_lines(offer_id);
create index if not exists order_lines_seller_offer_fk_idx
    on commerce.order_lines(seller_id, offer_id);
create index if not exists order_lines_offer_proposal_fk_idx
    on commerce.order_lines(offer_id, accepted_proposal_id);
create index if not exists order_lines_product_idx
    on commerce.order_lines(product_id);
create index if not exists order_lines_product_variant_fk_idx
    on commerce.order_lines(product_id, variant_id);
create index if not exists order_lines_variant_idx
    on commerce.order_lines(variant_id) where variant_id is not null;
create index if not exists order_lines_proposal_idx
    on commerce.order_lines(accepted_proposal_id) where accepted_proposal_id is not null;
create index if not exists order_events_order_idx
    on commerce.order_events(order_id, created_at desc, id desc);
create index if not exists custom_field_definitions_listing_idx
    on commerce.custom_field_definitions(entity_type, enabled, position, key);