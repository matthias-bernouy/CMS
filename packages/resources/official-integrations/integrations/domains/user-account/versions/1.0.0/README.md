# User Personal Information Integration

This blueprint stores personal information for CMS users through the configured
connector. Version `1.0.0` ships one Supabase connector that owns the database
schema and the `cms-user-account` Edge Function.

The public account form depends on the `basic-blocs` integration. It is a Light
DOM server composition built from `basic-stack`, `basic-grid`, `basic-input`,
`basic-button`, native forms, and the page-level declarative CMS binding
runtime. Avatar selection is encapsulated by the form-associated
`user-account-avatar` component and its Shadow DOM. The form editor settings
can hide individual identity, contact, address, and regional-preference fields
without exposing the generated children in the page structure.

The CMS remains the only caller. Current-user endpoints forward a computed
`x-user-id` and a generated private bearer token to the connector function.
Backoffice dashboard endpoints keep `x-user-id` as the acting CMS user and pass
the target user as an explicit request parameter.

## Files

- `definition.json`: entry point for this version's declarative definition,
  assembled from `definitions/`.
- `connectors/supabase/sql/schema.manifest.json`: ordered private schema bundle
  with `user_account.accounts`.
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
phone text null
given_name text null
surname text null
birth_date date null
address_line_1 text null
address_line_2 text null
address_line_3 text null
postal_code text null
city text null
region text null
country_code text null
avatar_url text null
avatar_file_id text null
locale text null
timezone text null
created_at timestamptz
updated_at timestamptz
```

Empty strings sent for editable fields are normalized to `null`. The login
email remains owned by CMS authentication and is not copied into this schema.
`avatar_url` stores an external HTTP URL when a site
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
  "phone": "+33600000000",
  "givenName": "Ada",
  "surname": "Lovelace",
  "birthDate": "1992-04-18",
  "addressLine1": "12 rue des Tests",
  "addressLine2": "Bâtiment B",
  "addressLine3": "Appartement 4",
  "postalCode": "75001",
  "city": "Paris",
  "region": "Île-de-France",
  "countryCode": "FR",
  "avatarUrl": "https://example.com/avatar.png",
  "avatarFileId": "avatars/4d967.../019f...jpg",
  "locale": "fr-FR",
  "timezone": "Europe/Paris"
}
```

Every field is optional. Send `null` or an empty string to clear a field.
`birthDate` uses `YYYY-MM-DD`; `countryCode` uses an ISO 3166-1 alpha-2 code.

### POST /personal-information/metadata

Partially updates the current user's configured extra fields. Field ids are
sent directly as top-level keys so native CMS forms do not need to construct a
nested object.

```json
{
  "level": "club",
  "playingStyles": ["aggressive", "all-court"]
}
```

Unknown fields and values that do not match the configured type or allowed
options are rejected. Existing metadata keys omitted from the request are kept.

### POST /personal-information/avatar

Uploads an avatar image for the current `x-user-id` and attaches it to the
personal information row.

Request:

```text
multipart/form-data
file File required
```

Returns the updated personal information row, including `avatarFileId`.

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

`q` searches CMS user id, phone, given name, and surname.

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

Uploads and attaches an avatar image for a target CMS user. The `x-user-id`
header remains the admin actor.

Query:

```text
userId string required
```

Request:

```text
multipart/form-data
file File required
```

Returns the updated personal information row, including `avatarFileId`.

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
