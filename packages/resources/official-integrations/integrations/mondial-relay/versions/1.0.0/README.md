# Mondial Relay Delivery Integration

This blueprint creates a CMS source and dashboard for Mondial Relay Connect
shipping. The CMS stays stateless for delivery data: it injects a generated
private API key server-side, while the Supabase Edge Function owns Mondial Relay
Connect calls and stores operational rows in a private `delivery` schema.

## Files

- `definition.json`: declarative CMS integration definition for this version.
- `connectors/supabase/schema.sql`: private Supabase Postgres schema for
  shipments, tracking events, and editable delivery settings.
- `connectors/supabase/functions/cms-delivery/index.ts`: Supabase Edge Function
  entrypoint.
- `connectors/supabase/functions/cms-delivery/*.ts`: helper modules imported by
  the entrypoint. The CMS Supabase deployer uploads the whole function
  directory, so relative imports stay deployable.
- `connectors/supabase/supabase.config.toml`: function config fragment.

## Architecture

```text
CMS dashboard or source call
  -> /.cms/sources/delivery/*
  -> Supabase Edge Function cms-delivery
  -> private delivery schema
  -> Mondial Relay Connect API v2
```

The Edge Function wraps Mondial Relay Connect shipment creation in JSON
endpoints for the CMS and proxies the official Mondial Relay parcel shop picker
service for pickup point lookup. It never exposes Mondial Relay credentials,
Supabase service-role keys, or the generated CMS API key to browser code.

## Supabase Setup

1. Run `connectors/supabase/schema.sql` against the target Supabase database.
2. Expose the `delivery` schema to the Supabase Data API for server-side Edge
   Function access. The SQL still revokes `anon` and `authenticated` and grants
   access only to `service_role`. When this integration is deployed through the
   Supabase connector deployer, `definition.json` declares
   `dataApiSchemas: ["delivery"]` so the deployer can synchronize
   `pgrst.db_schemas` on the `authenticator` role before reloading the PostgREST
   config and schema cache automatically.
3. Deploy the `cms-delivery` Edge Function from the full
   `connectors/supabase/functions/cms-delivery` directory.
4. Copy the function config from `connectors/supabase/supabase.config.toml`;
   the function validates its own CMS API key, so `verify_jwt` must be `false`.
5. Deploy the Edge Function with the secrets below. When installing through the
   CMS Supabase connector flow, these values are collected from the integration
   form and pushed to Supabase automatically:
   - `CMS_DELIVERY_API_KEY`: generated bearer token accepted from the CMS source.
   - `MONDIAL_RELAY_CONNECT_ENDPOINT`: Connect endpoint, for example
     `https://connect-api-sandbox.mondialrelay.com/api/shipment`.
   - `MONDIAL_RELAY_CONNECT_LOGIN`: Connect API login.
   - `MONDIAL_RELAY_CONNECT_PASSWORD`: Connect API password.
   - `MONDIAL_RELAY_CONNECT_CUSTOMER_ID`: Connect brand/customer id.
   - `MONDIAL_RELAY_WIDGET_BRAND`: parcel shop picker brand. The declarative
     installer sets it from `mondialRelayConnectCustomerId` so the CMS form only
     asks for the API 2 identity once.
   - `SUPABASE_URL`: Supabase project URL.
   - `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY`: server-side key used
     only inside the Edge Function. Hosted Supabase projects expose
     `SUPABASE_SECRET_KEYS` as a JSON dictionary; the function reads the
     `default` entry.

Delivery modes, sender address, default parcel dimensions, label output
options, and declared currency are stored in the private
`delivery.settings` table. They are edited from the CMS dashboard through the
source endpoints and do not require redeploying the Edge Function.

Never expose `CMS_DELIVERY_API_KEY`, `MONDIAL_RELAY_CONNECT_PASSWORD`, Supabase
secret keys, or service-role keys to browser code.

