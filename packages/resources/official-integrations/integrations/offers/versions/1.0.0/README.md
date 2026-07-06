# Offers Integration

This integration manages sellable offers through the configured connector.
Version `1.0.0` ships one Supabase connector.

An offer is the commercial publication of something that can be sold. It can
reference an external catalogue item, but it owns only sale listing state:
seller identity, base price, availability, publication status, and lightweight
external references.

This version intentionally does not model discounts, coupons, promotions,
carts, orders, reservations, delivery, payment provider state, or advanced
inventory. Those domains should live in separate modules and reference offer
ids when needed.

## Files

- `definition.json`: declarative CMS integration definition.
- `connectors/supabase/schema.sql`: private Supabase Postgres schema with
  `offers.offers` and `offers.external_references`.
- `connectors/supabase/functions/cms-offers/index.ts`: Supabase Edge Function
  that exposes the CMS-facing offers API.
- `connectors/supabase/supabase.config.toml`: Edge Function config fragment.

## Architecture

```text
CMS page, bloc, or dashboard
  -> /.cms/sources/offers/*
  -> authorization: Bearer <CMS-stored generated secret>
  -> optional x-user-id: <computed CMS user id>
  -> Supabase Edge Function cms-offers
  -> offers schema
```

The CMS stores only the source configuration and a generated API key reference.
Supabase owns offer rows.

## Seller Model

Seller identity is intentionally provider-neutral:

```text
sellerKind = merchant | user | external
sellerId = text
```

Classic ecommerce can use `sellerKind = merchant` and `sellerId = default`.
Marketplace flows can use `sellerKind = user` and the CMS-computed user id. The
`myOffers` and `upsertMyOffer` endpoints force the seller to the computed
`x-user-id`; browsers must not provide trusted seller ids directly.

## Table

`offers.offers` stores:

```text
id bigint identity primary key
slug text unique
title text
description text null
product_id text null
seller_kind text
seller_id text
price_amount integer
currency text
compare_at_amount integer null
tax_behavior text
status text
visibility text
availability text
quantity_available integer null
starts_at timestamptz null
ends_at timestamptz null
metadata jsonb
created_at timestamptz
updated_at timestamptz
```

Amounts are stored in the smallest currency unit.

## External Item References

`productId` is an opaque external item identifier. The base `offers`
integration does not know how catalogue items are stored or fetched, and it does
not query a catalogue module. A site can store ids from `products`, an external
PIM, a SKU system, or any other catalogue source.

## Edge Function Contract

All routes require:

```text
authorization: Bearer <CMS_OFFERS_API_KEY>
```

Routes that operate on the current seller also require:

```text
x-user-id: <computed CMS user id>
```

### GET /offers

Lists offers. Supported filters include `q`, `status`, `visibility`,
`sellerKind`, `sellerId`, `productId`, `currency`, and `limit`.

### GET /offer

Fetches one offer by `id` or `slug`. `id=__new__` returns default form values.

### POST /offer

Creates or updates an offer. Use query parameter `id` to update an existing row.
The body may also include:

```json
{
  "externalReference": {
    "provider": "import",
    "externalId": "external-offer-1"
  },
  "data": {
    "slug": "demo-offer",
    "title": "Demo offer",
    "priceAmount": 12900,
    "currency": "eur"
  }
}
```

External reference writes are idempotent.

### POST /my-offer

Creates or updates an offer for the current CMS user. The connector ignores
body-provided seller fields and writes `sellerKind = user`,
`sellerId = x-user-id`.

### GET /my-offers

Lists offers owned by the current CMS user.

### POST /offer/archive

Marks one offer as archived.

### DELETE /offer

Deletes one offer by id.

### GET /health

Returns `{ "ok": true }` after validating the CMS bearer token.

## CMS Installation

Import `definition.json` with kind `offers`. Configure:

- `id`: usually `offers`.

The import generates the private CMS API key, deploys the Supabase connector,
installs the source, and installs the offers dashboard.
