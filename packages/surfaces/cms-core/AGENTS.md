# @bernouy/cms-core

Provider-facing CMS Core surface. It exposes the official `ulvia.cms.*`
contracts through their declared HTTP bindings and publishes the runtime report
used by the CMS gateway.

The surface owns HTTP authentication, binding dispatch and response mapping. It
does not own persistence, environment configuration, listeners, provider
selection or domain stores. Runtimes inject admitted contract releases, a
runtime report and a `CoreCapabilityDispatcher` whose handlers are registered by
the owning features.

Keep the surface independent from Control and Delivery. Both call Core through
the normal capability gateway; never add a direct browser or surface shortcut.

