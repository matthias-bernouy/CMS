# Supabase User Account Integration

This blueprint stores minimal CMS user account data in Supabase while the CMS
remains the only caller. The CMS source forwards its computed `x-user-id` and a
private bearer token to one Supabase Edge Function.

## Files

- `connectors/supabase/schema.sql`: private Supabase Postgres schema with
  `user_account.accounts`.
- `definition.json`: declarative CMS integration definition for this version.
- `connectors/supabase/functions/cms-user-account/index.ts`: standalone
  Supabase Edge Function. Create one function named `cms-user-account` and paste
  this file.
- `connectors/supabase/supabase.config.toml`: function config fragment. Copy it
  into the target Supabase project's `supabase/config.toml`.

## Architecture

```text
CMS page or bloc
  -> /.cms/sources/user-account/*
  -> authorization: Bearer <CMS-stored secret>
  -> x-user-id: <computed CMS user id>
  -> Supabase Edge Function cms-user-account
  -> user_account.accounts
```

The browser must never send a trusted `x-user-id` directly to Supabase. The CMS
computes this value and injects it into the source request.

## Supabase Setup

1. Run `connectors/supabase/schema.sql` against the target Supabase database.
2. Expose the `user_account` schema to the Supabase Data API for server-side
   Edge Function access if the target project requires explicit schema
   exposure. The SQL still revokes `anon` and `authenticated`, enables RLS, and
   grants access only to `service_role`.
3. In Supabase, create one Edge Function named `cms-user-account`, then paste
   `connectors/supabase/functions/cms-user-account/index.ts` as its `index.ts`.
4. Copy the function config from `connectors/supabase/supabase.config.toml`;
   the function validates its own CMS API key, so `verify_jwt` must be `false`.
5. Configure the CMS source with one dedicated server-side secret:
   - `CMS_USER_ACCOUNT_API_KEY`: shared bearer token accepted from the CMS
     source. Use a random value distinct from Supabase service keys.

Supabase provides `SUPABASE_URL` and secret/service-role keys to Edge Functions
through environment variables. The function prefers `SUPABASE_SECRET_KEYS` and
falls back to legacy `SUPABASE_SERVICE_ROLE_KEY` for Supabase REST access only.
Never expose secret/service-role keys in browser code, and never use them as
the CMS integration API key.

## Table

`user_account.accounts` is keyed by the CMS user id:

```text
cms_user_id text primary key
email text null
phone text null
display_name text null
avatar_url text null
locale text null
timezone text null
created_at timestamptz
updated_at timestamptz
```

Empty strings sent for editable fields are normalized to `null`. Email values
are lowercased and trimmed.

## Edge Function Contract

Account routes require:

```text
authorization: Bearer <CMS_USER_ACCOUNT_API_KEY>
x-user-id: <computed CMS user id>
```

The public route prefix is:

```text
https://PROJECT_REF.functions.supabase.co/functions/v1/cms-user-account
```

### GET /account

Returns the current user account row. If the row does not exist yet, the
function returns a stable empty payload with `exists: false`.

### POST /account

Creates or updates the current user account row.

Request:

```json
{
  "email": "reader@example.com",
  "displayName": "Reader",
  "avatarUrl": "https://example.com/avatar.png",
  "locale": "fr-FR",
  "timezone": "Europe/Paris"
}
```

Every field is optional. Send `null` or an empty string to clear a field.

### POST /delete-account

Deletes only the CMS profile row for the current `x-user-id`. It does not delete
the CMS user, Supabase Auth users, or app-specific profile data.

### GET /health

Returns `{ "ok": true }` after validating the CMS bearer token. This endpoint
does not require `x-user-id`.

## CMS Installation

Import the standalone definition from `definition.json` with kind
`supabase-user-account`. Configure:

- `id`: usually `user-account`.
- `functionsBaseUrl`: `https://PROJECT_REF.functions.supabase.co/functions/v1`
  without a trailing slash.
- `apiKey`: the same dedicated value as `CMS_USER_ACCOUNT_API_KEY` in Supabase
  secrets.

After import, CMS pages or blocs can call:

```text
/.cms/sources/user-account/getAccount
/.cms/sources/user-account/updateAccount
/.cms/sources/user-account/deleteAccount
/.cms/sources/user-account/health
```

## References

- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
- Supabase database functions and privileges: https://supabase.com/docs/guides/database/functions
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
