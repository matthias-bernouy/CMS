# Stripe Connect Integration

This blueprint keeps the CMS stateless for marketplace data. The CMS creates a
source that forwards the authenticated CMS `userID`; Supabase Edge Functions own
Stripe calls, Postgres state, and webhook processing.

## Files

- `connectors/supabase/schema.sql`: private Supabase Postgres schema for Stripe
  Connect state, orders, transfers, and webhook idempotency.
- `definition.json`: declarative CMS integration definition for this version.
- `connectors/supabase/functions/cms-marketplace/index.ts`: standalone
  Supabase Edge Function. Create one function named `cms-marketplace` and paste
  this file.
- `connectors/supabase/supabase.config.toml`: function config fragment. Copy it
  into the target Supabase project's `supabase/config.toml`.

## Architecture

```text
CMS user
  -> /.cms/sources/marketplace/*
  -> x-cms-user-id: <computed CMS user id>
  -> Supabase Edge Function cms-marketplace
  -> Stripe API + marketplace schema
```

The CMS stores only the integration configuration and the shared API key. It
does not store `stripe_account_id`, KYC state, orders, transfers, refunds, or
Stripe events.

## Supabase Setup

1. Run `connectors/supabase/schema.sql` against the target Supabase database.
2. Expose the `marketplace` schema to the Supabase Data API for server-side
   Edge Function access. The SQL still revokes `anon` and `authenticated` and
   grants access only to `service_role`.
3. In Supabase, create one Edge Function named `cms-marketplace`, then paste
   `connectors/supabase/functions/cms-marketplace/index.ts` as its `index.ts`.
4. Copy the function config from `connectors/supabase/supabase.config.toml`;
   the function uses its own CMS API key or Stripe signature checks, so
   `verify_jwt` must be `false`.
5. Deploy the Edge Function with these secrets:
   - `CMS_MARKETPLACE_API_KEY`: shared bearer token accepted from the CMS source.
   - `STRIPE_SECRET_KEY`: Stripe platform secret key.
   - `STRIPE_WEBHOOK_SECRET`: Stripe webhook endpoint secret.
   - `STRIPE_CONNECT_COUNTRY`: optional, defaults to `FR`.
   - `STRIPE_CONNECT_CARD_PAYMENTS`: optional, set `true` to request the
     connected account `card_payments` capability in addition to `transfers`.
   - `STRIPE_CONNECT_BUSINESS_TYPE`: optional global fallback, for example
     `individual` or `company`. Leave it unset for mixed marketplaces where
     some sellers are private individuals and others are professionals.
6. Keep marketplace tables private. The SQL creates a `marketplace` schema,
   revokes `anon` and `authenticated`, enables RLS, and grants access to
   `service_role`.

Supabase Edge Functions expose secrets through environment variables with
`Deno.env.get(...)`. Supabase also provides project secrets such as
`SUPABASE_URL`, `SUPABASE_SECRET_KEYS`, and legacy `SUPABASE_SERVICE_ROLE_KEY`.
Never expose secret/service-role keys in browser code.

## Edge Function Contract

All CMS-called functions require:

```text
authorization: Bearer <CMS_MARKETPLACE_API_KEY>
x-cms-user-id: <computed CMS user id>
```

`CMS_MARKETPLACE_API_KEY` is a private shared secret between the CMS server and
the Edge Function. It is not the Supabase publishable key, anon key, or
service-role key. A Supabase publishable key sent as `Authorization` is rejected
because the function compares the bearer token only with
`CMS_MARKETPLACE_API_KEY`.

Reject requests with a missing or blank `x-cms-user-id`. Treat it as the stable
application identity for marketplace records.

The public route prefix is:

```text
https://PROJECT_REF.functions.supabase.co/functions/v1/cms-marketplace
```

### GET /connect-status

Returns the Stripe Connect state for the calling CMS user.

```json
{
  "connected": true,
  "onboardingStatus": "enabled",
  "chargesEnabled": true,
  "payoutsEnabled": true,
  "disabledReason": null,
  "currentlyDue": [],
  "pastDue": [],
  "pendingVerification": []
}
```

### POST /connect-onboarding

Creates or reuses the caller's Stripe connected account, creates a single-use
Account Link, stores the current account state in `marketplace.profiles`, and
returns the hosted onboarding URL.

Request:

```json
{
  "returnUrl": "https://site.example/account/stripe/return",
  "refreshUrl": "https://site.example/account/stripe/refresh",
  "collectionFields": "currently_due",
  "businessType": "individual"
}
```

