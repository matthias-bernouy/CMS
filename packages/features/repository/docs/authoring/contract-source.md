# Contract source snapshot

Use prepare-contract with one serialized source object. It has the same files
array as collection authoring; contract paths are definition.json and recursive
capabilities/, mocks/, docs/ and fixtures/ files. Never provide an authored
documentation manifest. The compiler derives it from verified Markdown bytes.

## Definition and capabilities

Keep contract identity and version in definition.json:

```json
{"kind":"contract","protocol":"ulvia-provider/v1","schemaDialect":"ulvia-schema/v1","contractId":"community/notes","publisherId":"community","version":"1.0.0","name":"Notes"}
```

A capability fragment, for example capabilities/queries/read.json, declares its
stable ID, access, behavior, bounded schemas, errors and explicit HTTP/MCP
bindings. Source paths organize files and do not define capability identities.

```json
{"id":"read","access":"public","behavior":{"effect":"query","execution":"sync","sensitive":false},"input":{"type":"object","properties":{},"required":[]},"output":{"type":"string","maxLength":128},"errors":[],"bindings":[{"id":"http","transport":"http","method":"GET","path":"/read","input":{},"response":{"successStatuses":[200],"contentTypes":["application/json"],"errorStatuses":{}}}],"docs":["overview.md"]}
```

Add docs/overview.md with exactly one real H1 and useful capability guidance.
Each Markdown file becomes a digest-verified document asset. Relative document
links and capability docs references must resolve. Separate mock fragments live
under mocks/ and declare their owning capabilityId. Referenced parents must
already be available in the host or configured Repository.

## Binary fixtures

Contract fixture metadata belongs to the contract definition; exact bytes come
from fixtures/<asset-id>. A textual fixture can be an ordinary files entry.
For a binary fixture, reference an immutable managed site-file generation:

```json
{"path":"fixtures/sample.bin","fileId":"<file-id>","generation":"<generation>"}
```

Put that object in the snapshot's assets array, without duplicating its path in
files. The referenced bytes must match the declared fixture length and digest.
The retained source replaces the site reference with a portable exact reference:

```json
{"path":"fixtures/sample.bin","publisherId":"community","contractId":"community/notes","version":"1.0.0","releaseDigest":"sha256:<returned-digest>","assetId":"sample.bin"}
```

Packaged fixtures become public release assets when published, including bytes
that originated in a private site file. Keep that reference when authoring a later version. Collection asset references
can also supply bytes where the declared fixture verifies them; a mutable URL or
base64 string is not an immutable asset reference.

## Bounds and validation

Source JSON is bounded to 8 MiB UTF-8, 16,384 files including asset references,
1,024 asset references, 20 path segments and 1 MiB UTF-8 per text file. Contract fixtures are read
sequentially, limited to 16 MiB each and 64 MiB combined, independently of source JSON.
Each path is relative, unique and nonoverlapping; traversal and hidden segments
are refused. Contract admission applies its additional schema, fixture,
documentation and protocol limits.

Follow [artifact authoring](artifact-authoring.md) for exact publication,
source-retention recovery and namespace checks. Publishing documentation changes
a contract's immutable digest; it does not update an installed site selection.
