# @bernouy/email

Feature package for the transport-neutral `ulvia/cms.emailer` interface.

- Message authors own their business templates; Emailer owns only delivery.
- Keep every export transport-neutral. Concrete transports belong in separate
  feature packages such as `@bernouy/email-smtp`.
- HTTP and capability authorization belong to the mounting provider surface.

- Reuse the shared Zod recipient/content schemas for delivery port types and
  contract generation; public contract identity/bindings belong to the surface.

- Keep reusable data definitions in `src/schemas/` and one descriptor per operation
  in `src/operations/`, grouped by domain when needed. Documentation stays in
  ordinary `docs/*.md` files. Features do not own a `contracts/` directory.
