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
  redeclaring their API in the Provider. Emailer/SMTP, Secrets, Files, Observability, Access, Content, Authoring, Repository and Installations capabilities own their default
  `execute`; select the complete feature with `implementFeature`, retain manifest
  requirements and supply official localized failure presentation.
  Retain
  injected dependencies, exact invocation scope and durable execution policies.
- Import complete feature definitions (`emailerFeature`, `smtpEmailerFeature`),
  select implementations and generate manifest claims. Do not select a partial
  capability list while announcing the same contract.

- `src/capabilities/features/inventory.ts` is the single SDK implementation/template inventory.
  `compileOfficialFeatures` is build-only. Bootstrap emits the runtime artifact at
  `src/capabilities/features/generated/runtime.json`; do not edit it by hand.
  `loadOfficialFeatures` verifies and attaches that shipped metadata once per process.
  Runtime mounting must not import the build entry or require authored docs/fixtures.
  Add a migrated feature to the inventory, without a family-specific registrar.
- `registerOfficialFeatures` receives exact approved implementation pins from the
  runtime installation plan. Reject every unknown or reserved-template claim, and any
  selected SDK family with an unsupported version/digest or missing service. Do not
  silently skip a claimed feature because its runtime service is unavailable.

- Secrets owns namespace credential checks, permission rules and error classification.
  Its keyed create/rotate capabilities reauthorize before durable receipt access.
  Keep official error localization and Provider HTTP authorization in the surface;
  keep namespaced store construction, adapters and durable receipts in runtimes.

- Provider control definitions live in `capabilities/features/provider/`. Connections
  owns its signed-connection actor guard and receives an injected structural
  return-channel port. Mount it through the shared inventory, never a separate
  registrar. `provider.cms-instances` is a published template without an execution
  claim; reject selected template pins before service projection or registry writes.
  Do not expose private instance lifecycle/storage records through that template.

- `ulvia/repository` is selected from the shared SDK inventory only for explicit
  instances selecting Registry. Inject its typed domain facade and the host's
  account-alias resolver; public reads do not resolve accounts. Namespace/source/
  publication ownership remains domain-owned. Never add a second registry registrar
  or convert unknown return values into DTOs with casts. Preserve bounded public
  publication evolution details while keeping unexpected storage failures private.

- `createProviderOperationAdapter` connects SDK default workers to the existing
  host-owned ProviderOperationExecutor. Registration comes from the same selected
  SDK inventory; never maintain another operation-capability list. Retain durable
  receipts, leases, instance retention, recovery and shutdown draining. Exact-version
  declared errors may be supplied by an explicit registration reader.

- `ulvia/cms.installations` is mounted only from the SDK inventory; its durable
  workers are derived from the selected definition. Never restore family registrars
  or unselected routes. Inject collections/upgrades, gateway/admin, documentation,
  discovery and operation-read ports before mounting. `createInstallationOperationQueries`
  projects bounded host records and localizes persisted errors without exposing
  technical causes. Typed JSON representation metadata preserves Content-Language;
  it grants no session authority and cannot bypass admitted output validation.
- Provider metadata in `exports/provider/definition.json` has no implementation claims.
  `compileOfficialManifest` consumes all exact claims/dependencies from the same SDK
  inventory used for runtime artifacts and mounting.

- Installations 1.1 adds native initialization; its default worker uses the same SDK queue.
  Resolve verified aliases and current administrator grants before receipt access and
  again in recovered workers. Inject the structural initialization service; never
  restore the old registrar. Upgrade-operation queries retain their declared DTO's
  capability-ID set; initialization progress uses one scoped metadata-only latest read.

- Repository address changes are synchronous natural commands with a single CAS.
  Registry creation awaits the host's durable instance transition; do not queue a
  second SDK operation or add a parallel pending-choice record. Project creation
  status from that transition and keep recovery authority checks in its owner.
