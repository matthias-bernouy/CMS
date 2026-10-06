# Contract releases

`@bernouy/cms-repository/contracts` defines immutable, provider-neutral capabilities,
their schemas and compiled HTTP bindings. It also admits mocks and binary
assets, publishes releases in a catalogue, compares evolutions, and validates
independently versioned conformance suites.

No provider is contacted by this package. Admission proves that a document is
internally valid, not that an implementation passes its contract.

## Discovery metadata

A release may include a bounded `catalogue` object with an `icon` token and up
to six category tokens. Repositories expose those values for discovery UIs;
the consuming CMS maps icon tokens to trusted local artwork and never renders
publisher-supplied SVG. The repository catalogue owns `publishedAt`, so release
authors cannot choose the “last updated” date displayed by Control.

Changing discovery metadata changes the immutable release digest and therefore
needs a new release coordinate once that artifact has been published.

## Release and dependency evolution

A capability may declare mandatory requirements:

```ts
requires: [
    {
        contractId: "payment",
        capabilityId: "payment.link.create",
        versionRange: "^1.0.0 || ^2.0.0",
        supportRanges: ["^1.0.0", "^2.0.0"],
    },
]
```

Only the contract has a version; capability IDs have no independent version.
Requirements accept bounded exact, caret, tilde, comparator intersections and
OR unions: at most four branches and 256 characters. Prereleases need explicit
opt-in for their release tuple.

The compatibility checker compares accepted version sets, not their spelling.
For example, changing `^1.0.0` to `>=1.0.0 <2.0.0` is patch-equivalent;
adding `|| ^2.0.0` is minor; removing `^1.0.0` is major. Adding or removing a
mandatory requirement on an existing capability is also major.

`versionRange` defines accepted versions, not a test matrix. Optional
`supportRanges` makes evidence partitions explicit: one to four nonempty
subsets whose union covers the accepted set. Omission means `[versionRange]`,
even when that range contains `||`. Publication requires a published witness
for each support range. For one capability's requirements to the same contract,
that witness must jointly expose all required capabilities and satisfy all
their ranges. Yanked releases remain historical references; this does not
prove whole-installation satisfiability or availability.

The catalogue keeps publisher ownership across all majors. It compares a
candidate against the latest stable release in its own major and enforces
ordering within each prerelease target. Thus `1.1.0-alpha.1` does not prevent
publishing `1.0.1`; `2.0.0-alpha.2` may revise `2.0.0-alpha.1` before
stabilization. This does not permit a breaking `1.1.0-alpha.2` over stable
`1.0.0`. Stable minor lines within one major are not independent maintenance
branches, and `0.x` uses the same conservative compatibility policy.

## Compatibility is not conformance

`@bernouy/cms-repository/contracts/compatibility` exposes:

- `validEvolution`: identity, ownership and versioning policy permit this
  evolution. A correctly numbered breaking major can have this flag set.
- `consumerCompatible`: no breaking consumer change was detected, assuming
  output projection to the selected release. A minor change incorrectly
  numbered as a patch can have this flag set while `validEvolution` is false.
- `requiredBump`, `declaredBump` and located `issues`: explain the decision.

Old inputs must remain accepted. New outputs must remain valid after projection
through the old output schema, recursively. New object fields can be removed
by projection, but old fields, required properties and projected property
counts must remain supported. Removing an old output field is conservative:
even an optional field removal requires a major.

Projection never truncates strings, arrays or maps to meet older bounds.
Expanding a possible output string from 100 to 150 characters therefore still
requires a major. An old selected release retains its own validation rules.
These flags do not prove old binding support or provider conformance.
Equivalent object constraints can remain patches: adding a field to `required`
does not narrow values when a closed object's `minProperties` already forces it present.

## Schema and transport profiles

String and map-key lengths use UTF-16 code units, not grapheme counts. Formats
follow this dialect's concrete validators: calendar `YYYY-MM-DD`; uppercase
date-time separators, seconds 00–59 and a required UTC/offset suffix; a simple
whitespace-free email pattern; `URL.canParse` for URI; and case-insensitive
UUID versions 1–8 with the standard variant. These are not full validation of
every email or URI standard. Admission rejects known impossible format lengths
and map key/count combinations, not every theoretically uninhabited schema.

HTTP scalars use `json-percent`; GET/HEAD are queries, and HEAD error identity
uses reserved headers. See the normative
[HTTP parameter profile](../../fixtures/contracts/protocol-v1/http-parameters.md).

## Conformance with dependencies

A suite remains pinned to one exact root release. Dependency profiles select
concrete combinations of other releases:

```ts
dependencyProfiles: [
    {
        id: "payment-v1",
        releases: [
            { contractId: "payment", version: "1.0.0", digest: paymentV1.digest },
        ],
    },
    {
        id: "payment-v2",
        releases: [
            { contractId: "payment", version: "2.0.0", digest: paymentV2.digest },
        ],
    },
]
```

Supply the corresponding admitted artifacts explicitly:

```ts
parseConformanceSuite(document, root, limits, [paymentV1, paymentV2]);
await admitConformanceSuite(document, root, assets, limits, [paymentV1, paymentV2]);
```

Parsing expects trusted admitted artifacts; admission re-verifies their
integrity and suite-owned binary assets. It never fetches dependencies.
A call with `dependencyContractId: "payment"` targets that profile's selected
payment release for setup or verification; an omitted field targets the root.

Omitting a scenario's `profiles` applies it to every profile; otherwise a
nonempty list of known profile IDs selects its matrix. Each profile needs an
applicable scenario. Validate its applicable inputs, actors, assertions,
captures and transitive graph, with one release per dependency contract and
no cycles, unknown capabilities or unused selections.

Each support range of an exercised root requirement needs a matching profile
that actually calls that root capability. External calls never satisfy root
coverage. Aggregate and per-profile `profiles[]` coverage describe authored
checks, not successful execution or every accepted version/combination.

Calls can declare keyed replay, bounded operation completion, eventual sync
queries and cursor pagination. Templates support recursive `$literal` escaping;
capture paths include guaranteed object fields, array indices and asserted
map entries. See
[conformance controls](../../fixtures/contracts/protocol-v1/conformance-controls.md)
for exact restrictions. Every applicable scenario/profile pair requires fresh
disposable state, identities and captures. No runner or attestation is included.

## Remaining boundaries

Provider manifests may claim several exact releases, but each claim still needs
runtime conformance evidence. Installation and site-selection models belong to
the [providers domain](../providers/README.md), which consumes the contracts
facade; contracts do not depend on provider or installation state.
Whole-installation dependency planning, migrations, rollback, HTTP execution,
durable job persistence and idempotent replay context remain outside this
contract-admission domain. A provider deployment does not implicitly upgrade a
site's selected release. See the [package overview](../../README.md) for public
entry points.
