# Emailer Integration

This integration manages transactional email templates and sends system emails
through the configured SMTP connector. Version `1.0.0` ships one Supabase
connector.

The CMS stores the source configuration, generated CMS API key reference,
templates, and send logs. The connector provider owns SMTP configuration. The
Supabase Edge Function owns template rendering, required token validation, SMTP
delivery, and audit rows.

## Files

- `definition.json`: declarative CMS integration definition.
- `connectors/supabase/schema.sql`: private Supabase Postgres schema with
  `emailer.templates`, `emailer.messages`, and `emailer.settings`.
- `connectors/supabase/functions/cms-emailer/index.ts`: Supabase Edge Function
  exposing the CMS-facing email API.
- `connectors/supabase/functions/cms-emailer/deno.json`: function-local npm
  dependency map for SMTP delivery.
- `connectors/supabase/supabase.config.toml`: Edge Function config fragment.

## Architecture

```text
CMS function, trigger, or admin dashboard
  -> /.cms/sources/emailer/*
  -> authorization: Bearer <CMS-stored generated secret>
  -> Supabase Edge Function cms-emailer
  -> emailer schema
  -> SMTP server
```

The `sendTemplateEmail` endpoint is declared with `system` access. Pages and
public browser code should call application functions or triggers instead of
calling this source endpoint directly.

## Template Model

Templates use simple `{{ token.path }}` interpolation in subject, HTML body, and
text body. Tokens are data lookups only; loops, conditions, and arbitrary
JavaScript are intentionally unsupported.

Declared required tokens must be present before rendering or sending. Missing
optional tokens render as an empty string.

## CMS Installation

Import `definition.json` with kind `emailer`. Configure:

- `id`: usually `emailer`.

The import generates the private CMS API key, deploys the Supabase connector,
installs the source, and installs the dashboard.

The dashboards expose template creation and editing, test sends, and an editable
Settings detail for provider SMTP configuration.

## Provider SMTP Configuration

The Settings dashboard writes SMTP host, port, secure mode, user, password,
default sender, and optional reply-to into the provider-owned
`emailer.settings` row. The SMTP password is write-only in the CMS UI: the Edge
Function returns only a configured/missing status.

The Supabase connector can also receive these function secrets from the provider
environment:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SMTP_REPLY_TO` (optional)

These values are pushed to Supabase Edge Function secrets by the provider
deployer and act as fallbacks when the `emailer.settings` row leaves a value
empty. They are not integration installation answers and are not stored as CMS
integration secrets.
