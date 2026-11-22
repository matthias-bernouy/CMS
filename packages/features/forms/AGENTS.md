# Forms

Keep Forms definitions, validation, persistence and notification state in this package.
Inject Emailer delivery and verified actor scope; never select SMTP or read environment here.
Public DTOs are closed schema-derived types. Keep optional Mongo behind `./mongo`.