Response:

```json
{
  "url": "https://connect.stripe.com/setup/...",
  "expiresAt": 1760000000
}
```

`collectionFields` is optional and must be either `currently_due` or
`eventually_due`. Default to `currently_due`.

`businessType` is optional and is only used when creating the connected Stripe
account for the first time. Use `individual` for a private seller and `company`
for a professional seller. If it is omitted, Stripe-hosted onboarding collects
the seller type. For C2C/B2C marketplaces, do not set
`STRIPE_CONNECT_BUSINESS_TYPE` globally unless every seller has the same legal
type.

### POST /create-payment

Creates a platform PaymentIntent for a single-seller order. The authenticated
CMS user is the buyer; `sellerUserId` identifies the seller profile.

Request:

```json
{
  "sellerUserId": "local:seller-sub",
  "amountTotal": 12000,
  "platformFeeAmount": 1200,
  "currency": "eur",
  "clientReferenceId": "optional-idempotent-reference",
  "description": "Order #123"
}
```

Response:

```json
{
  "orderId": 42,
  "paymentIntentId": "pi_...",
  "clientSecret": "pi_..._secret_..."
}
```

Store `sellerAmount = amountTotal - platformFeeAmount`. Only create the
PaymentIntent if the seller exists and is eligible for the selected business
rule, usually `payouts_enabled = true` and no blocking `past_due` requirements.

### GET /order-status

Query parameter:

```text
orderId=42
```

Return the order only if the caller is the buyer or seller for that order.

### GET /health

Returns `{ "ok": true }` after validating the CMS bearer token. Use this for
integration smoke tests.

## Internal Functions

Do not expose settlement operations through the public CMS source by default.
Implement them as internal/admin-only Supabase functions or background jobs:

- `marketplace-release-transfer`: creates Stripe Transfers from trusted backend
  automation or admin tooling only, after buyer/seller/escrow checks.
- `marketplace-refund-order`: creates/records refunds and transfer reversals.
- `POST /stripe-webhook`: receives Stripe webhooks, verifies the Stripe signature
  against the raw request body, records `marketplace.stripe_events`, and updates
  local state idempotently.

For Connect webhooks, listen at minimum to `account.updated`. Add
`person.updated` only if you collect or update Persons through the API. Payment
flows should also handle `payment_intent.succeeded`, refund/dispute events, and
transfer or payout failure events relevant to the rollout.

This blueprint does not expose transfer release through the public CMS source or
the bundled Edge Function route. Implement transfer release as trusted backend
automation or admin tooling with explicit buyer/seller/escrow checks.

## Webhook Requirement

For a local proof of concept, the webhook is not strictly required for Connect
onboarding because `/connect-status` retrieves the Stripe Account and
resynchronizes `marketplace.profiles`.

For production, deploy `/stripe-webhook` from the start. It is the reliable path
for `account.updated`, successful/failed payments, refunds, and disputes. Stripe
will retry failed webhook deliveries; the `marketplace.stripe_events` table
keeps processing idempotent.

## Stripe Notes

- Account Links are short-lived and single-use. Always create them server-side
  on demand; do not store the URL as durable state.
- A redirect to `returnUrl` does not mean onboarding is complete. Check account
  requirements through `/connect-status` or webhooks.
- Keep KYC collection out of the CMS. Hosted onboarding lets Stripe collect
  identity, bank account, and document requirements directly.
- For a new Stripe Connect platform, confirm whether the Stripe account should
  use the current Accounts v2 path or an existing Express/Custom Account Links
  integration before implementing the Edge Function internals.

## CMS Installation

The integration definition is available as `definition.json` with kind
`supabase-marketplace`. Configure:

- `id`: usually `marketplace`.
- `functionsBaseUrl`: `https://PROJECT_REF.functions.supabase.co/functions/v1`
  without a trailing slash.
- `apiKey`: the same value as `CMS_MARKETPLACE_API_KEY` in Supabase secrets.

After import, CMS pages or blocs can call:

```text
/.cms/sources/marketplace/connectStatus
/.cms/sources/marketplace/connectOnboarding
/.cms/sources/marketplace/createPayment
/.cms/sources/marketplace/orderStatus?orderId=42
/.cms/sources/marketplace/health
```

## References

- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase Stripe webhook example: https://supabase.com/docs/guides/functions/examples/stripe-webhooks
- Stripe Account Links: https://docs.stripe.com/api/account_links/create
- Stripe Connect webhooks: https://docs.stripe.com/connect/webhooks
