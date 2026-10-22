# @bernouy/ulvia-provider

Provider-facing Ulvia Provider surface. It exposes the official `ulvia.cms.*`
contracts through their declared HTTP bindings and publishes the runtime report
used by the CMS gateway.

The surface owns HTTP authentication, binding dispatch, response mapping and
the cross-domain adapters from official contract capabilities to feature-owned
operations. It does not own persistence, environment configuration, listeners,
provider selection or domain stores.
Runtimes inject admitted contract releases, an instance runtime report and the
feature ports used by those adapters.

Keep domain operations in their owning features. A capability adapter may
coordinate several feature ports, project the official wire response and map
domain failures, but it must not import a runtime or select a persistence
adapter.

Keep the surface independent from the site Kernel implementation. Every
cross-process operation must use an admitted contract capability: do not add a
private Kernel protocol, browser bypass, or second implementation of domain
behavior.
