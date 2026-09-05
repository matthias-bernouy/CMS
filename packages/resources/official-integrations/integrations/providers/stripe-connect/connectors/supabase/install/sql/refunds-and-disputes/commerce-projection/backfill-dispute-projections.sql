

insert into stripe_connect.commerce_projection_outbox (
    payment_id, projection_key, projection_kind, provider_object_id
)
select dispute.payment_id,
    'backfill:dispute:' || dispute.id || ':' || extract(epoch from dispute.updated_at)::text,
    'dispute', dispute.id::text
from stripe_connect.stripe_disputes dispute
on conflict (projection_key) do nothing;
