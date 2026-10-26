# Repository Upgrade Model Improvements

Status: design TODO. The behavior described below is not implemented unless
explicitly identified as current behavior.

## Objective

Use one explicit lifecycle for contract capabilities, Provider-supported
contract releases and collection resources:

```text
active -> deprecated -> replaced -> unused -> removable
```

Prefer coexistence and usage analysis over automatic mutation of site-owned
data. A breaking change receives a new identity; the previous identity remains
available until no active consumer needs it.

## Contract Capability Lifecycle

Contract capabilities already support `deprecation.reason`,
`deprecation.replacedBy` and `deprecation.sunsetAt`. Build the upgrade workflow
around that metadata.

The expected publication sequence is:

1. Publish the replacement capability while retaining the old capability.
2. Mark the old capability as deprecated and point `replacedBy` to the
   replacement in the same release.
3. Migrate collections, Pages, Blocs and other consumers progressively.
4. Prove that the deprecated capability is unused by every affected site.
5. Remove it only in a later major contract release.

Contract SemVer remains authoritative:

- adding a capability requires a minor release;
- deprecation metadata alone may be published as a patch;
- removing or incompatibly changing a capability requires a major release;
- an existing capability must preserve compatible inputs and outputs within a
  major line.

Deprecation metadata is advisory until a site upgrade or grant change explicitly
acts on it. `sunsetAt` must never disable a capability automatically.

Provider persistence is outside the contract migration model. A Provider may
use dual reads, dual writes, background backfills or separate stores as long as
every contract release it advertises continues to conform to that release's
inputs, outputs, errors and behavior.

## Provider Release Retention

A Provider build must not replace one supported contract major with the next in
a single step.

For example, a Provider currently advertising `ulvia.cms.content@1.0.0` must
first ship a build advertising both exact releases:

```text
ulvia.cms.content@1.0.0
ulvia.cms.content@2.0.0
```

It must not advertise only `ulvia.cms.content@2.0.0` while any Provider
instance, site selection, grant or declared dependency still needs V1. A later
build may remove V1 only after authoritative usage analysis reports no remaining
consumer.

Add a hard preflight gate when approving or installing a new Provider manifest:
reject a manifest that drops an exact release still selected by a site. Runtime
traffic observations are not sufficient evidence for removal.

The same retention rule applies to official instance profiles. A Provider image
must support every exact profile pinned by its instance registry. New instances
may default to the new profile while existing instances remain pinned until an
explicit transition succeeds.

## Site Capability Usage And Grants

Add a site-wide capability usage analyser. It must combine:

- requirements declared by installed collections;
- Page query and mutation bindings;
- Bloc requirements;
- transitive capability requirements;
- integrations, operations and MCP tools;
- internal CMS consumers that are not represented by collection markup.

Invocation logs may supplement this inventory, but absence of recent traffic
must never prove that a capability is unused.

The report should distinguish at least:

```text
required
deprecated-required
deprecated-unused
unknown
```

Every usage must include a concrete location so an administrator can remediate
it. Unknown or unanalysable consumers fail closed during a breaking upgrade.

Separate contract selections from capability grants:

- a selection chooses the exact contract release and Provider installation;
- a grant determines which selected capabilities the site may invoke.

The Gateway should mint invocation credentials only for granted capabilities.
Deprecated and unused capabilities can then be explicitly closed to reduce the
site's attack surface without changing its selected contract release.

## Contract Upgrade Preflight

Before replacing a site's selected contract major:

1. Build the complete capability usage inventory.
2. Compare it with the target release.
3. Block when a required capability is absent.
4. Report its declared replacement when available.
5. Validate all transitive requirements.
6. Verify that the Provider currently serves both source and target releases.
7. Replace the selection atomically and update grants.
8. Keep the source release available while any other site still selects it.

## Collection Resource Lifecycle

Apply the same deprecation lifecycle to collection resources, including Blocs,
settings, theme tokens, texts, assets, contributed Pages and states.

A breaking resource change creates a new identity. For example, `card` remains
available while `card-v2` is introduced with a different attribute contract.
The old resource declares `replacedBy: card-v2` and is removed only after no Page,
Bloc, dependent collection or persisted reference uses it.

Do not silently rewrite site-owned content merely because a collection release
changed. Collection upgrades should be blocked with precise locations until the
site is compatible with the target release.

## Simplify Collection Migrations

Under the immutable-resource model, reassess and preferably remove:

- collection `dataGeneration`;
- per-resource `generation` for same-identity breaking changes;
- cumulative `fromGeneration` and `toGeneration` chains;
- `rename-*`, value mapping and automatic default mutation operations;
- automatic Page and Bloc document rewriting;
- migration-specific content snapshots and rollback journals.

These mechanisms primarily permit an incompatible mutation to retain its old
identity. They are redundant when incompatible resources receive new identities
and coexist during migration.

Before removing the existing protocol, audit published collection releases for
non-default generations or authored migrations. If any immutable public release
uses them, retain a legacy reader or introduce a new collection protocol instead
of reinterpreting its bytes.

## Retain Collection Upgrade Planning

Keep a read-only collection upgrade plan even if automatic data transformations
are removed. It should validate:

- all site-owned resource references against the target releases;
- imports and exports between collections;
- capability requirements;
- current collection configuration and text overrides;
- coordinated upgrades of dependent collections;
- exact target release digests and the expected installation revision.

The result should either confirm that the release switch is safe or list every
blocking reference and its suggested replacement. Coordinated release switches
may remain atomic without mutating Page content.

An incompatible configuration must be made valid explicitly before the switch.
Initially, prefer blocking and administrator input over a generic configuration
migration language.

## Implementation Work

- [ ] Define deprecation metadata for collection resources and validate local
      replacement references.
- [ ] Implement the site capability and collection-resource usage inventory.
- [ ] Include dependent collection imports and non-markup runtime consumers.
- [ ] Add site-scoped capability grants enforced by the Gateway.
- [ ] Add Provider manifest and profile retention preflights.
- [ ] Add contract-major upgrade planning with source/target coexistence checks.
- [ ] Replace collection migration preparation with a read-only compatibility
      and impact plan.
- [ ] Audit immutable published collections before removing generation fields
      or migration readers.
- [ ] Remove automatic transformation infrastructure only after the simpler
      upgrade path covers coordinated collection switches and recovery.
- [ ] Document operator-visible remediation and explicit confirmation flows.

## Acceptance Criteria

- A Provider cannot drop a contract release or profile still used by an active
  instance or site.
- A breaking contract upgrade identifies every blocking capability use.
- An unused deprecated capability can be explicitly denied at the Gateway.
- A breaking collection resource is introduced under a new identity and can
  coexist with its predecessor.
- A collection release cannot remove a resource while any known reference still
  targets it.
- Collection upgrades never rewrite site-owned content implicitly.
- Upgrade decisions rely on declared dependencies and complete site analysis,
  not solely on observed traffic.
