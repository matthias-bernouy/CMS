# Production setup

End-to-end procedure to run BasicStorageProvider on a real server with a
real domain, real TLS, and a real system user. Assumes a fresh Linux box
with `sudo` access.

> If you haven't already worked through [`docs/dev/getting-started.md`](../dev/getting-started.md),
> do that first on your laptop. Most concepts (LocalBlobStorage, the
> `generated/` Nginx fragments, the `config.nginx.cacheControlsPath` /
> `publicHost` settings) carry over verbatim — only the surface around
> them (DNS, TLS, systemd, permissions) changes.

---

## 0. Prerequisites

- A Linux server with a public IP.
- A domain you control DNS for (call it `bernouy.com` below — replace
  throughout with yours).
- Bun, Nginx, MongoDB installed (or Mongo hosted elsewhere).
- `lego` installed (for the wildcard cert via DNS-01).

```bash
# Bun
curl -fsSL https://bun.sh/install | bash

# Nginx + lego (Debian/Ubuntu)
sudo apt update
sudo apt install -y nginx lego

# Mongo: install locally or use Atlas / managed service.
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

---

## 1. Domain + DNS

You need **two** records:

| Record                     | Type   | Value          |
| -------------------------- | ------ | -------------- |
| `cdn.bernouy.com`          | `A`    | server IP      |
| `*.cdn.bernouy.com`        | `A`    | server IP      |

The wildcard is what lets every bucket get its own subdomain
(`bucket-1234.cdn.bernouy.com`) without per-bucket DNS work.

For custom aliases (e.g. `assets.partner.tld`) the *partner* sets up a
CNAME pointing at `<bucketId>.cdn.bernouy.com` (or an A record at our IP).
Each alias still needs its own TLS cert — see §7.

---

## 2. Wildcard TLS cert (`lego`, DNS-01)

DNS-01 is the only ACME challenge that issues wildcard certs. You need API
credentials with your DNS provider so `lego` can create the TXT record
itself.

```bash
# OVH example — adapt the env vars to your provider
# (https://go-acme.github.io/lego/dns/ has the full list)
export OVH_APPLICATION_KEY=...
export OVH_APPLICATION_SECRET=...
export OVH_CONSUMER_KEY=...
export OVH_ENDPOINT=ovh-eu

sudo --preserve-env=OVH_APPLICATION_KEY,OVH_APPLICATION_SECRET,OVH_CONSUMER_KEY,OVH_ENDPOINT \
    lego --email you@example.com \
         --dns ovh \
         --domains "cdn.bernouy.com" \
         --domains "*.cdn.bernouy.com" \
         --path /etc/lego \
         run
```

Cert + key end up in `/etc/lego/certificates/cdn.bernouy.com.{crt,key}`.

Auto-renew (twice a day, lego no-ops if the cert is still fresh):

```bash
sudo tee /etc/cron.d/lego-renew > /dev/null <<'EOF'
17 3,15 * * * root \
    OVH_APPLICATION_KEY=... OVH_APPLICATION_SECRET=... OVH_CONSUMER_KEY=... OVH_ENDPOINT=ovh-eu \
    lego --email you@example.com --dns ovh \
         --domains "cdn.bernouy.com" --domains "*.cdn.bernouy.com" \
         --path /etc/lego renew --renew-hook "systemctl reload nginx"
EOF
```

---

## 3. System user + storage

Create a dedicated user so the Bun app doesn't run as root. Give it the
storage root that Nginx will also read from.

```bash
sudo useradd --system --home-dir /var/lib/basic-storage --shell /usr/sbin/nologin basic-storage
sudo mkdir -p /var/storage/buckets
sudo chown basic-storage:basic-storage /var/storage/buckets

# Nginx must be able to read the storage root. The simplest is to add
# www-data to the basic-storage group (or pick a shared group).
sudo usermod -aG basic-storage www-data
sudo chmod 0750 /var/storage/buckets
```

---

## 4. MongoDB

For production, **enable auth** and create a dedicated user for the app.
If you're using a managed Mongo (Atlas, etc.), skip the `mongod` setup and
just record the connection string.

```bash
mongosh <<'EOF'
use basic_storage
db.createUser({
    user: "basic-storage",
    pwd:  "<a strong password>",
    roles: [{ role: "readWrite", db: "basic_storage" }],
})
EOF

# Then enable auth in /etc/mongod.conf:
#   security:
#     authorization: enabled
sudo systemctl restart mongod
```

Connection string for the app: `mongodb://basic-storage:<pwd>@127.0.0.1:27017/basic_storage`.

---

## 5. Nginx config

Drop the production skeleton. Edit the host references **before** copying
if your domain differs from `cdn.bernouy.com`.

