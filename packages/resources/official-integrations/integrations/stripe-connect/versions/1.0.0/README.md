# Stripe Connect C2C Integration

This blueprint connects C2C sellers to Stripe transfer accounts and creates
destination-charge PaymentIntents through the configured connector. Version
`1.0.0` ships one Supabase connector that owns the database schema and the
`cms-stripe-connect` Edge Function.

The CMS remains the only caller. User-facing endpoints forward a computed
`x-user-id` and a generated private bearer token to the connector function.
Backoffice dashboard endpoints use the same private bearer token and remain
behind CMS admin permissions.

## Files

- `definition.json`: declarative CMS integration definition for this version.
- `blocs/stripe-connect-onboarding`: user-facing Stripe embedded onboarding
  bloc.
- `connectors/supabase/schema.sql`: private Supabase Postgres schema with
  `stripe_connect.accounts` and `stripe_connect.payments`.
- `connectors/supabase/functions/cms-stripe-connect/index.ts`: standalone
  Supabase Edge Function.
- `connectors/supabase/supabase.config.toml`: Supabase function config fragment.

## Automatic Installation

Import kind `stripe-connect`. Integration answers are:

- `id`: source id, usually `stripe-connect`.
- `stripeSecretKey`: Stripe secret or restricted key used only by the Supabase
  Edge Function.
- `stripePublishableKey`: Stripe publishable key returned by the user-facing
  client config endpoint for ConnectJS initialization.
- `defaultCountry`: default country for newly created seller accounts.
- `defaultCurrency`: default currency for newly created PaymentIntents.

The installer must provide a Supabase connector deployer. That deployer applies
the SQL schema, exposes `stripe_connect` to the Supabase Data API for
server-side function access, deploys the Edge Function, sets
`CMS_STRIPE_CONNECT_API_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_DEFAULT_COUNTRY`, and
`STRIPE_CONNECT_DEFAULT_CURRENCY` in Supabase function secrets, and returns
`functionsBaseUrl` for the generated CMS source contract.

The CMS generates and stores one secret:

- `cmsApiKey`: shared bearer token accepted from the CMS source.

The CMS also stores the provided Stripe secret key so the connector deployer can
inject it into Supabase. Never expose that key to browser code.

## Architecture

```text
CMS page or bloc
  -> /.cms/sources/stripe-connect/*
  -> authorization: Bearer <CMS-generated secret>
  -> x-user-id: <computed CMS user id>
  -> Supabase Edge Function cms-stripe-connect
  -> Stripe API + stripe_connect schema
```

The browser must never send a trusted `x-user-id` directly to Supabase. The CMS
computes this value and injects it into the source request.

## Onboarding Bloc

The integration installs one bloc:

```html
<stripe-connect-onboarding source-id="stripe-connect"></stripe-connect-onboarding>
```

It loads Stripe Connect.js, calls `getConnectClientConfig` to get the
publishable key, then calls `createOnboardingSession` to mount Stripe Embedded
Account Onboarding for the current C2C seller.

Optional attributes:

- `source-id`: installed source id. Defaults to `stripe-connect`.
- `source-prefix`: source proxy prefix. Defaults to `/.cms/sources`.
- `email`, `country`: optional Stripe account prefill values.
- `title`, `copy`, `button-label`, `connected-label`: display labels.
- `preview-label`: display label used when the bloc runs inside an editor
  iframe and cannot open the Stripe authentication popup.
- `locale`: passed to Stripe Connect.js.
- `auto`: starts onboarding as soon as the bloc connects.

The integration grants authenticated users access to
`getConnectClientConfig`, `createOnboardingSession`, `createOnboardingLink`,
and `getConnectStatus` during import. The integration definition declares the
Stripe Connect.js script, network, and frame CSP origins used by the bloc.

## Tables

`stripe_connect.accounts` is keyed by the CMS user id:

```text
cms_user_id text primary key
stripe_account_id text unique
country text
business_type text null
onboarding_status text
charges_enabled boolean
payouts_enabled boolean
details_submitted boolean
disabled_reason text null
requirements_* text[] / jsonb
created_at timestamptz
updated_at timestamptz
```

`stripe_connect.payments` stores CMS-side PaymentIntent state:

```text
id bigint identity primary key
client_reference_id text unique null
buyer_cms_user_id text
seller_cms_user_id text
stripe_payment_intent_id text unique null
stripe_charge_id text null
currency text
amount_total integer
application_fee_amount integer
seller_amount integer
status text
created_at timestamptz
updated_at timestamptz
```

Amounts are stored in the smallest currency unit.

