# Getting started — local dev

End-to-end procedure to run BasicStorageProvider on your machine. Two paths:

- **Path A — smoke test, no Nginx** (≈ 3 minutes). Boots the admin UI + API, lets
  you create buckets / upload files / preview them through the bypass route.
  Public CDN URLs **don't work** in this mode (nothing serves them).
- **Path B — Nginx-enabled** (≈ 15 minutes). Adds Nginx in front so the
  public bucket URLs (`<bucketId>.cdn.localhost:8080/<file>`) actually serve
  bytes off disk.

Do **A first** to validate the app, then move to **B** when you want to test
the Nginx path.

---

## 0. Prerequisites

- [Bun](https://bun.sh) (for the runtime)
- MongoDB running on `localhost:27017` (no auth needed for local dev)
- (Path B only) Nginx installed system-wide

That's it. No DNS edits, no TLS certs, no Docker.

---

## Path A — smoke test (no Nginx)

### A.1. Start MongoDB

```bash
# Linux (systemd):
sudo systemctl start mongod

# macOS (Homebrew):
brew services start mongodb-community

# Or run a one-off process from any dir:
mongod --dbpath /tmp/socle-mongo
```

Verify it's up: `mongosh --eval "db.runCommand({ping: 1})"` should print
`{ ok: 1 }`.

### A.2. Bootstrap script

Create `tests/CDN.ts` at the repo root with this content:

```ts
import { MongoClient } from "mongodb";
import { BunRunner, type Authentication } from "@bernouy/socle";

import { StorageProvider } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/exports/StorageProvider";

import { MongoBucketRepository,           type BucketDocument }           from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoBucketRepository";
import { MongoBucketCredentialRepository, type BucketCredentialDocument } from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoBucketCredentialRepository";
import { MongoStoredFolderRepository,     type StoredFolderDocument }     from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoStoredFolderRepository";
import { MongoStoredFileRepository,       type StoredFileDocument }       from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/mongo/MongoStoredFileRepository";
import { LocalBlobStorage }                                               from "src/default-implementation/StorageProvider/BasicStorageProvider/src/default-implementation/LocalBlobStorage";

// ─── Mongo ──────────────────────────────────────────────────────────────
const mongo = new MongoClient("mongodb://localhost:27017");
await mongo.connect();
const db = mongo.db("basic_storage");

// ─── Auth (dev mock — always admin) ─────────────────────────────────────
const devAuth: Authentication = {
    loginUrl:        "/login",
    logoutUrl:       "/logout",
    profileUrl:      "/profile",
    buildLoginUrl:   (r) => `/login?returnTo=${encodeURIComponent(r)}`,
    buildLogoutUrl:  (r) => `/logout?returnTo=${encodeURIComponent(r)}`,
    getSubject:      async () => ({ identifier: "dev", role: "admin", displayName: "Dev" }),
};

// ─── Provider ───────────────────────────────────────────────────────────
const runner = new BunRunner();

new StorageProvider({
    runner,
    authentication:        devAuth,
    bucketRepo:            new MongoBucketRepository          (db.collection<BucketDocument>          ("buckets")),
    bucketCredentialRepo:  new MongoBucketCredentialRepository(db.collection<BucketCredentialDocument>("bucket_credentials")),
    storedFolderRepo:      new MongoStoredFolderRepository    (db.collection<StoredFolderDocument>    ("stored_folders")),
    storedFileRepo:        new MongoStoredFileRepository      (db.collection<StoredFileDocument>      ("stored_files")),
    blobStorage:           new LocalBlobStorage("/tmp/basic-storage-buckets"),

    // No `nginx` block → app skips the regen + reload calls. Path A only.
    config: {
        publicHost: (bucketId) => `http://${bucketId}.localhost:3005`,
    },
});

runner.start(3005);
console.log("admin: http://localhost:3005/admin/buckets");
```

### A.3. Run it

```bash
bun run tests/CDN.ts
```

You should see `admin: http://localhost:3005/admin/buckets` in the console.

### A.4. Drive it from the browser

Open `http://localhost:3005/admin/buckets`. You should see the buckets table
(empty), a `+ New bucket` button, and after creating one, a `View` link to
`/admin/bucket-detail?bucketId=…`.

A full happy-path round-trip:

