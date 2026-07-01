# Supabase Newsletter Integration

This blueprint keeps newsletter state in Supabase while the CMS remains
stateless. The CMS creates a source that calls one Supabase Edge Function with a
private CMS API key.

## Files

- `connectors/supabase/schema.sql`: private Supabase Postgres schema with one table,
  `newsletter.subscriptions`.
- `definition.json`: declarative CMS integration definition for this version.
- `connectors/supabase/functions/cms-newsletter/index.ts`: standalone Supabase
  Edge Function. Create one function named `cms-newsletter` and paste this file.
- `connectors/supabase/supabase.config.toml`: function config fragment. Copy it
  into the target Supabase project's `supabase/config.toml`.

## Architecture

```text
CMS page or bloc
  -> /.cms/sources/newsletter/*
  -> authorization: Bearer <CMS-stored secret>
  -> Supabase Edge Function cms-newsletter
  -> newsletter.subscriptions
```

The CMS stores only the source configuration and the shared API key. Supabase
owns the subscription rows.

## Supabase Setup

1. Run `connectors/supabase/schema.sql` against the target Supabase database.
2. Expose the `newsletter` schema to the Supabase Data API for server-side Edge
   Function access if the target project requires explicit schema exposure.
   The SQL still revokes `anon` and `authenticated`, enables RLS, and grants
   access only to `service_role`.
3. In Supabase, create one Edge Function named `cms-newsletter`, then paste
   `connectors/supabase/functions/cms-newsletter/index.ts` as its `index.ts`.
4. Copy the function config from `connectors/supabase/supabase.config.toml`;
   the function validates its own CMS API key, so `verify_jwt` must be `false`.
5. Deploy the Edge Function with this secret:
   - `CMS_NEWSLETTER_API_KEY`: shared bearer token accepted from the CMS source.

Supabase provides `SUPABASE_URL` and secret/service-role keys to Edge Functions
through environment variables. The function prefers `SUPABASE_SECRET_KEYS` and
falls back to legacy `SUPABASE_SERVICE_ROLE_KEY`. Never expose secret or
service-role keys in browser code.

## Table

`newsletter.subscriptions` is keyed by normalized email:

```text
email text primary key
subscribed boolean not null
created_at timestamptz
updated_at timestamptz
```

Submitting the same email again updates `subscribed`.

## Edge Function Contract

All CMS-called routes require:

```text
authorization: Bearer <CMS_NEWSLETTER_API_KEY>
```

The API key is a private shared secret between the CMS server and the Edge
Function. It is not the Supabase publishable key, anon key, or service-role key.

The public route prefix is:

```text
https://PROJECT_REF.functions.supabase.co/functions/v1/cms-newsletter
```

### POST /set-subscription

Creates or updates one subscription row.

Request:

```json
{
  "email": "reader@example.com",
  "subscribed": true
}
```

Response:

```json
{
  "email": "reader@example.com",
  "subscribed": true
}
```

Use `subscribed: false` to unsubscribe the email.

### GET /subscription-status

Query parameter:

```text
email=reader@example.com
```

Response:

```json
{
  "email": "reader@example.com",
  "subscribed": true
}
```

If no row exists, the function returns `subscribed: false`.

### GET /health

Returns `{ "ok": true }` after validating the CMS bearer token. Use this for
integration smoke tests.

## CMS Installation

Import `definition.json` with kind `supabase-newsletter`. Configure:

- `id`: usually `newsletter`.
- `functionsBaseUrl`: `https://PROJECT_REF.functions.supabase.co/functions/v1`
  without a trailing slash.
- `apiKey`: the same value as `CMS_NEWSLETTER_API_KEY` in Supabase secrets.

After import, CMS pages or blocs can call:

```text
/.cms/sources/newsletter/setSubscription
/.cms/sources/newsletter/subscriptionStatus?email=reader@example.com
/.cms/sources/newsletter/health
```

## References

- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
