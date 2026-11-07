# @bernouy/email

Feature package for the transport-neutral `ulvia/cms.emailer` interface.

- Message authors own their business templates; Emailer owns only delivery.
- Keep delivery ports and business implementations transport-neutral. API
  descriptors declare their contract bindings. Concrete delivery transports
  belong in packages such as `@bernouy/email-smtp`.
- Capabilities declare access and bindings; the mounting Provider enforces
  authentication and capability authorization.

- Reuse the shared Zod recipient/content schemas for delivery port types and
  contract generation. `src/feature.ts` owns contract identity/version and the
  capability list; each capability owns its public exposure.

- Keep reusable data definitions in `src/schemas/` and one descriptor per capability
  in `src/capabilities/`, grouped by domain when needed. Documentation stays in
  ordinary `docs/**/*.md` files. Declare the documentation directory with
  `new URL("../docs/", import.meta.url)` in `src/feature.ts`; compilation scans it.
  Relative paths are document IDs. Do not add Markdown import wrappers or type shims.
  Features do not own a `contracts/` directory.

- Declare service ports once through `capabilitiesFor` in `src/capabilities/define.ts`.
  Put the default `execute` on its capability; infer input, result and failures from
  the capability schemas. Use injected ports, never create adapters or read environment.
  Larger executors may delegate to ordinary core functions; no handler table or
  mandatory `handlers/` directory is needed.
- Keep public schemas unchanged for v1 digest parity. Derived internal Zod schemas
  own normalization and additional business checks. The SDK selects binding status;
  the Provider surface owns official error presentation. Never serialize private causes.
- `src/feature.ts` exports one `defineFeature` source. Generate the contract from
  that feature; do not add createFeature/defineContract wrappers or parallel metadata.
  Public exports are business ports/errors, the complete feature and useful adapters.
  Export shared schemas individually only when another feature genuinely reuses them.
