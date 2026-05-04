# BasicStorageProvider

Self-hosted CDN. One running instance manages many **buckets**; each bucket
holds **folders**, **files**, **credentials** (broker tokens) and **aliases**
(custom domains). Public bytes are served by **Nginx** straight off disk;
the admin UI/API and the upload endpoint go through the Bun app behind that
same Nginx.

## Architecture

```
┌────────────┐  HTTPS   ┌─────────┐  reverse-proxy  ┌──────────────────┐
│  Browser   ├─────────▶│  Nginx  ├────────────────▶│  Bun app          │
└────────────┘          │         │                 │  (StorageProvider)│
                        │         │  static blobs   │                   │
                        │         │  (try_files)    │                   │
                        │         └────────┬────────┘
                        │                  │ regen `generated/*.conf`
                        │                  │ + `nginx -s reload`
                        │                  ▼
                        │           bucket / alias / cache changes
                        │                  ▲
                        │                  │
                        │  /var/storage/buckets/<bucketId>/
                        │       <fileId>.<ext>              ← actual blobs
                        │       blog/post.html  ───────────▶ symlink to <fileId>.html
                        └─
```

| Origin                          | What it serves                                               |
| ------------------------------- | ------------------------------------------------------------ |
| `cdn.bernouy.com`               | Admin UI + admin API + upload endpoint → reverse-proxy app   |
| `<bucketId>.cdn.bernouy.com`    | Public bytes for that bucket → static `try_files`            |
| `<custom-alias>` (e.g. `…tld`)  | Public bytes (resolved to a bucket via the generated map)    |

## Features

- Buckets with quotas (max total size, max file count) and limits (max file
  size, accepted MIME patterns).
- Per-bucket `Cache-Control` header.
- File uploads with streaming SHA-256 + image dimensions extraction.
- Folder hierarchy (admin organisation) — independent from public URLs.
- `publicPath` — optional URL-safe slug per file (`blog/post.html`),
  served via Nginx symlinks. The id-based URL keeps working in parallel.
- Pre-signed upload tokens for direct browser→provider uploads
  *(broker-side flow, not yet wired)*.
- Custom domain aliases per bucket *(not yet wired)*.

## Documentation

- **[docs/dev/getting-started.md](./docs/dev/getting-started.md)** —
  end-to-end procedure to run + test on your machine. Two paths covered:
  smoke-test (no Nginx, ≈ 3 min) and Nginx-enabled (≈ 15 min).
- **[docs/prod/getting-started.md](./docs/prod/getting-started.md)** —
  production setup: real domain, wildcard TLS via `lego` (DNS-01),
  dedicated system user, systemd unit, sudoers for `nginx -s reload`,
  backups, manual alias workflow until aliases are wired.
- **`nginx/`** — Nginx skeleton consumed by both guides above.

## Layout

```
nginx/                              Nginx config skeleton (production)
  nginx.conf                        main file; includes the others
  bucketServing.conf                shared body for bucket-serving server blocks
  generated/                        rewritten by the app on changes
    aliases.conf                    map fragment <host> <bucketId>;
    cacheControls.conf              map fragment <bucketId> "<header>";
    aliasesServers.conf             one server { … } per alias

src/                                The Bun app
  exports/                          public entrypoints (StorageProvider, …)
  interfaces/                       contracts (entities, repositories, BlobStorage, wire)
  default-implementation/           swappable infra
    mongo/                          repository impls
    LocalBlobStorage.ts             filesystem-backed blob storage with symlinks
  core/                             logic (bucket, credential, content, upload, nginx, auth, validation)
  api/admin/                        admin REST endpoints
  static/admin/                     admin UI fragments served via serveStaticFolder
  components/                       custom web components (UploadForm, CredentialResultDialog)

docs/dev/                           dev guides
```

## Things still to do

These exist in scaffolding (interfaces / nginx templates / validators) but
aren't wired into the admin UI yet:

- **Aliases** — `MongoAliasRepository` + `core/alias/` + cert orchestration
  with `lego` + regen of `aliases.conf` / `aliasesServers.conf`.
- **`updateItem`** — rename / move / change `publicPath` after creation.
  Contract is in `CDN.ts`; not implemented in core.
- **Pre-signed token broker** — the bucket-credential auth path for browser
  uploads via a third-party app's TokenBroker. Repos and entities exist;
  service + endpoints don't.
- **`StorageBrowser`** — the third class shipped in `exports/`, a serializable
  `CDN`-implementing client for browser hydration.
