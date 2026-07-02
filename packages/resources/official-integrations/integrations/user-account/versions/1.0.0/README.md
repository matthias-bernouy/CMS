# User Personal Information Integration

This blueprint stores personal information for CMS users through the configured
connector. Version `1.0.0` ships one Supabase connector that owns the database
schema and the `cms-user-account` Edge Function.

The CMS remains the only caller. Current-user endpoints forward a computed
`x-user-id` and a generated private bearer token to the connector function.
Backoffice dashboard endpoints keep `x-user-id` as the acting CMS user and pass
the target user as an explicit request parameter.

## Files

- `definition.json`: declarative CMS integration definition for this version.
- `connectors/supabase/schema.sql`: private Supabase Postgres schema with
  `user_account.accounts`.
- `connectors/supabase/functions/cms-user-account/index.ts`: standalone
  Supabase Edge Function.
- `connectors/supabase/supabase.config.toml`: Supabase function config fragment.

## Automatic Installation

Import kind `user-account`. The only integration answer is:

- `id`: source id, usually `user-account`.

The installer must provide a Supabase connector deployer. That deployer applies
the SQL schema, exposes `user_account` to the Supabase Data API for server-side
function access, creates the private `user-account-avatars` Storage bucket,
deploys the Edge Function, sets `CMS_USER_ACCOUNT_API_KEY` in Supabase function
secrets, and returns `functionsBaseUrl` for the generated CMS source contract.
The import also installs a `Users` dashboard with a create form for the
generated source id.

The CMS generates and stores one secret:

- `cmsApiKey`: shared bearer token accepted from the CMS source.

Never use Supabase service-role or secret keys as the CMS API key.

## Architecture

```text
CMS page or bloc
  -> /.cms/sources/user-account/*
  -> authorization: Bearer <CMS-generated secret>
  -> x-user-id: <computed CMS user id>
  -> Supabase Edge Function cms-user-account
  -> user_account.accounts
```

The browser must never send a trusted `x-user-id` directly to Supabase. The CMS
computes this value and injects it into the source request.

## Table

`user_account.accounts` is keyed by the CMS user id:

```text
cms_user_id text primary key
email text null
phone text null
display_name text null
avatar_url text null
avatar_file_id text null
locale text null
timezone text null
created_at timestamptz
updated_at timestamptz
```

Empty strings sent for editable fields are normalized to `null`. Email values
are lowercased and trimmed. `avatar_url` stores an external HTTP URL when a site
wants to manage avatars elsewhere. `avatar_file_id` stores a private Supabase
Storage object path returned by the connector upload endpoint.

## Storage

The Supabase connector creates a private `user-account-avatars` bucket capped at
5 MiB per object. The Edge Function accepts JPEG, PNG, WebP, and GIF uploads.
The browser never talks to Supabase Storage directly; the CMS dashboard uploads
through the CMS source proxy, and the Edge Function stores the file with its
service-role secret.

## Edge Function Contract

Personal information routes require:

```text
authorization: Bearer <CMS_USER_ACCOUNT_API_KEY>
x-user-id: <computed CMS user id>
```

The Supabase function URL shape is:

```text
https://PROJECT_REF.supabase.co/functions/v1/cms-user-account
```

### GET /personal-information

Returns the current user's personal information row. If the row does not exist yet, the
function returns a stable empty payload with `exists: false`.

### POST /personal-information

Creates or updates the current user's personal information row.

Request:

```json
{
  "email": "reader@example.com",
  "displayName": "Reader",
  "avatarUrl": "https://example.com/avatar.png",
  "avatarFileId": "avatars/4d967.../019f...jpg",
  "locale": "fr-FR",
  "timezone": "Europe/Paris"
}
```

Every field is optional. Send `null` or an empty string to clear a field.

### POST /personal-information/avatar

Uploads an avatar image for the current `x-user-id`.

Request:

```text
multipart/form-data
file File required
```

Returns:

```json
{ "fileId": "avatars/4d967.../019f...jpg" }
```

Save the returned `fileId` through `POST /personal-information` as
`avatarFileId`.

### GET /personal-information/avatar

Streams the current user's saved avatar file.

Query:

```text
fileId string required
```

### POST /delete-account

Deletes only the CMS profile row for the current `x-user-id`. It does not delete
the CMS user, Supabase Auth users, or app-specific profile data.

### GET /personal-information/records

Returns personal information rows for the CMS admin dashboard. The `x-user-id`
header remains the admin actor.

Query:

```text
q string optional
limit number optional, capped at 200
```

`q` searches CMS user id, email, phone, and display name.

### GET /personal-information/record

Returns one personal information row for the CMS admin dashboard. The `x-user-id`
header remains the admin actor.

Query:

```text
userId string required
```

### POST /personal-information/record

Creates or updates one personal information row for a target CMS user. The
`x-user-id` header remains the admin actor. The target user is passed by query
param and should be selected through a dashboard `input: "cms-user"` field.

Query:

```text
userId string required
```

Body is the same shape as `POST /personal-information`.

### POST /personal-information/record/avatar

Uploads an avatar image for a target CMS user. The `x-user-id` header remains
the admin actor.

Query:

```text
userId string required
```

Request:

```text
multipart/form-data
file File required
```

Returns `{ "fileId": "..." }`. Save the returned value through
`POST /personal-information/record` as `avatarFileId`.

### GET /personal-information/record/avatar

Streams one target CMS user's saved avatar file for the admin dashboard.

Query:

```text
userId string required
fileId string required
```

### GET /health

Returns `{ "ok": true }` after validating the CMS bearer token. This endpoint
does not require `x-user-id`.

## References

- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
