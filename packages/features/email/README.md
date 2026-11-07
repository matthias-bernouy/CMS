# Email features

- `base/` publishes `@bernouy/email`: shared Zod message schemas, inferred delivery
  ports and transport-neutral memory/console implementations.
- `smtp/` publishes `@bernouy/email-smtp`: shared Zod configuration schemas,
  inferred administration ports and a secret-backed SMTP implementation.

Both expose the complete feature and its service port types through `./feature`.
The package root exposes business ports, inferred types and domain errors. Schemas
and capability files are internal; Emailer's shared `emailErrorSchema` is exported
individually from its root. Documentation stays in
ordinary `docs/**/*.md` files within each package; the contract declares its directory
as a file URL and compilation discovers the Markdown recursively. Relative paths,
including `.md`, are document IDs; no TypeScript Markdown imports are required.
Nodemailer is available only through `@bernouy/email-smtp/nodemailer`.
Each `src/feature.ts` declares one `defineFeature` source: contract identity, version,
parent and capability list. The build generates its declarative contract release.
SMTP explicitly extends the Emailer feature; the build generates the exact parent
pin. Capabilities declare IDs, access, behavior and HTTP/MCP bindings. The Provider
imports the feature definition and selects its implementation. Folder grouping
grants no inheritance.

Contract IDs, versions, UTF-16 rules and immutable digests remain unchanged by
the directory/package rename. No package aliases for the previous names remain.

Reusable schemas live in `src/schemas/`. Each descriptor lives in its own file
under `src/capabilities/`; SMTP configuration capabilities use a `configuration/`
subdirectory. Larger families can group schemas and capabilities by domain without
changing these roles. Ports infer data types directly from schemas; core services
validate those same schemas. Private storage projections are not public exports.

Capabilities accept an explicit array of named mocks, including multiple outcomes
for the same input. Mock files can be imported without an owner ID; admission
validates every scenario. There is no mock-directory scan.

`src/capabilities/define.ts` declares the service context once with
`capabilitiesFor<EmailerServices>()` or `capabilitiesFor<SmtpEmailerServices>()`.
It supplies only `defineCapability`; `defineFeature` comes directly from the SDK.
Feature service requirements are inferred from its capabilities and parent.
Capabilities declare their default `execute({ input, services, context, fail })`.
`input` and declared failure payloads are inferred from their schemas. `services`
contains feature-local ports; no service is instantiated during authoring or build.
SMTP's service ports extend Emailer's, so it inherits the send executor without
a capability table or adapter wrapper.

The Provider surface selects the complete feature with `implementFeature` and
retains manifest requirements and official error presentation. The runtime supplies
concrete services, secret storage and durable execution. Other surfaces can select
another complete implementation with `implementContract`.

Short executors stay in their capability file. Larger treatments can be ordinary
functions referenced by `execute`, or delegated to core services. There is no
mandatory `handlers/` directory or public handler export. Missing executors are
allowed for contract-only definitions; implementing a feature requires complete
own and inherited execution.

Public schemas retain the v1 contract constraints and exact digests. Derived
internal Zod schemas own normalization, nonblank delivery data, SMTP password
normalization and enabled-configuration checks. Stored-state validation runs after
merging retained credentials. Private validation diagnostics never become public
error payloads. Runtime compilation remains until direct artifact mounting is
implemented.

The Provider runtime mounts verified generated contract metadata and matching
executors. Its startup does not need these source Markdown directories; the build
still discovers them and publishes their exact bytes as separate assets.
