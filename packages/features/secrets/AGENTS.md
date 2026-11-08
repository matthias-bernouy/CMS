# @bernouy/secrets

Feature package for the `ulvia/cms.secrets` domain. It owns credential-scoped
namespaces, secret metadata, lifecycle and explicit value resolution while
delegating encrypted value storage to the generic `@bernouy/secret-store`
Foundation port.

- Never log, cache or include secret values in errors.
- Metadata reads never expose values; resolution requires a namespace key with
  the dedicated `secrets.resolve` permission.
- Contract implementations consume isolated namespace adapters; they never
  receive the encrypted backing `SecretStore` used by the Secrets implementation.
- Persistence adapters are exported through explicit subpaths.
- HTTP and capability authorization belong to the mounting provider surface.

- `./feature` exports the complete `secretsFeature`. Keep Zod models under
  `src/schemas/`, descriptors/default executors under `src/capabilities/` and normal
  Markdown under `docs/`. Generate contracts at build time; retain exact v1 schema,
  binding, error ordering, documentation bytes and digests during this migration.
- Public metadata and permission types derive from schemas. Keep the structural
  `SecretsService` port independent from the class's private persistence fields.
  Executable metadata projection belongs in core, not interfaces.
- Short executors use injected services. Map domain errors to declared safe failures;
  never expose private causes or credentials in the payload. The surface chooses
  HTTP status/localization from admitted bindings.
- Keyed create/rotate capabilities use `authorize` to recheck namespace write
  permission before receipt access, including replays. Domain service calls retain
  their own checks for direct callers. Namespace key creation returns credentials
  and must not be made keyed or persisted in generic receipts.
- Expiration checks run at invocation time. Preserve v1 nullable input metadata;
  null and past expirations refuse execution without mutating namespace state.
