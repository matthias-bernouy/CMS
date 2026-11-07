# @bernouy/ulvia-provider

Provider-facing Ulvia Provider surface. It exposes the official `ulvia/cms.*`
contracts and explicitly enabled `ulvia/repository` capabilities through their declared HTTP bindings and publishes the runtime report
used by the CMS gateway.

The surface owns HTTP authentication, binding dispatch, response mapping and
the cross-domain adapters from official contract capabilities to feature-owned
operations. It does not own persistence, environment configuration, listeners,
provider selection or domain stores.
Runtimes inject resolved views of admitted contract releases, an instance runtime report and the
feature ports used by those adapters.

Keep domain operations in their owning features. A capability adapter may
coordinate several feature ports, project the official wire response and map
domain failures, but it must not import a runtime or select a persistence
adapter.

Keep the surface independent from the site Edge implementation. Every
cross-process operation must use an admitted contract capability: do not add a
private Edge protocol, browser bypass, or second implementation of domain
behavior.

- SDK-migrated features own feature metadata, capability IDs, access, behavior and
  bindings through their `./feature` export. Import these definitions instead of
  redeclaring their API in the Provider. Emailer/SMTP operations own their default
  `execute`; select the complete feature with `implementFeature`, retain manifest
  requirements and supply official localized failure presentation.
  Keep other feature adapters here until their migration is requested. Retain
  injected dependencies, exact invocation scope and durable execution policies.
- Import complete feature definitions (`emailerFeature`, `smtpEmailerFeature`),
  select implementations and generate manifest claims. Do not select a partial
  capability list while announcing the same contract.

- `src/capabilities/features/build.ts` is the single SDK implementation inventory.
  `compileOfficialFeatures` shares one immutable compilation per process between
  release preparation, manifest claims and mounting. Add a migrated feature there;
  never add a family-specific registrar or second compilation cache.
- `registerOfficialFeatures` receives exact approved implementation pins from the
  runtime profile. Ignore other families handled by the legacy adapters; reject any
  selected SDK family with an unsupported version/digest or missing service. Do not
  silently skip a claimed feature because its runtime service is unavailable.
