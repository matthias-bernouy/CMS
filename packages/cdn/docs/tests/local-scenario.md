# Local end-to-end test scenario

End-to-end smoke run covering every surface of `@bernouy/cdn`:
admin UI, frontier B (broker→provider API), frontier C (`/upload`),
frontier A (browser→broker), the `StorageBrowser` hydration script, and the
alias workflow — exercised from a **consumer package** that links the
relevant Socle workspace packages (i.e. how a real host app would integrate).

Assumes Bun + MongoDB installed. Repo is the new monorepo layout
(`packages/{core,runner-bun,cdn,…}`).

This file is the **runbook** to walk through after every meaningful change
to verify nothing is broken end to end.

---

## 0. Prerequisites — done once per machine

```bash
# /etc/hosts so the dev wildcard sub-domains resolve to localhost
echo "127.0.0.1 cdn.localhost smoke.cdn.localhost test.cdn.localhost alias-test.localhost" \
    | sudo tee -a /etc/hosts

# nginx noop binary — lets the provider boot when no Nginx is running
sudo install -m 0755 /dev/stdin /usr/local/bin/nginx-noop <<'EOF'
#!/bin/sh
exit 0
EOF

# Pre-create the generated/ fragments so nginx -t / -s reload don't fail
sudo mkdir -p /etc/nginx/conf.d/basic-storage/generated
sudo touch    /etc/nginx/conf.d/basic-storage/generated/{cacheControls,aliases,aliasesServers}.conf
```

If you went through the **Path B** (real Nginx) of the dev guide, also drop
`bucketServing.conf` next to `generated/` — it's referenced by the alias
server blocks.

---

## 1. Build + link the workspace packages

From this repo's root:

```bash
# Type-check + emit dist/ for every workspace package (one tsc --build run).
bun run build

# Register every workspace package as a global link target.
for pkg in packages/*/; do (cd "$pkg" && bun link); done
```

---

## 2. Consumer package

In a **separate** directory (anywhere outside this repo):

```bash
mkdir -p ~/cdn-consumer && cd ~/cdn-consumer
bun init -y
bun add mongodb
bun link @bernouy/core
bun link @bernouy/runner-bun
bun link @bernouy/cdn
```

Drop a `tests/CDN.ts` (or whatever entrypoint suits the consumer). Imports
come from focused packages:

```ts
import { MongoClient } from "mongodb";
import { BunRunner } from "@bernouy/runner-bun";
import type { Authentication } from "@bernouy/core";
import {
    StorageProvider, StorageTokenBroker,
    LocalBlobStorage,
    MongoBucketRepository,           type BucketDocument,
    MongoBucketCredentialRepository, type BucketCredentialDocument,
    MongoPreSignedTokenRepository,   type PreSignedTokenDocument,
    MongoAliasRepository,            type AliasDocument,
    MongoStoredFolderRepository,     type StoredFolderDocument,
    MongoStoredFileRepository,       type StoredFileDocument,
} from "@bernouy/cdn";

const mongo = new MongoClient("mongodb://localhost:27017");
await mongo.connect();
const db = mongo.db("basic_storage_b");

const runner = new BunRunner();

const devAuth: Authentication = {
    loginUrl: "/login", logoutUrl: "/logout", profileUrl: "/profile",
    buildLoginUrl:  (r) => `/login?returnTo=${encodeURIComponent(r)}`,
    buildLogoutUrl: (r) => `/logout?returnTo=${encodeURIComponent(r)}`,
    getSubject: async () => ({ identifier: "dev", role: "admin", displayName: "Dev" }),
};

new StorageProvider({
    runner,
    authentication:       devAuth,
    bucketRepo:           new MongoBucketRepository          (db.collection<BucketDocument>            ("buckets")),
    bucketCredentialRepo: new MongoBucketCredentialRepository(db.collection<BucketCredentialDocument>  ("bucket_credentials")),
    preSignedTokenRepo:   new MongoPreSignedTokenRepository  (db.collection<PreSignedTokenDocument>    ("pre_signed_tokens")),
    aliasRepo:            new MongoAliasRepository           (db.collection<AliasDocument>             ("aliases")),
    storedFolderRepo:     new MongoStoredFolderRepository    (db.collection<StoredFolderDocument>      ("stored_folders")),
    storedFileRepo:       new MongoStoredFileRepository      (db.collection<StoredFileDocument>        ("stored_files")),
    blobStorage:          new LocalBlobStorage("/tmp/basic-storage-buckets"),
    config: {
        nginx: {
            cacheControlsPath:        "/etc/nginx/conf.d/basic-storage/generated/cacheControls.conf",
            aliasesPath:              "/etc/nginx/conf.d/basic-storage/generated/aliases.conf",
            aliasesServersPath:       "/etc/nginx/conf.d/basic-storage/generated/aliasesServers.conf",
            bucketServingIncludePath: "/etc/nginx/conf.d/basic-storage/bucketServing.conf",
            binary:                   "/usr/local/bin/nginx-noop",
        },
        publicHost: (bucketId) => `http://${bucketId}.cdn.localhost:8080`,
    },
});

// Filled in after Test 1 step 3 (cleartext credential). Comment out on first launch.
new StorageTokenBroker({
    runner,
    providerOrigin:  "http://cdn.localhost:3005",
    credentialToken: "<paste-cleartext-after-test-1-step-3>",
});

