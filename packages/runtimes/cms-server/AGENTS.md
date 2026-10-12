# @bernouy/cms-server

Production runtime composition root.

## Responsibilities

- Read environment variables.
- Connect MongoDB.
- Instantiate crypto, repositories, stores, auth, rate limiting, gateway,
  cache, files, and the Kernel.
- Inject feature stores into the Ulvia Provider surface, start its
  runner before local provider bootstrap, then start the Kernel runner.

## Rules

- This is the correct place to import `./mongo` and `./s3` adapter subpaths.
- Validate required environment early and fail fast.
- Never log secrets, passwords, PATs, KEKs, DEKs, or session signing material.
- Be careful with `SCOPE_ID`; changing it after data exists can make encrypted
  data unreadable.
- Keep startup order explicit. Many stores require `init()` before being passed
  to the Kernel or Ulvia Provider.
- Keep raw feature stores private when their public facade is migration-fenced,
  and register every returned collection migration participant before mounting
  surfaces.
- Changes here usually need an integration-style test or a clear manual
  verification path.
- Project the writable `CmsRepository` to a `ContentReader` in this runtime and
  inject only that read boundary into Kernel. Keep authoring and installation
  mutations behind their owning feature services and Ulvia Provider capabilities.
- Compose sitemap materialization and refresh from `cms-seo`; Kernel receives
  only the store required by the mounted read handlers.
- Compose the official `@bernouy/cms-files` provider here with its Mongo metadata
  store, BlobStore and image derivative adapter. Keep original bytes unchanged
  when generating or cleaning reconstructible derivatives.
- These shared-process facades are application boundaries, not isolation from
  arbitrary code execution or separate database/storage permissions.