1. **Create a bucket** named `test`, leave defaults.
2. **Click View** → bucket-detail page.
3. **Create a folder** `images`.
4. **Click into it** (the `📁 images/` link).
5. **Upload a file** — pick anything; leave `publicPath` empty.
6. **Click Preview** on the file → opens through `/admin/api/files/raw?id=…`,
   which bypasses Nginx and reads the blob via `LocalBlobStorage.read`.
   You should see the file content directly in the browser.
7. **Delete the file → delete the folder → delete the bucket** to confirm
   the cascade.

What you've verified: Mongo CRUD, blob streaming, image-size detection,
admin guard, AdminResponse envelope, the upload component event chain.
What you haven't tested: the Nginx path (public URLs).

### A.5. Common Path-A issues

- **`MongoError: connect ECONNREFUSED`** — Mongo isn't running. See A.1.
- **`Cannot find module "@bernouy/socle"`** — make sure `bun install` ran;
  this repo uses workspace packages.
- **Admin UI shows a blank page** — open devtools network: the requests to
  `/admin/assets/components.js` should return 200 with JS. The first one
  builds the bundle so the first request is slower.
- **Upload fails with "unsupported_mime_type"** — the bucket's
  `acceptedMimeTypes` is restrictive. Recreate it with `*` in the
  acceptedMimeTypes field.

---

## Path B — Nginx in front

Picks up where Path A left off. The bootstrap script gets one extra config
field, and Nginx gets a small dev-only config pointing at the same blob
directory.

### B.1. Storage root + permissions

```bash
# Same path as in `LocalBlobStorage(...)` above:
mkdir -p /tmp/basic-storage-buckets
# (writeable by you already since /tmp)
```

For non-`/tmp` locations, make sure your user owns the directory.

### B.2. Nginx config

