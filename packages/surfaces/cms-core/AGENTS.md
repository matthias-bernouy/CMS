# @bernouy/cms-core

Provider-facing CMS Core surface. It exposes the official `ulvia.cms.*`
contracts through their declared HTTP bindings and publishes the runtime report
used by the CMS gateway.

The surface owns HTTP authentication, binding dispatch, response mapping and the
cross-domain adapters from official contract capabilities to feature-owned
operations. It does not own persistence, environment configuration, listeners,
provider selection or domain stores. Runtimes inject admitted contract releases,
a runtime report and the feature ports used by those adapters.

Keep domain operations in their owning features. A capability adapter may
coordinate several feature ports, project the official wire response and map
domain failures, but it must not import a runtime or select a persistence
adapter.

Keep the surface independent from Control and Delivery. Both call Core through
the normal capability gateway; never add a direct browser or surface shortcut.
