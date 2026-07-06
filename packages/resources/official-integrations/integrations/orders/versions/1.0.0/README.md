# Orders 1.0.0

Supabase-backed single-seller order ledger for CmsCore.

This integration owns order records and immutable commercial snapshots. It does
not own payment, delivery, stock, reservation, tax, discount, or dynamic pricing
behavior. Those systems should be linked through the order external reference
endpoints.

## Scope

- One order has one seller.
- Multi-seller checkout must create one order per seller.
- Order lines store product and variant references plus immutable snapshots.
- Amounts are stored in the smallest currency unit.
- Version 1 keeps `totalAmount` equal to the sum of line totals.
- Payment, delivery, stock, reservation, fulfilment, invoice, and ERP systems are
  referenced by `order_external_refs` rows only.

## Connector

The bundled Supabase connector deploys:

- private `orders` schema,
- `orders.orders`,
- `orders.order_lines`,
- `orders.order_external_refs`,
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
- `POST /order/reference`
- `GET /order/events`

`my-orders` and `my-order` require the CMS-computed user id. Backoffice endpoints
remain behind CMS gateway permissions and the generated source API key.

## External References

`POST /order/reference` accepts:

- `kind`: `payment`, `shipment`, `stock_reservation`, `fulfillment`, `invoice`,
  or `other`,
- `provider`: external system identifier,
- `externalId`: external record identifier,
- optional label, status, URL, amount, currency, and metadata.

These references are integration links. The referenced system remains the source
of truth for its own operational state.
