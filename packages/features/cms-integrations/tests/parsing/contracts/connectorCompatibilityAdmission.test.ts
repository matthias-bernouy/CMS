import { describe, expect, test } from "bun:test";
import { assertSqlConnectorSchemaCompatibilityDeclared, parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations connector compatibility admission", () => {
    test("keeps legacy definitions and stored snapshots parseable", () => {
        const definition = parseIntegrationDefinition({
            kind: "legacy",
            label: "Legacy",
            inputs: [],
            connectors: [{ provider: "supabase", schemas: [{ path: "sql/schema.sql" }] }],
        });

        expect(definition.connectors?.[0]).toEqual({
            provider: "supabase",
            schemas: [{ path: "sql/schema.sql" }],
        });
        expect(() => assertSqlConnectorSchemaCompatibilityDeclared(definition)).toThrow(
            /compatibility\.schema.*required when the connector deploys SQL schemas/,
        );
    });

    test("accepts an explicit empty declaration and non-SQL connectors", () => {
        const declared = parseIntegrationDefinition({
            kind: "declared",
            label: "Declared",
            inputs: [],
            connectors: [
                {
                    provider: "supabase",
                    schemas: [{ manifest: "sql/manifest.json" }],
                    compatibility: { schema: { namespaces: [] } },
                },
                { provider: "supabase", functions: [{ name: "hook", directory: "functions/hook" }] },
            ],
        });

        expect(() => assertSqlConnectorSchemaCompatibilityDeclared(declared)).not.toThrow();
    });

    test("rejects duplicate declared identities at every owned scope", () => {
        for (const schema of [
            duplicateNamespaces(),
            duplicateRelations(),
            duplicateColumns(),
            duplicateConstraints(),
        ]) {
            expect(() => parseSchema(schema)).toThrow(/duplicate/);
        }
    });

    test("rejects ambiguous declarations instead of ignoring misspelled fields", () => {
        expect(() =>
            parseSchema({
                namespaces: [{ name: "shop", relations: [] }],
                namespace: [],
            }),
        ).toThrow(/compatibility\.schema\.namespace.*not supported/);
    });
});

function parseSchema(schema: unknown) {
    return parseIntegrationDefinition({
        kind: "orders",
        label: "Orders",
        inputs: [],
        connectors: [{ provider: "supabase", compatibility: { schema } }],
    });
}

function duplicateNamespaces() {
    return {
        namespaces: [
            { name: "shop", relations: [] },
            { name: "shop", relations: [] },
        ],
    };
}

function duplicateRelations() {
    return {
        namespaces: [
            {
                name: "shop",
                relations: [relation("orders"), relation("orders")],
            },
        ],
    };
}

function duplicateColumns() {
    return {
        namespaces: [
            {
                name: "shop",
                relations: [
                    {
                        ...relation("orders"),
                        columns: [column("id"), column("id")],
                    },
                ],
            },
        ],
    };
}

function duplicateConstraints() {
    return {
        namespaces: [
            {
                name: "shop",
                relations: [
                    {
                        ...relation("orders"),
                        constraints: [constraint("orders_pkey"), constraint("orders_pkey")],
                    },
                ],
            },
        ],
    };
}

function relation(name: string) {
    return { name, columns: [column("id")], constraints: [] };
}

function column(name: string) {
    return { name, type: "bigint", nullable: false };
}

function constraint(name: string) {
    return { kind: "primary-key", name, columns: ["id"] };
}
