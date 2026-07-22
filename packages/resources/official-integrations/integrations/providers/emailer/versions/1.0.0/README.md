# Emailer Integration

This integration manages transactional email templates, direct Newsletter
broadcasts, and durable Newsletter campaigns through the configured SMTP
connector. Version `1.0.0` ships one Supabase connector and requires the
Newsletter integration as its audience source.

The CMS stores the source configuration, generated CMS API key reference,
templates, and send logs. The connector provider owns SMTP configuration. The
Supabase Edge Function owns template rendering, required token validation, SMTP
delivery, and audit rows.

## Files

- `definition.json`: entry point for the declarative definition assembled from
  `definitions/`.
- `connectors/supabase/sql/schema.manifest.json`: ordered private schema bundle
  for `emailer.templates`, `emailer.messages`, and `emailer.settings`.
- `connectors/supabase/sql/broadcast-schema.manifest.json`: ordered private
  bundle for durable campaign state.
- `connectors/supabase/functions/cms-emailer/index.ts`: Supabase Edge Function
  exposing the CMS-facing email API.
- `connectors/supabase/functions/cms-broadcast/`: Supabase Edge Function for
  campaign creation, progress, pause, cancel, retry, and bounded ticks.
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

Campaigns dashboard or CMS function
  -> /.cms/sources/emailer-broadcast/*
  -> Supabase Edge Function cms-broadcast
  -> Newsletter audience snapshot
  -> cms-emailer /template/send
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

Install Newsletter first, then import `definition.json` with kind `emailer`.
Configure:

- `id`: usually `emailer`.

The import generates private Emailer and Broadcast CMS API keys, deploys both
Supabase Edge Functions, installs both sources, installs the campaign control
functions, and installs the dashboards.

The dashboards expose template creation and editing, test sends, campaign
progress, and an editable Settings detail for provider SMTP configuration.

## Broadcasts

`sendNewsletterBroadcast` remains available for direct, small, synchronous
sends. It is intentionally bounded and primarily useful for smoke tests.

Production campaigns use `startNewsletterBroadcast`. The broadcast connector
snapshots active Newsletter subscribers, persists recipient progress, and sends
bounded batches through Emailer. The installed status, pause, cancel, and retry
functions keep long-running delivery outside the CMS function execution budget.

Configure `pg_cron` or an external scheduler to call the broadcast `tick`
endpoint until active campaigns reach a terminal state.

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
