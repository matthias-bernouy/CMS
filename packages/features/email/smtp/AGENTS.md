# @bernouy/email-smtp

Feature package for the `ulvia/cms.emailer.smtp` specialization and its official
SMTP implementation.

- Implement the transport-neutral `Emailer` port from `@bernouy/email`.
- Keep configuration ports and errors on the adapter-light package root.
- Keep Nodemailer behind the explicit `@bernouy/email-smtp/nodemailer`
  subpath; surfaces import the package root and `./feature`, never Nodemailer. Keep schema/capability construction paths internal.
- Persist sensitive SMTP configuration through an injected `SecretStore`.
- Never return, log or include SMTP passwords in errors.
- Capabilities declare access, behavior and bindings. `src/feature.ts` owns the
  exact Emailer parent and capability list. The Provider enforces authorization.

- Infer configuration port types from the shared data schemas. Do not
  maintain a second handwritten public configuration shape.

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
- SMTP services must satisfy Emailer's parent ports. Inherit the send executor;
  SMTP configuration errors specialize the generic Emailer input-error domain type.
  Keep manifest secret requirements in the Provider surface and concrete wiring in runtimes.
- `src/feature.ts` exports one `defineFeature` source. Generate the contract from
  that feature; do not add createFeature/defineContract wrappers or parallel metadata.
  Public exports are business ports/errors, the complete feature and useful adapters.
  Export shared schemas individually only when another feature genuinely reuses them.
