# @bernouy/cms-smtp-emailer

Feature package for the `ulvia.cms.emailer.smtp` specialization and its official
SMTP implementation.

- Implement the transport-neutral `Emailer` port from `@bernouy/cms-emailer`.
- Keep configuration ports and errors on the adapter-light package root.
- Keep Nodemailer behind the explicit `@bernouy/cms-smtp-emailer/nodemailer`
  subpath; surfaces import only the package root.
- Persist sensitive SMTP configuration through an injected `SecretStore`.
- Never return, log or include SMTP passwords in errors.
- HTTP and capability authorization belong to the mounting provider surface.
