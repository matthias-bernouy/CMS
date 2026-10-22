# @bernouy/cms-emailer

Feature package for the transport-neutral `ulvia.cms.emailer` interface.

- Message authors own their business templates; Emailer owns only delivery.
- Keep every export transport-neutral. Concrete transports belong in separate
  feature packages such as `@bernouy/cms-smtp-emailer`.
- HTTP and capability authorization belong to the mounting provider surface.
