# TLS permission

The host-level public HTTP capability `certificates.permit` answers Caddy's
read-only certificate permission request. Its `domain` query parameter selects
one indexed registered domain, never a CMS identity or execution credential.

Permission requires an ownership-verified HTTPS domain, a ready target instance,
and DNS addresses belonging to the operator-configured installation. Unknown,
pending, disabled, plain HTTP and misconfigured domains are refused. Authority
is read again after DNS verification. DNS verification has a deadline and the
permission service bounds concurrent requests. Queries do not mutate the domain
or issue a certificate themselves.

The Provider mounts this admitted GET binding in an isolated public technical
scope. Caller headers supply no identity. Caddy uses its status code; no operator
or tenant credential is transmitted. This contract is excluded from CMS plans.