```bash
# Working dir + empty fragments (the generated/* files must exist before
# the first start; the app will keep them up to date afterwards).
sudo mkdir -p /etc/nginx/conf.d/basic-storage/generated
sudo touch    /etc/nginx/conf.d/basic-storage/generated/{aliases,cacheControls,aliasesServers}.conf

# Static skeleton
sudo cp src/default-implementation/StorageProvider/BasicStorageProvider/nginx/nginx.conf \
        /etc/nginx/conf.d/basic-storage/nginx.conf
sudo cp src/default-implementation/StorageProvider/BasicStorageProvider/nginx/bucketServing.conf \
        /etc/nginx/conf.d/basic-storage/bucketServing.conf

# Adjust cert paths in nginx.conf (search/replace ssl_certificate paths to
# point at /etc/lego/certificates/...).
sudo sed -i 's|/etc/letsencrypt/live/cdn.bernouy.com/fullchain.pem|/etc/lego/certificates/cdn.bernouy.com.crt|g; \
             s|/etc/letsencrypt/live/cdn.bernouy.com/privkey.pem|/etc/lego/certificates/cdn.bernouy.com.key|g' \
    /etc/nginx/conf.d/basic-storage/nginx.conf

# Hook into the main config
echo "include /etc/nginx/conf.d/basic-storage/nginx.conf;" \
   | sudo tee -a /etc/nginx/conf.d/basic-storage-include.conf

# Validate + (re)load
sudo nginx -t && sudo systemctl reload nginx
```

> The shipped `nginx.conf` only references `cdn.bernouy.com`. If your host
> differs, also edit the `server_name` lines and the host-map regex
> (`~^(?<sub>[^.]+)\.cdn\.bernouy\.com$`).

---

## 6. Run the Bun app under systemd

Build a small unit so the app survives reboots, restarts on crash, and
logs to journald.

```bash
sudo tee /etc/systemd/system/basic-storage.service > /dev/null <<'EOF'
[Unit]
Description=BasicStorageProvider
After=network.target mongod.service

[Service]
Type=simple
User=basic-storage
Group=basic-storage
WorkingDirectory=/opt/basic-storage
ExecStart=/usr/local/bin/bun run /opt/basic-storage/server.ts
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now basic-storage
sudo journalctl -u basic-storage -f
```

`/opt/basic-storage/server.ts` is your real bootstrap (the prod
counterpart of `tests/CDN.ts`). At a minimum it constructs `StorageProvider`
with:

```ts
config: {
    nginx: {
        cacheControlsPath: "/etc/nginx/conf.d/basic-storage/generated/cacheControls.conf",
        binary:            "sudo /usr/sbin/nginx",
    },
    publicHost: (bucketId) => `https://${bucketId}.cdn.bernouy.com`,
}
```

…and a real `Authentication` (Keycloak, your SSO, etc.) — **not** the dev
mock.

Mongo connection string + Authentication credentials should come from the
environment (`process.env`) so they aren't checked into git.

---

## 7. Allow the app to reload Nginx

The app calls `nginx -s reload` on every bucket / alias / cache change.
Grant a NOPASSWD sudoers rule for the dedicated user — narrow the command
exactly so we're not handing out root:

```bash
sudo visudo -f /etc/sudoers.d/basic-storage-nginx
```

```text
basic-storage ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload
```

Set `config.nginx.binary` to `"sudo /usr/sbin/nginx"` in the bootstrap (so
the spawn becomes `sudo /usr/sbin/nginx -s reload`).

---

## 8. First-run validation

```bash
# Service is up
sudo systemctl status basic-storage
sudo journalctl -u basic-storage -n 50

# Admin reachable, TLS valid
curl -I https://cdn.bernouy.com/admin/buckets
# → expect 302 to your IDP login (the admin guard kicks in)

# After logging in via the browser, create a bucket "smoke",
# upload a file with publicPath "ping.txt", then:
curl -I https://smoke.cdn.bernouy.com/ping.txt
# → 200 OK, Cache-Control as configured on the bucket
```

If the public URL 404s: confirm `/var/storage/buckets/smoke/<id>.txt`
exists and that `www-data` (or your nginx user) can read through to it
(`sudo -u www-data cat /var/storage/buckets/smoke/<id>.txt`).

---

## 9. Aliases (custom domains)

**Not yet wired in the admin UI** — see the README's _Things still to do_.
Until then, if you need a custom alias for a partner, do it manually:

1. Issue a cert for the partner domain via lego (HTTP-01 once their CNAME
   points at us, or DNS-01 if they delegate the `_acme-challenge`).
2. Append to `/etc/nginx/conf.d/basic-storage/generated/aliasesServers.conf`:
   ```nginx
   server {
       listen 443 ssl http2;
       server_name assets.partner.tld;
       ssl_certificate     /etc/lego/certificates/assets.partner.tld.crt;
       ssl_certificate_key /etc/lego/certificates/assets.partner.tld.key;
       include /etc/nginx/conf.d/basic-storage/bucketServing.conf;
   }
   ```
3. Append to `/etc/nginx/conf.d/basic-storage/generated/aliases.conf`:
   ```nginx
   assets.partner.tld bucket-1234;
   ```
4. `sudo nginx -t && sudo systemctl reload nginx`.

When the alias domain in the admin UI ships, this becomes a single-click
operation backed by `lego` and `applyAliasChanges`.

---

## 10. Backups

Two things to back up:

- **Mongo** (`basic_storage` database) — `mongodump` on a cron, off-box.
- **`/var/storage/buckets/`** — rsync to S3 / Backblaze / etc. Note the
  symlinks: `rsync -a` preserves them by default; the targets are inside
  the same bucket directory so they restore correctly.

A full restore needs both: the metadata DB AND the blob root, in sync.
Restoring only one leaves dangling references / orphan blobs.

---

## 11. Updating the app

```bash
cd /opt/basic-storage
git pull
bun install
sudo systemctl restart basic-storage
```

Index migrations (e.g. the legacy sparse → partial publicPath index) run
on startup automatically — no manual step. Watch the journal on the first
restart after an update to confirm.
