# @bernouy/cms-emailer

Feature package for the `ulvia.cms.emailer` domain. It owns outbound email
delivery, runtime delivery configuration and SMTP composition.

- Message authors own their business templates; Emailer owns only delivery.
- Persist sensitive delivery configuration through an injected `SecretStore`.
- Never return, log or include SMTP passwords in errors.
- Keep Nodemailer behind the explicit `@bernouy/cms-emailer/smtp` subpath.
- HTTP and capability authorization belong to the mounting provider surface.
