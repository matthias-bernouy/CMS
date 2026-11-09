# Shared Edge domain routing

`ulvia/provider.routing` is a host-level machine contract. It is not installed on
Control or ordinary CMS tenants. Its authenticated Edge machine identity can only
resolve one hostname; it grants no hosting administration or CMS user authority.

`domains.resolve` returns null for unknown, inactive or disabled routes and for
instances that are not ready. A successful response contains a control lease
valid for at most 60 seconds. Persistent instance credentials, invocation signing
keys and operator credentials are never returned.

The Provider verifies the lease signature and expiry, then reads the current
domain and instance again before accepting a broker call or report read. Domain
and instance revisions, assignment and origins fence the lease. A header or
caller-supplied instance identifier cannot change its authority. Domain aliases
retain their canonical CMS origin so an Edge can redirect without mixing OAuth,
cookie and origin authority.

This contract is HTTP-only. The deployment authenticates signed machine
invocations; ordinary users, collection delegations and other system services
cannot invoke it. The listener and persistence remain runtime responsibilities.
