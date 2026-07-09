# Orders 1.0.0

Supabase-backed single-seller order ledger for CmsCore.

This integration owns order records and immutable commercial snapshots. It does
not own payment, delivery, stock, reservation, tax, discount, or dynamic pricing
behavior. Those systems own their own operational links and may point back to an
order id when needed.

## Scope

- One order has one seller.
- Multi-seller checkout must create one order per seller.
- Order lines store immutable snapshots.
- Amounts are stored in the smallest currency unit.
- Version 1 keeps `totalAmount` equal to the sum of line totals.

## Connector

The bundled Supabase connector deploys:

- private `orders` schema,
- `orders.orders`,
- `orders.order_lines`,
- `orders.order_events`,
- `cms-orders` Edge Function.

The database schema is private to `anon` and `authenticated` roles. The Edge
Function uses the Supabase service role through the connector deployment
environment and a generated CMS API key.

## Source Endpoints

- `GET /health`
- `GET /order/defaults`
- `GET /orders`
- `POST /orders`
- `GET /order`
- `GET /my-orders`
- `GET /my-order`
- `POST /order/status`
- `GET /order/events`

`my-orders` and `my-order` require the CMS-computed user id. Backoffice endpoints
remain behind CMS gateway permissions and the generated source API key.
