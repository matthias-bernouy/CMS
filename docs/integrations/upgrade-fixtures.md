# Business upgrade fixtures

Generic schema comparison cannot prove that a real order, consent, document,
shipment, or acceptance remains usable. An integration-owned upgrade fixture
creates that state with the old package installed and verifies it after the new
package becomes active.

Define fixtures at the exact path:

```text
tests/integration-contracts/upgrade-fixtures.ts
```

The module is author-only test code and is excluded from runtime package bytes.

## Minimal fixture

```ts
import { assert, expect } from "@bernouy/cms-integration-verification/sdk/v1";
import {
    defineUpgradeScenario,
    defineUpgradeScenarios,
    UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";

const activeRecord = defineUpgradeScenario({
    name: "preserves an active record",
    from: ">=1.0.0 <3.0.0",
    async seedBeforeUpgrade(context) {
        const [row] = await context.database.query(
            `insert into example.records (external_id, status)
             values ($1, 'active') returning id::text as id`,
            ["upgrade-fixture"],
        );
        assert(typeof row?.id === "string");
        return { id: row.id };
    },
    async assertAfterUpgrade(context, state) {
        const rows = await context.database.query(
            `select id::text as id, status from example.records where id = $1`,
            [state.id],
        );
        expect(rows).toEqual([{ id: state.id, status: "active" }]);

        const response = await context.cms.request(
            `/.cms/sources/example/record?id=${encodeURIComponent(state.id)}`,
        );
        assert(response.status === 200);
    },
});

export default defineUpgradeScenarios({
    schema: UPGRADE_FIXTURE_SUITE_SCHEMA_V1,
    scenarios: [activeRecord],
});
```

## Lifecycle

`seedBeforeUpgrade` runs after the immutable baseline and its declared
dependencies are installed. It should create the smallest realistic state that
would be expensive or dangerous to lose. Its return value is serialized as
bounded I-JSON and supplied to `assertAfterUpgrade`.

`assertAfterUpgrade` runs after the target installation reports success. Check
the stored state and at least one public or operator-visible behavior when that
behavior is part of the contract. Do not only check that a table still exists.

The same fixture participates in migration crash/restart scenarios. Seeds and
assertions therefore need deterministic identifiers and exact expectations.

## Available capabilities

The versioned context exposes only bounded verification APIs:

- `database.query(sql, parameters)` for parameterized PostgreSQL access;
- `cms.request(path, request)` for authenticated same-origin CMS requests;
- `auth.createUser(...)` for local Supabase Auth identities;
- `storage.ensureBucket`, `upload`, `exists`, and `download`;
- `functions.invoke(slug, body)` for a deployed local Edge Function.

Use these APIs instead of reading verifier environment variables. Supabase
service credentials stay inside the verifier and never enter the fixture.

Declare extra integrations needed by the business scenario explicitly:

```ts
dependencies: [
    { kind: "commerce", versionRange: "^2.0.0" },
]
```

## Coverage rules

The `from` field is a supported SemVer range. Once a fixture suite exists,
every immutable baseline considered by the audit must match at least one
scenario. Use multiple scenarios when old majors have different schemas or
when independent business states carry different risks.

Good fixture candidates include:

- an accepted legal document with immutable version and hash evidence;
- an active order with reserved inventory and an idempotency key;
- a pending payment, refund, payout, or reconciliation operation;
- a stored file plus its database ownership record;
- a user whose Auth identity is referenced by integration data;
- an active configuration that an installation hook must not overwrite.

Assertions should cover identifiers, money and quantities, actor ownership,
version/hash evidence, timestamps when meaningful, and replay behavior. Avoid
asserting volatile implementation details that are not part of the contract.

## Limitations

Fixtures and other author tests are currently executed from the source tree.
They are not embedded in runtime package bytes, and their exact immutable
verification bundle is not yet published. Remote publication must close that
evidence gap before it can trust a local result without rerunning verification.