Create the working dir + empty fragments (Nginx fails to start if the
includes don't resolve):

```bash
sudo mkdir -p /etc/nginx/conf.d/basic-storage/generated
sudo touch    /etc/nginx/conf.d/basic-storage/generated/aliases.conf
sudo touch    /etc/nginx/conf.d/basic-storage/generated/cacheControls.conf
sudo touch    /etc/nginx/conf.d/basic-storage/generated/aliasesServers.conf
```

Copy the shared fragment:

```bash
sudo cp src/default-implementation/StorageProvider/BasicStorageProvider/nginx/bucketServing.conf \
        /etc/nginx/conf.d/basic-storage/bucketServing.conf
```

Drop a dev-specific main config (HTTP-only, port 8080, `*.cdn.localhost`):

```bash
sudo tee /etc/nginx/conf.d/basic-storage-dev.conf > /dev/null <<'EOF'
map $host $bucket_id {
    hostnames;
    default "";
    ~^(?<sub>[^.]+)\.cdn\.localhost$ $sub;
    include /etc/nginx/conf.d/basic-storage/generated/aliases.conf;
}

map $bucket_id $cache_control {
    default "";
    include /etc/nginx/conf.d/basic-storage/generated/cacheControls.conf;
}

upstream basic_storage_app { server 127.0.0.1:3005; keepalive 8; }

# Admin + upload (proxied to the Bun app)
server {
    listen 8080;
    server_name cdn.localhost;

    location = /upload {
        client_max_body_size    5g;
        proxy_request_buffering off;
        proxy_set_header        Host $host;
        proxy_pass              http://basic_storage_app;
    }
    location / {
        proxy_set_header  Host $host;
        proxy_pass        http://basic_storage_app;
    }
}

# Public bytes per bucket subdomain
server {
    listen 8080;
    server_name ~^(?<sub>[^.]+)\.cdn\.localhost$;
    root /tmp/basic-storage-buckets/$bucket_id;

    location / {
        if ($bucket_id = "") { return 444; }
        add_header Cache-Control            $cache_control always;
        add_header Access-Control-Allow-Origin "*"          always;
        try_files  $uri =404;
    }
}
EOF
```

> Note this dev fragment inlines the bucket-serving rules so `$bucket_id`
> stays in scope for `root`. The shared `bucketServing.conf` from `nginx/`
> works the same way; we just don't include it here for clarity.

Validate + reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` should print `syntax is ok` / `test is successful`.

### B.3. Allow the Bun app to reload Nginx

The provider calls `nginx -s reload` on bucket / cache-control changes.
Pick one option:

- **Easiest** — add a NOPASSWD sudoers rule for your user:
  ```text
  # /etc/sudoers.d/basic-storage-nginx (use `visudo -f` to edit)
  YOUR_USER ALL=(root) NOPASSWD: /usr/sbin/nginx -s reload
  ```
  Then in the provider config below, `nginx.binary: "sudo"` plus the
  `args ["nginx", "-s", "reload"]`. Currently the binary is invoked
  directly with hard-coded args, so set `nginx.binary` to the full
  command `"sudo /usr/sbin/nginx"` and the spawn picks `["sudo",
  "/usr/sbin/nginx", "-s", "reload"]`.
- **Or** stub it for dev — set `nginx.binary` to a no-op script:
  ```bash
  echo -e '#!/bin/sh\nexit 0' > ~/nginx-noop.sh && chmod +x ~/nginx-noop.sh
  ```
  Then `nginx.binary: "$HOME/nginx-noop.sh"`. The fragment files still
  get rewritten — you'll just have to reload Nginx by hand:
  `sudo systemctl reload nginx`.

### B.4. Update the bootstrap script

Add the `nginx` block + change `publicHost` to match the served origin:

```ts
config: {
    nginx: {
        cacheControlsPath: "/etc/nginx/conf.d/basic-storage/generated/cacheControls.conf",
        binary:            "sudo /usr/sbin/nginx",  // or your noop script
    },
    publicHost: (bucketId) => `http://${bucketId}.cdn.localhost:8080`,
},
```

Restart the bun process (`bun run tests/CDN.ts`).

### B.5. Verify the round-trip

1. Open `http://cdn.localhost:8080/admin/buckets` (note: through Nginx now).
2. Create a bucket `test`.
3. Check the disk + the regenerated fragment:
   ```bash
   ls /tmp/basic-storage-buckets/test
   cat /etc/nginx/conf.d/basic-storage/generated/cacheControls.conf
   # should contain:  test "public, max-age=31536000, immutable";
   ```
4. Upload a file `hello.html` with `publicPath = hello.html` and
   `mimeType = text/html`.
5. Inspect the symlink:
   ```bash
   ls -l /tmp/basic-storage-buckets/test/
   # → hello.html -> <fileId>.html
   ```
6. Hit the public URL **directly through Nginx** :
   ```bash
   curl -I http://test.cdn.localhost:8080/hello.html
   # HTTP/1.1 200 OK
   # Cache-Control: public, max-age=31536000, immutable
   # Content-Type: text/html
   curl    http://test.cdn.localhost:8080/hello.html
   # ← actual file content
   ```
   Both the slug URL and the id-based URL
   (`http://test.cdn.localhost:8080/<fileId>.html`) should work — they
   point to the same blob.

### B.6. Common Path-B issues

- **`nginx -t` fails with `open() … failed (2: No such file or directory)`**
  on the `include` lines — you forgot to `touch` the empty fragments in B.2.
- **404 from Nginx for the public URL** — check the `root` path: it must
  match exactly the `LocalBlobStorage` constructor argument. And the
  bucket's directory must exist on disk (`ls /tmp/basic-storage-buckets/`).
- **Nginx serves stale `Cache-Control`** — the fragment was rewritten but
  Nginx wasn't reloaded. Either grant the sudoers rule (B.3) or reload
  manually (`sudo systemctl reload nginx`).
- **Browser doesn't resolve `*.cdn.localhost`** — modern Chrome/Safari/Firefox
  handle this automatically. On older systems, add `127.0.0.1 test.cdn.localhost`
  to `/etc/hosts`.
- **`E11000 duplicate key error … publicPath: null`** — your DB still has
  the legacy sparse index. The app now drops/recreates it on startup; if
  it didn't, run once: `mongosh basic_storage --eval
  'db.stored_files.dropIndex("bucket_publicPath_unique")'` then restart.

---

## Resetting state

Wipe everything and start fresh:

```bash
mongosh basic_storage --eval 'db.dropDatabase()'
rm -rf /tmp/basic-storage-buckets
sudo rm -f /etc/nginx/conf.d/basic-storage/generated/{aliases,cacheControls,aliasesServers}.conf
sudo touch /etc/nginx/conf.d/basic-storage/generated/{aliases,cacheControls,aliasesServers}.conf
sudo systemctl reload nginx
```