runner.start(3005);
```

Launch from the consumer directory:

```bash
bun run tests/CDN.ts
```

Expect `Server started on port 3005`. The first request to `/admin/...`
triggers the components bundle build — you should see one log line for it
on the first hit, none after.

> When iterating on the Socle source itself: each package's `package.json`
> uses `"main": "src/index.ts"`, so `bun link` resolves directly to source
> — no rebuild needed for runtime changes. Re-run `bun run build` only to
> refresh the `dist/*.d.ts` for type-only consumers.

---

## 3. Test 1 — admin UI happy path

| # | Action                                       | Expected                                                                  |
|---|----------------------------------------------|---------------------------------------------------------------------------|
| 1 | Open `http://cdn.localhost:3005/admin/buckets` | Empty list, **+ New bucket** button.                                      |
| 2 | Create bucket `smoke` (`cacheControl: no-store`, MIME `*`) | Bucket appears in list, navigate into it.                                 |
| 3 | **+ New credential** (no label / expiry)     | Modal pops the cleartext token (`bsp_…`). **Copy it now** — gone forever. |
| 4 | **+ New folder** `media`                     | Folder row in the table.                                                  |
| 5 | Click `media` → **+ Upload file** a PNG      | File row, type `image`, size > 0, publicPath empty.                       |
| 6 | **Preview**                                  | Opens the file in a new tab.                                              |
| 7 | Re-upload with publicPath `home.html`        | Row shows `home.html` in publicPath. Symlink created on disk:             |
|   |                                              | `ls -la /tmp/basic-storage-buckets/smoke/home.html`                       |
| 8 | Try uploading a file named `media`           | Returns `conflict` (folder already there).                                |

---

## 4. Test 2 — broker frontier A + frontier C

Paste the cleartext from Test 1 step 3 into the consumer's `tests/CDN.ts` `credentialToken`,
restart `bun run tests/CDN.ts`.

```bash
# Mint a token via frontier A (browser path — no auth header)
curl -sX POST 'http://cdn.localhost:3005/_storage/upload-tokens' \
     -H 'Content-Type: application/json' \
     -d '{"name":"hello.txt","maxSize":1024}'
# → { "ok": true, "data": { "id": "...", "uploadURL": "http://cdn.localhost:3005/upload?token=...", "expiresAt": "..." } }
```

```bash
# Upload to the returned uploadURL (frontier C — token in query)
echo 'hello world' \
  | curl -sX POST '<uploadURL>' \
         --data-binary @- \
         -H 'Content-Type: text/plain'
# → { "ok": true, "data": { "id": "...", "absoluteURL": "...", "type": "text", ... } }
```

Re-`curl` the same `uploadURL` once more — second attempt **must fail**:

```
{ "ok": false, "error": { "code": "validation_error", "message": "invalid_token: token unknown or already consumed." } }
```

Verify in admin UI: `hello.txt` appears alongside the earlier files.

---

## 5. Test 3 — `StorageBrowser` hydration

```bash
curl -s http://cdn.localhost:3005/_storage/hydration.js | head -c 80
```

Expect a one-liner starting with `globalThis["_storage"] = new (class …`.

Open a quick test page (any local server will do, e.g. `python3 -m http.server`):

```html
<!DOCTYPE html>
<script src="http://cdn.localhost:3005/_storage/hydration.js"></script>
<input type="file" id="f">
<script>
    document.getElementById('f').onchange = async (e) => {
        const r = await _storage.uploadFile({
            data: e.target.files[0],
            name: e.target.files[0].name,
        });
        console.log(r);
    };
</script>
```

Pick a file → console logs `{ ok: true, data: FileMetadata }`. The file
shows up in the admin UI.

Sanity check the listing path:

```js
await _storage.getItems()
// → { ok: true, data: { items: [...], total: ..., page: 1, limit: 50, hasMore: false } }
```

---

## 6. Test 4 — aliases

| # | Action                                                              | Expected                                                                    |
|---|---------------------------------------------------------------------|-----------------------------------------------------------------------------|
| 1 | In bucket `smoke`, **+ New alias** with `alias-test.localhost`      | Alias row in the table.                                                     |
| 2 | `cat /etc/nginx/conf.d/basic-storage/generated/aliases.conf`        | One line `alias-test.localhost smoke;`.                                     |
| 3 | `cat /etc/nginx/conf.d/basic-storage/generated/aliasesServers.conf` | One `server { … server_name alias-test.localhost; … }` block.               |
| 4 | **Delete alias**                                                    | Both fragments empty (just the header comment).                             |
| 5 | Re-create the alias, then delete the **bucket**                     | Alias auto-removed (cascade). Both fragments empty again.                   |
| 6 | Try creating alias `Foo.com` (uppercase)                            | Stored as `foo.com` — the validator lowercases at the boundary.             |
| 7 | Try `not_a_domain` (single label)                                   | `validation_error: domain must contain at least two labels`.                |

For Path B (real Nginx), `nginx -s reload` is run after each mutation —
you should see the reload in `journalctl -u nginx -f`.

---

## 7. Final type check

Run from **both** sides — the Socle source and the consumer package —
since linked packages don't share `tsconfig`:

```bash
# Socle monorepo (typechecks every workspace package)
bun run typecheck

# Consumer package
cd ~/cdn-consumer && bunx tsc --noEmit
```

Both must exit `0`.

If any of the steps above fails, snapshot the journal output and the
relevant `generated/` fragment **before** retrying — half the bugs in this
flow are about file-system state diverging from DB state, and the retry
will hide it.

---

## Resetting between runs

```bash
# Wipe the dev DB
mongosh basic_storage_b --eval 'db.dropDatabase()'

# Wipe blobs + symlinks
rm -rf /tmp/basic-storage-buckets/*

# Wipe generated nginx fragments
sudo truncate -s 0 /etc/nginx/conf.d/basic-storage/generated/{cacheControls,aliases,aliasesServers}.conf
```
