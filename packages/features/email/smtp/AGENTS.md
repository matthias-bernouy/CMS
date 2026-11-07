# @bernouy/email-smtp

Feature package for the `ulvia/cms.emailer.smtp` specialization and its official
SMTP implementation.

- Implement the transport-neutral `Emailer` port from `@bernouy/email`.
- Keep configuration ports and errors on the adapter-light package root.
- Keep Nodemailer behind the explicit `@bernouy/email-smtp/nodemailer`
  subpath; surfaces import the package root, `./schemas`, `./operations` and `./docs`, never Nodemailer.
- Persist sensitive SMTP configuration through an injected `SecretStore`.
- Never return, log or include SMTP passwords in errors.
- HTTP and capability authorization belong to the mounting provider surface.

- Infer configuration port types from the shared data schemas. Do not
  maintain a second handwritten public configuration shape.

- Keep reusable data definitions in `src/schemas/` and one descriptor per operation
  in `src/operations/`, grouped by domain when needed. Documentation stays in
  ordinary `docs/*.md` files. Features do not own a `contracts/` directory.