If the Edge Function returns `Invalid schema: delivery`, the database schema
exists but PostgREST/Data API has not exposed it yet or has a stale schema
cache. The CMS Supabase connector deployer handles both automatically. For a
manual install, add `delivery` to the Supabase Data API exposed schemas, run
`alter role authenticator set pgrst.db_schemas = 'public,storage,delivery';`,
then run `notify pgrst, 'reload config';` and
`notify pgrst, 'reload schema';` before retrying the request. Keep any existing
schemas from the project in the comma-separated list.

## CMS Installation

Import `definition.json` with kind `mondial-relay`. Configure:

- `id`: usually `delivery`.
- `mondialRelayConnectEndpoint`: Connect shipment endpoint.
- `mondialRelayConnectLogin`: Connect API login.
- `mondialRelayConnectPassword`: Connect API password.
- `mondialRelayConnectCustomerId`: Connect brand/customer id.

After import, CMS pages, blocs, or dashboards can call:

```text
/.cms/sources/delivery/shipments
/.cms/sources/delivery/shipment?id=<shipment-id>
/.cms/sources/delivery/settings
/.cms/sources/delivery/setting?id=default
/.cms/sources/delivery/setSettings
/.cms/sources/delivery/relayPoints?country=FR&postalCode=75001&weightGrams=500
/.cms/sources/delivery/createShipment
/.cms/sources/delivery/label?expeditionNumber=<number>
/.cms/sources/delivery/tracking?expeditionNumber=<number>
/.cms/sources/delivery/parseTrackingLink?url=<mondial-relay-url>
```

The dashboard shipment form uses a `lookup` field backed by `relayPoints`, so
operators select a pickup point instead of typing a relay code manually. The
lookup uses Mondial Relay's official parcel shop picker service with the same
brand/customer id used for Connect shipment creation; it does not require API 1
SOAP private-key credentials.

The same form pre-fills shipment country, delivery modes, parcel dimensions,
content, and currency from the editable `default` settings profile. Operators
can override those values before creating each shipment.

Use the dashboard `Edit settings` action after installation and fill the
`default` profile before creating labels. The Edge Function normalizes French
phone numbers to E.164 for Connect, for example `0608138404` and
`+330608138404` become `+33608138404`.

## Live Label Test

The repository test suite mocks Mondial Relay by default so CI stays
deterministic and never creates live shipments. To verify real Connect sandbox
label creation, run the opt-in live test from the workspace root:

```bash
MONDIAL_RELAY_CONNECT_LIVE_TEST=1 \
MONDIAL_RELAY_CONNECT_LOGIN=<api-2-login> \
MONDIAL_RELAY_CONNECT_PASSWORD=<api-2-password> \
MONDIAL_RELAY_CONNECT_CUSTOMER_ID=<api-2-brand-id> \
bun test packages/resources/official-integrations/tests/mondial-relay-connect.live.test.ts
```

`MONDIAL_RELAY_CONNECT_ENDPOINT` defaults to
`https://connect-api-sandbox.mondialrelay.com/api/shipment`.
`MONDIAL_RELAY_CONNECT_RELAY_LOCATION` defaults to `FR-031270`.

## 1.0.0 Scope

- Mondial Relay Connect API v2 only.
- France pickup point delivery only: `CCC` collection, `24R` delivery, `FR`
  sender, recipient, and relay location country.
- Pickup point lookup through the official Mondial Relay parcel shop picker
  service using the Connect brand/customer id.
- Editable delivery settings stored in `delivery.settings` and managed through
  the CMS source/dashboard.
- Standalone delivery rows, with an optional `externalOrderId` for future order
  integrations.
- Shipment creation returns a shipment number and a PDF label URL.
- Label retrieval proxies the stored label URL through the CMS source endpoint.
- Tracking currently reads stored shipment events and parses Mondial Relay
  tracking links; it does not yet call a Connect tracking endpoint.

The current dashboard renderer has no generic file-opening row action yet. The
source already exposes `label` as a file endpoint and stores `labelUrl` on
shipments so a later dashboard action can open or print labels without changing
the connector contract.

## References

- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
- Mondial Relay Connect sandbox endpoint:
  https://connect-api-sandbox.mondialrelay.com/api/shipment
- Mondial Relay parcel shop picker documentation:
  https://storage.mondialrelay.fr/widget-v-411.pdf
