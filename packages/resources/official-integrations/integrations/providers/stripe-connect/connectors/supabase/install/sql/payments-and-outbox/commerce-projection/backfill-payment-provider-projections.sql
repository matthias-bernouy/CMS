

insert into stripe_connect.commerce_projection_outbox (
    payment_id, projection_key, projection_kind, provider_object_id
)
select payment.id,
    'backfill:payment:' || payment.id || ':' || extract(epoch from payment.updated_at)::text,
    'payment', payment.id::text
from stripe_connect.payments payment
on conflict (projection_key) do nothing;
