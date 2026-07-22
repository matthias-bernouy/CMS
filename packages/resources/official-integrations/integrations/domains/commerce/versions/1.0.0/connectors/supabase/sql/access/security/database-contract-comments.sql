

comment on schema commerce is
    'Private catalogue, marketplace offer, price review, and ordering data owned by cms-commerce.';
comment on table commerce.settings is
    'Typed policy settings. Security and workflow rules must not be stored as arbitrary metadata.';
comment on table commerce.brands is
    'Canonical catalogue brands referenced by Products; brand names are not free-form Product metadata.';
comment on table commerce.categories is
    'Hierarchical catalogue taxonomy with stable full slugs.';
comment on table commerce.category_custom_fields is
    'Category applicability, requirement, presentation order, and public filtering policy for Product custom fields.';
comment on table commerce.offers is
    'Seller-specific listings. Multiple offers may reference the same product or variant.';
comment on table commerce.product_variants is
    'Internal combinations generated from product variant axes; not an independently managed resource.';
comment on table commerce.product_media is
    'Ordered private image attachments managed as part of the Product aggregate.';
comment on table commerce.carts is
    'Mutable authenticated buyer intent. Cart rows never reserve inventory or own trusted prices.';
comment on table commerce.checkout_groups is
    'Idempotent checkout parent grouping immutable single-seller orders created from one buyer action.';
comment on table commerce.platform_payout_order_contributions is
    'Private per-order inputs to the atomically maintained platform payout liability total.';
comment on table commerce.platform_payout_liability_pending_orders is
    'Private append-only work queue for liability inputs changed outside the serialized cache writer.';
comment on table commerce.platform_payout_liability_cache_state is
    'Private initialization state for the versioned platform payout liability contribution cache.';
comment on view commerce.platform_payout_order_contribution_projection is
    'Live set-based contribution projection used by targeted deltas and full reconciliation.';
comment on table commerce.custom_field_definitions is
    'Descriptive custom fields scoped to Commerce entities; never an authorization or pricing mechanism.';
comment on function commerce.create_order_from_offers is
    'Creates a single-seller order atomically from server-loaded offer prices and snapshots.';
comment on function commerce.lock_order_financial_terms is
    'Locks one exact provider-issued delivery quote into immutable protected-payment terms.';