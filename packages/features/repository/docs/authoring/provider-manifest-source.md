# Provider manifest source snapshot

Use prepare-provider-manifest with a complete source object containing exactly
one text file, definition.json. Its content is a serialized Provider manifest.
Manifest sources contain no behavior modules, executable implementation, docs
folder, binary assets or credentials.

## Manifest fields

Declare kind: provider-manifest, protocol, schemaDialect, providerId, version,
name and provenance with the owning publisher. The providerId namespace must
match provenance.publisherId. Describe supported build versions, allowed endpoint
origins, configuration schema and credential-slot metadata.

Each implementation pins contractId, version and digest exactly. Its requirements
and delegation declarations must pass the ordinary Provider manifest admission
rules. Global requirements must resolve to non-yanked contracts in their stated
ranges. Do not put actual Provider tokens or PATs in a manifest source.

Example definition shape, using exact real contract pins in place of placeholders:

```json
{
  "kind":"provider-manifest",
  "protocol":"ulvia-provider/v1",
  "schemaDialect":"ulvia-schema/v1",
  "providerId":"community/notes-provider",
  "name":"Notes Provider",
  "version":"1.0.0",
  "provenance":{"publisherId":"community","publishedAt":"2026-11-05T00:00:00Z"},
  "buildVersionRange":">=1.0.0 <2.0.0",
  "endpoint":{"allowedOrigins":["https://provider.example.com"],"defaultOrigin":"https://provider.example.com"},
  "configuration":{"type":"object","properties":{},"required":[]},
  "credentialSlots":[],
  "implementations":[{"contractId":"community/notes","version":"1.0.0","digest":"sha256:<published-contract-digest>","requires":[]}],
  "requires":[]
}
```

Wrap the definition as {files: [{path: "definition.json", content: "..."}]} and
serialize that object into sourceJson. Publish a new contract first when the
manifest depends on it, then prepare the manifest against that exact release.
Dependency lookup is read-only and does not install or import those contracts.

## Publication and editing

Follow [artifact authoring](artifact-authoring.md). publish-provider-manifest
publishes the exact prepared digest and retains its private sources. It does not
register an installation, deploy a server or prove that an endpoint implements
the manifest. Use get-provider-manifest-sources with namespace, providerId and
version to retrieve sources as the current namespace owner.

A successful manifest preparation or publication never changes capability grants
or site selections. Connection and installation remain explicit reviewed flows.
