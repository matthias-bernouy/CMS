# Basic CMS image

Single-tenant CMS — admin Control + public Delivery — served by one Bun
process. nginx sits in front as a reverse-proxy sidecar.

Everything is in-memory: content, files, secrets, users, identity providers,
PATs, rate limits. Nothing persists across restarts. This is the "5-minute
demo" entrypoint, not a production deployment.

## Quick start

```bash
docker compose -f images/cms/compose.yml up --build
```

Then :

| URL | Purpose |
|---|---|
| `http://localhost:8080/`              | public site (Delivery — renders pages from the in-memory repo) |
| `http://localhost:8080/cms/admin/`    | admin UI (Control) |
| `http://localhost:8080/cms/login`     | sign-in page |

Bootstrap credentials come from `compose.yml`:

```
admin@local.com / dev-admin-password
```

## Configuration

The `cms` service reads its env from `compose.yml`. The strict minimum:

| Env | Description |
|---|---|
| `PORT`               | port the Bun process listens on (default `3000`, internal to the compose network) |
| `CMS_PUBLIC_URL`     | absolute URL the admin uses to build callback / public links (must match the URL the browser sees — including the nginx port) |
| `CMS_SESSION_SECRET` | HMAC key signing the session cookie. **`openssl rand -hex 32`** for anything but a local demo. |
| `CMS_ADMIN_EMAIL`    | bootstrap admin email — defaults to `admin@local.com` |
| `CMS_ADMIN_PASSWORD` | bootstrap admin password. When absent a random one is generated and printed on stdout (gated `NODE_ENV !== "production"` so a mis-wired prod image cannot leak it). |
| `NODE_ENV`           | `development` in the shipped compose; flip to `production` to silence the generated-password log path. |

## What this image is NOT

- **Not persistent.** Restart the `cms` container and every page, every
  user, every uploaded file is gone.
- **Not multi-tenant.** One CMS instance, one admin pool. The multi-tenant
  variant (`@bernouy/mt-cms-control`) is a separate composition root, not
  shipped in this image today.
- **Not TLS-terminated.** nginx listens on plain `:80` inside the network
  and the host publishes `:8080`. Put Cloudflare / nginx-proxy-manager / a
  certbot sidecar in front for HTTPS in production.
- **Not HA.** Single process, in-memory state.

## Upgrading away from in-memory

The composition root in `server.ts` only wires `InMemory*` providers. To
add persistence, swap the relevant repo: `MongoCmsRepository`,
`MongoUsersRepository`, `EncryptedMongoSecretStore`, etc. — they all
satisfy the same interfaces. That's a different image, not a config
change.
