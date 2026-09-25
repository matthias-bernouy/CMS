# Conformance scenarios and controls

These Protocol v1 declarations are parsed and validated by
`@bernouy/cms-repository/contracts`.
They describe what a future runner must execute; parsing does not contact a
provider, wait, poll, provision tenants or issue passing-provider attestations.

## Profile applicability and isolation

`scenario.profiles: ["payment-v1"]` selects declared dependency profiles.
Omit `profiles` to apply the scenario to all profiles. A selector is nonempty,
unique and bounded; unknown IDs reject. Every declared profile needs at least
one applicable scenario. Its dependency graph comes from those scenarios,
including external setup/verification calls and their transitive requirements.

For every support range of an exercised root requirement, at least one profile
must both select a matching release and actually call that root capability.
Merely selecting a release for unrelated scenarios is not evidence. The default
support range is the entire accepted `versionRange`, not its textual OR branches.

Provision a fresh disposable tenant, identities, invocation-key namespace and
capture table for each applicable scenario/profile pair; dispose them on both
success and failure. Calls are ordered within a scenario. Profiles select exact
release/digest combinations, not every version or every Cartesian combination.

## Inputs, assertions and captures

- `{ $capture: "created-id" }` references a capture from an earlier call in the
  same scenario. Its schema must fit the target without projection or coercion.
- `{ $literal: data }` treats the entire wrapped subtree as business data:
  nested `$capture` and `$literal` keys are no longer template markers. Schema
  validation still applies. Binary leaves still use declared `{ assetId }`
  fixtures; literal escaping does not create inline binary data.
- Checks use either `equals` or `present: true`; presence includes a null value.
  Paths are JSON Pointers: `""` selects the whole output, `/items/0/id` traverses
  an array, and `~0`/`~1` escape tildes/slashes in keys. Presence must select a
  field. V1 rejects duplicate paths and ancestor/descendant overlaps, including
  a whole-output assertion combined with a child assertion.
- Successful calls may capture required object fields, indices guaranteed by
  `minItems`, or the whole output. Otherwise an exact-path successful presence
  or equality check must establish the path, including a map entry. Bounds and
  declared schemas still apply. Such an assertion does not narrow the capture's
  declared type or remove nullability. Error calls cannot capture success output.

## Invocation keys and replay

```ts
invocationKey: "create-once",
replayOf: "first-create",
```

`invocationKey` is a scenario-local logical label, permitted only on keyed
commands. Omission instructs the runner to generate a fresh key. Reusing the
same key with the same target and actor requires `replayOf`; a replay references
an earlier successful call, keeps its target, actor, explicit key and authored
input, and also expects success. Forward references and changed inputs reject.

The runner must compare actual replay results and, for operations, operation
IDs. Matching responses alone do not prove that the side effect happened once:
author a separate readback call for that. Key labels do not represent real
credentials or persist across scenario/profile pairs.

## Operation completion

```ts
completion: { timeoutMs: 10_000, pollIntervalMs: 250 },
```

An operation success requires `completion`. Its initial HTTP response is the
202 handle, not the capability's final output. Wait `pollIntervalMs` before the
first poll, repeat at that interval, and clamp the last scheduled poll to the
timeout. Stop when terminal; at most `ceil(timeoutMs / pollIntervalMs)` polls
are allowed. Both duration and poll count have configured admission bounds.

Assertions and captures concern the final result. An error expectation with
`completion` means accepted operation followed by a final declared error;
without it, the initial request is expected to reject. Completion is invalid
for synchronous capabilities. Polling endpoints and operation persistence
remain runtime responsibilities.

## Eventual query assertions

```ts
eventually: { maxAttempts: 5, intervalMs: 100 },
```

Only a synchronous query with a success expectation may use `eventually`.
Run the first attempt immediately, then retry until its assertions pass or
`maxAttempts` is exhausted, waiting `intervalMs` between attempts. Configured
attempt and total-wait bounds apply. It cannot combine with replay, completion
or pagination. It never authorizes retrying a command with uncertain effects.

## Cursor pagination

```ts
pagination: {
    itemsPath: "/items",
    cursorPath: "/nextCursor",
    cursorInput: "cursor",
    maxPages: 10,
    uniqueBy: "/id",
},
```

Pagination requires a successful synchronous query. `itemsPath` selects a
guaranteed non-null array; `cursorPath` selects a guaranteed nullable string.
`cursorInput` names an optional nullable top-level input string accepting every
output cursor. The authored input must leave room for a continuation cursor
within its property-count bound. `null` is the only terminal cursor marker.

Preserve every other input property while continuing. Apply authored checks to
every page, fail on a repeated non-null cursor, and require termination within
the configured `maxPages`. Optional `uniqueBy` selects a guaranteed non-null
string or integer within each item (`""` means the item itself); identities must
be unique within and across pages. Pagination calls cannot declare captures:
V1 does not define page-specific or aggregate capture values.

## Coverage reports

Coverage reports describe authored calls, success assertions, declared
errors and reasoned exemptions. With dependency profiles, `profiles[]` exposes
the same coverage per applicable subset so aggregate coverage cannot hide an
individual profile's gap. Counts are declarations, not expanded polls, pages
or measured executions. External calls never count as root capability coverage.
`successAsserted` only means a success expectation has an authored presence or
equality check; a replay declaration alone does not set it or prove correct
side effects. Coverage alone is neither execution evidence nor a completeness
guarantee.