## Edge Function Contract

User-facing routes require:

```text
authorization: Bearer <CMS_STRIPE_CONNECT_API_KEY>
x-user-id: <computed CMS user id>
```

Backoffice routes require the bearer token and do not require `x-user-id`.

The Supabase function URL shape is:

```text
https://PROJECT_REF.supabase.co/functions/v1/cms-stripe-connect
```

### GET /connect/status

Returns the current user's Stripe connected account status. If a Stripe account
exists, the function first retrieves it from Stripe and stores the latest status.

### GET /connect/config

Returns the Stripe publishable key used by the front end to initialize ConnectJS
for embedded onboarding.

### POST /connect/onboarding/session

Creates a Stripe connected seller account if needed, then creates an Account
Session for Stripe Connect embedded onboarding. Seller accounts are created as
individual, recipient-agreement, transfers-only accounts. The response
`clientSecret` is a single-use front-end token for ConnectJS.

Request:

```json
{
  "email": "seller@example.com",
  "country": "FR"
}
```

All fields are optional. They are used as Stripe account prefill values when a
connected seller account is created.

### POST /connect/onboarding

Fallback hosted onboarding route. Prefer `/connect/onboarding/session` for the
main product UX.

Creates a Stripe connected seller account if needed, then creates an account
onboarding link.

Request:

```json
{
  "returnUrl": "https://example.com/stripe/return",
  "refreshUrl": "https://example.com/stripe/refresh",
  "email": "seller@example.com",
  "country": "FR"
}
```

Only `returnUrl` and `refreshUrl` are required.

### POST /payments

Creates a destination-charge PaymentIntent for the current buyer and a connected
seller.

Request:

```json
{
  "sellerUserId": "local:019f...",
  "amountTotal": 10000,
  "applicationFeeAmount": 1200,
  "currency": "eur",
  "clientReferenceId": "order_123",
  "description": "Order #123"
}
```

Returns the CMS payment id, Stripe PaymentIntent id, current status, and client
secret.

### GET /payments/payment

Returns one payment visible to the current user.

Query:

```text
paymentId number required
```

### GET /admin/accounts

Returns connected accounts for the CMS dashboard.

Query:

```text
q string optional
status string optional
limit number optional, capped at 200
```

### GET /admin/accounts/account

Returns and refreshes one connected account by CMS user id.

Query:

```text
userId string required
```

### POST /admin/accounts/account/onboarding/session

Creates or refreshes a Stripe embedded onboarding Account Session for a target
CMS user. The admin is only the actor; the target user is passed explicitly.

Query:

```text
userId string required
```

Request body is the same shape as `POST /connect/onboarding/session`.

### POST /admin/accounts/account/onboarding

Fallback hosted onboarding route. Prefer
`/admin/accounts/account/onboarding/session` for the main dashboard flow.

Creates or refreshes a Stripe onboarding link for a target CMS user. The admin
is only the actor; the target user is passed explicitly.

Query:

```text
userId string required
```

Request body is the same shape as `POST /connect/onboarding`.

### GET /admin/payments

Returns payments for the CMS dashboard.

Query:

```text
q string optional
status string optional
limit number optional, capped at 200
```

### POST /admin/payments

Creates a destination-charge PaymentIntent for explicit buyer and seller CMS
users.

Request:

```json
{
  "buyerUserId": "local:019f...",
  "sellerUserId": "local:019e...",
  "amountTotal": 10000,
  "applicationFeeAmount": 1200,
  "currency": "eur",
  "clientReferenceId": "order_123",
  "description": "Order #123"
}
```

Returns the CMS payment id, Stripe PaymentIntent id, current status, and client
secret.

### GET /admin/payments/payment

Returns and refreshes one payment by CMS payment id.

Query:

```text
paymentId number required
```

### GET /health

Returns `{ "ok": true }` after validating the CMS bearer token. This endpoint
does not require `x-user-id`.

## V1 Limit

This version does not install a Stripe webhook endpoint. Payment and account
state is refreshed when status endpoints are read. Add Stripe webhook handling
before using dashboard state as a settlement, dispute, or payout source of
truth.

## References

- Stripe account creation: https://docs.stripe.com/api/accounts/create
- Stripe Account Sessions: https://docs.stripe.com/api/account_sessions/create
- Stripe embedded onboarding: https://docs.stripe.com/connect/embedded-onboarding
- Stripe account links: https://docs.stripe.com/api/account_links/create
- Stripe PaymentIntent creation: https://docs.stripe.com/api/payment_intents/create
- Stripe destination charges: https://docs.stripe.com/connect/destination-charges
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
