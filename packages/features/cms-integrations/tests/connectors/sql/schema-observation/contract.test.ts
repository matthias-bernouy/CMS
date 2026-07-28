import { describe, expect, test } from "bun:test";
import {
    canonicalObservedSchemaContractBytes,
    identifyObservedSchemaContract,
    parseObservedSchemaContractV1,
    sameObservedSchemaContract,
} from "@bernouy/cms-integrations";
import { observedSchemaFixture } from "./fixtures";

describe("observed connector schema contract", () => {
    test("strictly parses and canonically orders observed PostgreSQL state", async () => {
        const parsed = parseObservedSchemaContractV1(observedSchemaFixture());

        expect(parsed.namespaces.map((namespace) => namespace.name)).toEqual(["audit", "shop"]);
        expect(parsed.namespaces[1]!.relations[0]!.columns.map((column) => column.name)).toEqual([
            "account_id",
            "id",
            "serial_id",
        ]);
        expect(parsed.namespaces[1]!.relations[0]!.constraints.map((constraint) => constraint.name)).toEqual([
            "orders_account_fkey",
            "orders_id_positive",
            "orders_pkey",
            "orders_serial_id_key",
        ]);

        const identity = await identifyObservedSchemaContract(parsed);
        expect(identity.digest).toMatch(/^[a-f0-9]{64}$/);
        expect(identity.canonicalBytes).toEqual(canonicalObservedSchemaContractBytes(parsed));
    });

    test("is independent from catalog row order", () => {
        const left = parseObservedSchemaContractV1(observedSchemaFixture());
        const shuffled = observedSchemaFixture();
        shuffled.namespaces.reverse();
        shuffled.namespaces[0]!.relations[0]?.columns.reverse();
        shuffled.namespaces[0]!.relations[0]?.constraints.reverse();
        const right = parseObservedSchemaContractV1(shuffled);

        expect(sameObservedSchemaContract(left, right)).toBeTrue();
    });

    test.each([
        ["unknown root field", { ...observedSchemaFixture(), extra: true }, /extra.*not supported/],
        ["invalid schema", { ...observedSchemaFixture(), schema: "cms.integration.observed-schema.v2" }, /schema/],
        ["unstable owner", withOwner({ connectorKey: "Primary" }), /connectorKey/],
        ["duplicate namespace", withDuplicateNamespace(), /duplicate namespace/],
        ["unknown relation kind", withRelation({ kind: "sequence" }), /kind/],
        [
            "identity without internal sequence",
            withColumn({ identity: "always", sequenceDependency: "none" }),
            /internal/,
        ],
        [
            "internal sequence without identity",
            withColumn({ identity: "none", sequenceDependency: "internal" }),
            /identity/,
        ],
        ["serial without default", withColumn({ sequenceDependency: "auto", default: undefined }), /require a default/],
        [
            "generated without expression",
            withColumn({ generated: "stored", default: undefined }),
            /require an expression/,
        ],
        ["constraint unknown column", withConstraint({ columns: ["missing"] }), /unknown column/],
    ])("rejects %s", (_label, value, expected) => {
        expect(() => parseObservedSchemaContractV1(value)).toThrow(expected as RegExp);
    });
});

function withOwner(owner: Record<string, unknown>) {
    const fixture = observedSchemaFixture();
    return { ...fixture, owner: { ...fixture.owner, ...owner } };
}

function withDuplicateNamespace() {
    const fixture = observedSchemaFixture();
    return { ...fixture, namespaces: [...fixture.namespaces, structuredClone(fixture.namespaces[0]!)] };
}

function withRelation(relation: Record<string, unknown>) {
    const fixture = observedSchemaFixture();
    Object.assign(fixture.namespaces[1]!.relations[0]!, relation);
    return fixture;
}

function withColumn(column: Record<string, unknown>) {
    const fixture = observedSchemaFixture();
    Object.assign(fixture.namespaces[1]!.relations[0]!.columns[2]!, column);
    return fixture;
}

function withConstraint(constraint: Record<string, unknown>) {
    const fixture = observedSchemaFixture();
    Object.assign(fixture.namespaces[1]!.relations[0]!.constraints[0]!, constraint);
    return fixture;
}
