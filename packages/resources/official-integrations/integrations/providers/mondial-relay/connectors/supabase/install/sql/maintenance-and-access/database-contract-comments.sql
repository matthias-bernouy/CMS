

comment on schema delivery is
    'Private delivery schema owned by Supabase Edge Functions.';
comment on table delivery.shipments is
    'Mondial Relay Connect shipments created through the CMS delivery source.';
comment on column delivery.shipments.external_order_id is
    'Optional external order id for future commerce or ERP integrations.';
comment on column delivery.shipments.expedition_number is
    'Mondial Relay Connect shipment number returned by shipment creation.';
comment on column delivery.shipments.label_url is
    'Private provider label URL. It is never returned by shipment projections and is proxied only through a short-lived seller capability.';
comment on table delivery.relay_selections is
    'Server-validated pickup point snapshots keyed by an immutable external order id; no shipment is created at selection time.';
comment on table delivery.delivery_quotes is
    'Immutable, buyer-bound Mondial Relay quote and private fulfillment snapshots used by Commerce financial terms and shipment creation.';
comment on column delivery.shipments.delivery_quote_id is
    'Exact immutable Delivery quote authorized by Commerce; main-order shipments never resolve a mutable latest selection.';
comment on column delivery.shipments.declared_value_minor_amount is
    'Immutable merchandise value in EUR minor units; converted exactly to provider major-unit text at the XML boundary.';
comment on table delivery.settings is
    'Editable Mondial Relay delivery defaults used by the cms-delivery Edge Function.';
comment on column delivery.settings.id is
    'Single settings row. Keep the default id unless the connector is versioned for multiple profiles.';
comment on table delivery.shipment_events is
    'Normalized events stored for delivery shipments.';
comment on table delivery.label_access_tokens is
    'Short-lived, seller-bound capability hashes used to proxy provider labels without exposing their URL.';
comment on table delivery.shipment_recovery_events is
    'Audited administrator decisions that attach a verified provider shipment to an ambiguous creation reservation.';
comment on table delivery.projection_review_actions is
    'Audited operator actions that requeue a failed projection or resolve only a provable duplicate without changing carrier truth.';