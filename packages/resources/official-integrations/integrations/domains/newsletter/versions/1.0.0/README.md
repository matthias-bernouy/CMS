# Newsletter Integration

This integration stores newsletter subscription state through the configured
connector. Version `1.0.0` ships one Supabase connector.

## Files

- `definition.json`: declarative CMS integration definition.
- `connectors/supabase/schema.sql`: private Supabase Postgres schema with one
  `newsletter.subscriptions` table.
- `connectors/supabase/functions/cms-newsletter/index.ts`: Supabase Edge
  Function that exposes the CMS-facing newsletter API.
- `connectors/supabase/supabase.config.toml`: Edge Function config fragment.

## Architecture

```text
CMS page, bloc, or dashboard
  -> /.cms/sources/newsletter/*
  -> authorization: Bearer <CMS-stored generated secret>
  -> Supabase Edge Function cms-newsletter
  -> newsletter.subscriptions
```

The CMS stores only the source configuration and a generated API key reference.
Supabase owns the subscription rows.

## Supabase Connector

The CMS connector deployer applies the bundled SQL, deploys the
`cms-newsletter` Edge Function, exposes the `newsletter` schema to the server
Data API, and sets `CMS_NEWSLETTER_API_KEY` from the generated CMS secret.

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
https://PROJECT_REF.supabase.co/functions/v1/cms-newsletter
```

### GET /subscriptions

Query parameters:

```text
q=reader
subscribed=true
limit=100
```

Response:

```json
{
  "subscriptions": [
    {
      "exists": true,
      "email": "reader@example.com",
      "subscribed": true,
      "createdAt": "2026-07-02T00:00:00Z",
      "updatedAt": "2026-07-02T00:00:00Z"
    }
  ],
  "total": 1
}
```

### GET /subscriptions/export

Query parameters:

```text
q=reader
subscribed=true
```

Returns a `text/csv` file with:

```text
email,subscribed,createdAt,updatedAt
reader@example.com,true,2026-07-02T00:00:00Z,2026-07-02T00:00:00Z
```

### GET /subscription

Query parameter:

```text
email=reader@example.com
```

Returns one subscription. If no row exists, the response includes
`exists: false`.

### POST /subscription

Creates or updates one subscription row. The email may be provided as a query
parameter or body field.

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
  "exists": true,
  "email": "reader@example.com",
  "subscribed": true
}
```

Use `subscribed: false` to unsubscribe the email.

### DELETE /subscription

Query parameter:

```text
email=reader@example.com
```

Response:

```json
{
  "deleted": true,
  "email": "reader@example.com"
}
```

### GET /health

Returns `{ "ok": true }` after validating the CMS bearer token.

## CMS Installation

Import `definition.json` with kind `newsletter`. Configure:

- `id`: usually `newsletter`.

The import generates the private CMS API key, deploys the Supabase connector,
installs the source, and installs the subscriptions dashboard.
