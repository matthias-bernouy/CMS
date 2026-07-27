# Consent

Consent is a generic, Supabase-backed evidence service. Versioned requirements are
materialized from trusted published CMS pages, rendered through a binding-aware
form field, and associated with a CMS subject by request/response triggers.

Version 1 installs one consent context and one target endpoint. The default target
is the public local signup endpoint. No password or complete request body is ever
forwarded to the integration.
