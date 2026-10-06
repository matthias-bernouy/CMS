# @bernouy/cms-server

Production runtime composition root.

## Responsibilities

- Read environment variables.
- Connect MongoDB.
- Instantiate crypto, repositories, stores, auth, rate limiting, gateway,
  cache, files, Control, and Delivery.
- Start the provider-facing CMS Core runner before local provider bootstrap,
  then start one Control runner and one Delivery runner.

## Rules

- This is the correct place to import `./mongo` and `./s3` adapter subpaths.
- Validate required environment early and fail fast.
- Never log secrets, passwords, PATs, KEKs, DEKs, or session signing material.
- Be careful with `SCOPE_ID`; changing it after data exists can make encrypted
  data unreadable.
- Keep startup order explicit. Many stores require `init()` before being passed
  to surfaces.
- Keep raw feature stores private when their public facade is migration-fenced,
  and register every returned collection migration participant before mounting
  surfaces.
- Changes here usually need an integration-style test or a clear manual
  verification path.
- Give Control the authoring repository and stores. Construct Delivery's
  `createContentReader` and `createPublicFileStores` facades at composition;
  never inject the full authoring objects merely under narrower types.
- `stores/authorFiles.ts` owns the existing local original/`.variants`/`.sitemaps`
  layout. Keep original bytes unchanged when generating or cleaning derivatives.
- These shared-process facades are application boundaries, not isolation from
  arbitrary code execution or separate database/storage permissions.
