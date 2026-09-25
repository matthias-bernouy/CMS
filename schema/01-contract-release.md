# 1. Contract admission and publication

[All flows](./README.md) · Next: [Compatibility](./02-compatibility.md)

## Admission — implemented

Parsing validates the document. Admission also compiles its bindings and
returns its canonical identity. It does not resolve external requirements or
publish anything in a catalogue.

```mermaid
flowchart TD
    source["Object or strict JSON"] --> parse["Parse release and schemas"]
    parse --> examples["Validate mocks and asset references"]
    examples --> bindings["Compile HTTP bindings"]
    bindings --> canonical["Canonical release JSON"]
    canonical --> hasAssets{"Fixture assets declared?"}
    hasAssets -->|"No"| plain["admitContractRelease"]
    hasAssets -->|"Yes"| bundle["admitContractBundle"]
    bytes["Supplied immutable bytes"] --> bundle
    bundle --> verify{"IDs, sizes, hashes match?"}
    verify -->|"No"| reject["Reject admission"]
    verify -->|"Yes"| hash["SHA-256"]
    plain --> hash
    hash --> admitted["AdmittedContractRelease"]
```

Every validation stage can reject. Calling `admitContractRelease` with declared
assets rejects: use the bundle path instead. The `Json` variants additionally
enforce strict JSON syntax, duplicate-key rejection and input byte/depth limits.

Binary mock leaves use `{ assetId }`. Asset metadata is part of the release
JSON; the bytes are supplied separately and verified against that metadata.
The result contains the frozen release, compiled bindings, canonical JSON,
digest and, for bundles, verified assets. Mocks remain examples, not handlers.

## Catalogue publication — implemented

```mermaid
flowchart TD
    admitted["Admitted release"] --> reverify["Reverify with catalogue limits"]
    reverify --> existing{"Version already published?"}
    existing -->|"Same digest"| reuse["Return existing record"]
    existing -->|"Different digest"| reject["Reject publication"]
    existing -->|"No"| ownership["Check digest and publisher ownership"]
    ownership --> requirements["Resolve joint support-range witnesses"]
    requirements --> evolution["Check ordering and stable compatibility"]
    evolution --> accepted{"All checks pass?"}
    accepted -->|"No"| reject
    accepted -->|"Yes"| record["Store release and publishedAt"]
    record --> catalogue[("In-memory catalogue")]
```

Ownership, requirements and admission checks also reject immediately on
failure. The catalogue is currently in memory, not a remote registry. Each
support range must have a published witness jointly satisfying that capability's
requirements to the same contract. Omitted `supportRanges` means the whole
accepted range, not its OR branches. Historical yanked releases remain valid
references. This does not prove that the complete site graph is installable. See
[requirements](./03-requirements.md) and [compatibility](./02-compatibility.md).

## Metadata after publication — implemented

```mermaid
flowchart LR
    record["Published catalogue record"] --> deprecation["setDeprecation"]
    record --> yank["setYank"]
    deprecation --> revised["Updated catalogue metadata"]
    yank --> revised
    revised --> identity["Same release and digest"]
```

Deprecation and yank are independent metadata. Either can be cleared with
`null`. A new release does not automatically deprecate an old one, and
`sunsetAt` is informational, not an automatic cutoff. Yank is not deletion.

Sources: [prepareContractRelease](../packages/features/cms-repository/src/contracts/core/admission/prepareContractRelease.ts),
[admitContractRelease](../packages/features/cms-repository/src/contracts/core/admission/admitContractRelease.ts),
[admitContractBundle](../packages/features/cms-repository/src/contracts/core/admission/admitContractBundle.ts),
[verifyFixtureAssets](../packages/features/cms-repository/src/contracts/core/admission/verifyFixtureAssets.ts),
[InMemoryReleaseCatalogue](../packages/features/cms-repository/src/contracts/default-implementation/memory/InMemoryReleaseCatalogue.ts).
