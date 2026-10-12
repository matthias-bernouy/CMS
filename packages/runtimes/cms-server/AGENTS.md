# @bernouy/cms-server

Production runtime composition root.

## Responsibilities

- Read environment variables.
- Connect MongoDB.
- Instantiate crypto, repositories, stores, auth, rate limiting, gateway,
  cache, files, and the Kernel.
- Inject feature stores into the provider-facing CMS Core surface, start its
  runner before local provider bootstrap, then start the Kernel runner.

## Rules

- This is the correct place to import `./mongo` and `./s3` adapter subpaths.
- Validate required environment early and fail fast.
- Never log secrets, passwords, PATs, KEKs, DEKs, or session signing material.
- Be careful with `SCOPE_ID`; changing it after data exists can make encrypted
  data unreadable.
- Keep startup order explicit. Many stores require `init()` before being passed
  to the Kernel or CMS Core.
- Keep raw feature stores private when their public facade is migration-fenced,
  and register every returned collection migration participant before mounting
  surfaces.
- Changes here usually need an integration-style test or a clear manual
  verification path.
- Give the Kernel one writable `CmsRepository`. The Kernel derives its
  read-only rendering facade internally so rendering and administration share
  one content identity without exposing mutations to renderer code.
- Compose the official `@bernouy/cms-files` provider here with its Mongo metadata
  store, BlobStore and image derivative adapter. Keep original bytes unchanged
  when generating or cleaning reconstructible derivatives.
- These shared-process facades are application boundaries, not isolation from
  arbitrary code execution or separate database/storage permissions.
