# @bernouy/cms-kernel-server

Production runtime composition root.

## Responsibilities

- Read environment variables.
- Connect MongoDB.
- Instantiate the Kernel's auth, gateway, SEO and HTTP composition.
- Connect an independently running Provider from its endpoint and token.
- Install or upgrade official resources before starting the Kernel runner.

## Rules

- Compose only the persistence and Gateway adapters consumed by the Kernel.
  Never depend on another executable runtime or a shared aggregate instance
  runtime.
- Validate required environment early and fail fast.
- Never log secrets, passwords, PATs, KEKs, DEKs, or session signing material.
- Be careful with `SCOPE_ID`; changing it after data exists can make encrypted
  data unreadable.
- Keep startup order explicit. Many stores require `init()` before being passed
  to the Kernel.
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
- Never mount or start the Ulvia Provider surface from this package.
