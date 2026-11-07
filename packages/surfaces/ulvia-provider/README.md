# @bernouy/ulvia-provider

Provider-facing surface for the official `ulvia/cms.*` contracts and explicitly
enabled `ulvia/repository` capabilities. It publishes
the authenticated runtime report and serves the exact HTTP bindings declared by
admitted contract releases.

## Public API

- `@bernouy/ulvia-provider` exposes the surface, dispatch registry, operation executor,
  and injected dependency contracts.
- `/capabilities` exposes registration helpers for official capability adapters.
- `/build` exposes `compileOfficialFeatures` and `compileOfficialManifest` for release preparation.
- `/sdk/node` exposes the connection capability registrar and `createConnectedProviderLogger`; the runtime injects the client and storage.

The surface maps transport to injected feature operations, including the
official Access capabilities. Login and logout may return a typed semantic
session effect; they never set a browser cookie directly. It does not select
persistence, read environment configuration, start listeners, or bypass the
normal gateway used by the site Edge.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).

## Emailer/SMTP assembly pilot

`src/capabilities/features/build.ts` lists the selected SDK implementations once.
SMTP's entry projects the injected Emailer service and declares its Secrets
requirements. Generated releases include the base Emailer contract and exact SMTP
parent pin; the manifest claims only the complete SMTP implementation. Its inherited
send capability serves both concrete and parent invocations.

The same cached compilation feeds build claims and `registerOfficialFeatures`.
The runtime supplies approved `{ contractId, version, digest }` releases, exact
site/instance scope and durable keyed execution. Unknown SMTP pins and missing
Emailer services refuse mounting. Disabled SMTP requires neither its service nor
its execution options. Official error localization belongs to this surface.
Concrete Nodemailer and namespaced SecretStore wiring stay in the runtime.
Other feature families retain their current explicit adapters and manifest claims.
