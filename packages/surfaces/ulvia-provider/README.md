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

## SDK feature assembly

`src/capabilities/features/inventory.ts` lists the selected SDK implementations once.
SMTP's entry projects the injected Emailer service and declares its Secrets
requirements. Generated releases include the base Emailer contract and exact SMTP
parent pin; the manifest claims only the complete SMTP implementation. Its inherited
send capability serves both concrete and parent invocations.

Build-only compilation feeds release claims and the generated runtime artifact.
`loadOfficialFeatures` verifies that shipped metadata once per process and attaches
executors without scanning docs or compiling schemas. `registerOfficialFeatures`
mounts only approved implementation pins.
The runtime supplies approved `{ contractId, version, digest }` releases, exact
site/instance scope and durable keyed execution. Unknown SMTP pins and missing
Emailer services refuse mounting. Disabled SMTP requires neither its service nor
its execution options. Official error localization belongs to this surface.
Concrete Nodemailer and namespaced SecretStore wiring stay in the runtime.
Other feature families retain their current explicit adapters and manifest claims.

Secrets is selected through the same inventory and receives an injected structural
service port. Its 13 capabilities own their schemas, bindings and execution in the
feature; the former surface registrars are removed. Keyed creation/rotation verify
namespace write permission before every receipt lookup, including replay. Namespace
credential checks are domain-owned; Provider authorization/localization stay here.

Files uses the same inventory for its complete 27-capability implementation.
Its entry under `src/capabilities/features/implementations/` projects injected
`files` and `workspace` ports and preserves its Secrets requirements. Feature-owned
executors adapt binary reads to streaming responses, preserving range/cache headers.
The surface preserves domain response headers when localizing declared errors,
including the required `Content-Range` on a `416` response. The former Files registrar
and handwritten manifest claim are removed. Files has no keyed capabilities.

Observability is selected from the same inventory through a structural journal
port. Its feature owns the four executors, ingestion machine-context guard,
Zod-derived DTOs and domain error policy. Read authorization and official failure
presentation stay in this surface. The legacy diagnostic registrar is removed.
