# Supabase Commerce Integration

This blueprint keeps the CMS stateless for commerce catalogue data. The CMS
creates a source that injects a private API key server-side; the Supabase Edge
Function owns reads and writes against a private `commerce` schema.

It covers catalogue, variants, offers, vendors, categories, attributes and
media. It does not implement payments, carts, orders, shipping, reservations or
Stripe Connect settlement.

## Files

- `definition.json`: declarative CMS integration definition for this version.
- `connectors/supabase/schema.sql`: private Supabase Postgres schema, product
  listing view, category facets RPC, constraints, forced RLS and grants.
- `connectors/supabase/functions/cms-commerce/index.ts`: standalone Supabase
  Edge Function. Create one function named `cms-commerce` and paste this file.
- `connectors/supabase/supabase.config.toml`: function config fragment. Copy it
  into the target Supabase project's `supabase/config.toml`.

## Architecture

```text
CMS page or editor
  -> /.cms/sources/commerce/*
  -> Supabase Edge Function cms-commerce
  -> private commerce schema
```

Read endpoints receive only the private CMS commerce API key. Write endpoints
also receive `x-cms-user-id` computed by the CMS for audit/context. The Edge
Function does not infer roles or permissions from this header; the CMS decides
which users can call which endpoints.

## Supabase Setup

1. Run `connectors/supabase/schema.sql` against the target Supabase database.
2. Expose the `commerce` schema to the Supabase Data API for server-side Edge
   Function access. The SQL still revokes `anon` and `authenticated` and grants
   access only to `service_role`.
3. Create one Edge Function named `cms-commerce`, then paste
   `connectors/supabase/functions/cms-commerce/index.ts` as its `index.ts`.
4. Copy the function config from `connectors/supabase/supabase.config.toml`;
   the function validates its own CMS API key, so `verify_jwt` must be `false`.
5. Deploy the Edge Function with:
   - `CMS_COMMERCE_API_KEY`: private bearer token accepted from the CMS source.
   - `SUPABASE_URL`: Supabase project URL.
   - `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY`: server-side key used
     only inside the Edge Function.

Never expose `CMS_COMMERCE_API_KEY`, Supabase secret keys, or service-role keys
to browser code.

## CMS Installation

Import `definition.json` with kind `supabase-commerce`. Configure:

- `id`: usually `commerce`.
- `functionsBaseUrl`: `https://PROJECT_REF.functions.supabase.co/functions/v1`
  without a trailing slash.
- `apiKey`: the same value as `CMS_COMMERCE_API_KEY` in Supabase secrets.

After import, CMS pages or blocs can call:

```text
/.cms/sources/commerce/categories
/.cms/sources/commerce/category?fullSlug=sport/tennis
/.cms/sources/commerce/products?categoryFullSlug=sport/tennis&sort=price_asc
/.cms/sources/commerce/product?slug=babolat-pure-drive-2025
/.cms/sources/commerce/productOffers?productId=1
/.cms/sources/commerce/categoryFacets?categoryFullSlug=sport/tennis
/.cms/sources/commerce/upsertProduct
/.cms/sources/commerce/upsertOffer
```

## Model Rules

- Every product has at least one variant.
- Every saleable item is an offer.
- Price, condition and stock live only on offers.
- Mono-vendor uses one internal vendor from `commerce_settings.default_vendor_id`.
- Marketplace writes pass explicit `vendorId`.
- Soft deletion is represented by status updates.
- Product/category/attribute text is single-locale in V1.
- Multi-valued attributes are not supported in V1.

## Idempotent Writes

All write endpoints are `POST` upsert commands. They resolve existing rows by:

1. `externalReference` when provided.
2. Explicit `id`.
3. The natural key for the target table.

Variants require one of: `id`, `externalReference`, non-null `sku`, or
`isDefault: true`. No-SKU non-default variants without an id or external
reference are rejected.

## References

- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
