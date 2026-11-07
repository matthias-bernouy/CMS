# @bernouy/email

Feature package for the transport-neutral `ulvia/cms.emailer` interface.

- Message authors own their business templates; Emailer owns only delivery.
- Keep delivery ports and business implementations transport-neutral. API
  descriptors declare their contract bindings. Concrete delivery transports
  belong in packages such as `@bernouy/email-smtp`.
- Operations declare access and bindings; the mounting Provider enforces
  authentication and capability authorization.

- Reuse the shared Zod recipient/content schemas for delivery port types and
  contract generation. `src/feature.ts` owns contract identity/version and the
  operation list; each operation owns its public exposure.

- Keep reusable data definitions in `src/schemas/` and one descriptor per operation
  in `src/operations/`, grouped by domain when needed. Documentation stays in
  ordinary `docs/**/*.md` files. Declare the documentation directory with
  `new URL("../docs/", import.meta.url)` in `src/feature.ts`; compilation scans it.
  Relative paths are document IDs. Do not add Markdown import wrappers or type shims.
  Features do not own a `contracts/` directory.
