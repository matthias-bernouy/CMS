# Email features

- `base/` publishes `@bernouy/email`: shared Zod message schemas, inferred delivery
  ports and transport-neutral memory/console implementations.
- `smtp/` publishes `@bernouy/email-smtp`: shared Zod configuration schemas,
  inferred administration ports and a secret-backed SMTP implementation.

Both expose data schemas through `./schemas`, operation descriptors through
`./operations`, and published Markdown through `./docs`.
Documentation stays in ordinary `docs/*.md` files within each package.
Nodemailer is available only through `@bernouy/email-smtp/nodemailer`.
The Provider surface assembles the concrete `ulvia/cms.emailer.smtp` contract
with an exact `ulvia/cms.emailer` parent. Folder grouping grants no inheritance;
the explicit source `extends` establishes that relationship.

Contract IDs, versions, UTF-16 rules and immutable digests remain unchanged by
the directory/package rename. No package aliases for the previous names remain.

Reusable schemas live in `src/schemas/`. Each descriptor lives in its own file
under `src/operations/`; SMTP configuration operations use a `configuration/`
subdirectory. Larger families can group schemas and operations by domain without
changing these roles. Ports infer data types directly from schemas; core services
validate those same schemas. Private storage projections are not public exports.
