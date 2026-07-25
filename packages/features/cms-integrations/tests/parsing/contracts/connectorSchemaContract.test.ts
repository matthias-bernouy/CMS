import { describe, expect, test } from "bun:test";
import {
    type DeclarativeConnectorSchemaContract,
    parseConnectorSchemaContract,
    parseIntegrationDefinition,
} from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations connector schema compatibility contract", () => {
    test("normalizes provider types, ordering, and constraint defaults", () => {
        const definition = parseIntegrationDefinition({
            kind: "orders",
            label: "Orders",
            inputs: [],
            connectors: [
                {
                    provider: "supabase",
                    schemas: [{ path: "sql/schema.sql" }],
                    compatibility: { schema: unsortedContract() },
                },
            ],
        });

        expect(definition.connectors?.[0]?.compatibility?.schema).toEqual({
            namespaces: [
                {
                    name: "accounts",
                    relations: [],
                },
                {
                    name: "shop",
                    relations: [
                        {
                            name: "orders",
                            columns: [
                                { name: "account_id", type: "bigint", nullable: false },
                                { name: "created_at", type: "timestamptz(3)[]", nullable: false, default: "now()" },
                                { name: "id", type: "bigint", nullable: false },
                            ],
                            constraints: [
                                {
                                    kind: "foreign-key",
                                    name: "orders_account_fk",
                                    columns: ["account_id"],
                                    references: { namespace: "accounts", relation: "users", columns: ["id"] },
                                    onUpdate: "no-action",
                                    onDelete: "cascade",
                                },
                                { kind: "check", name: "orders_id_positive", expression: "id > 0" },
                                { kind: "primary-key", name: "orders_pkey", columns: ["id"] },
                                {
                                    kind: "unique",
                                    name: "orders_unique_account",
                                    columns: ["account_id", "id"],
                                    nullsNotDistinct: false,
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    });

    test("exports a standalone strict normalizer for reviewed baselines", () => {
        const parsed: DeclarativeConnectorSchemaContract = parseConnectorSchemaContract(
            { namespaces: [{ name: "public", relations: [] }] },
            "supabase",
        );

        expect(parsed).toEqual({ namespaces: [{ name: "public", relations: [] }] });
    });

    test.each([
        ["non-string type", contractWithColumn({ type: 42 }), /type.*non-empty string/],
        ["empty type", contractWithColumn({ type: " " }), /type.*non-empty string/],
        ["SQL instead of type", contractWithColumn({ type: "text; drop table users" }), /normalized provider type/],
        ["non-boolean nullability", contractWithColumn({ nullable: "false" }), /nullable.*boolean/],
        ["unknown constraint kind", contractWithConstraint({ kind: "index" }), /constraint.*kind/],
        ["empty check", contractWithConstraint({ kind: "check", expression: "" }), /expression.*non-empty/],
        ["invalid FK action", contractWithConstraint({ kind: "foreign-key", onDelete: "delete" }), /onDelete/],
        ["unknown local column", contractWithConstraint({ columns: ["missing"] }), /unknown column/],
        ["duplicate constraint column", contractWithConstraint({ columns: ["id", "id"] }), /duplicate column/],
        [
            "mismatched FK arity",
            contractWithConstraint({ kind: "foreign-key", columns: ["id", "account_id"] }),
            /match the local column count/,
        ],
    ])("rejects %s", (_label, schema, expected) => {
        expect(() => parseConnectorSchemaContract(schema, "supabase")).toThrow(expected as RegExp);
    });
});

function unsortedContract() {
    return {
        namespaces: [
            {
                name: "shop",
                relations: [
                    {
                        name: "orders",
                        columns: [
                            { name: "id", type: "INT8", nullable: false },
                            {
                                name: "created_at",
                                type: " TIMESTAMP ( 3 ) WITH TIME ZONE [] ",
                                nullable: false,
                                default: "now()",
                            },
                            { name: "account_id", type: "bigint", nullable: false },
                        ],
                        constraints: [
                            { kind: "primary-key", name: "orders_pkey", columns: ["id"] },
                            { kind: "check", name: "orders_id_positive", expression: "id > 0" },
                            {
                                kind: "unique",
                                name: "orders_unique_account",
                                columns: ["account_id", "id"],
                            },
                            {
                                kind: "foreign-key",
                                name: "orders_account_fk",
                                columns: ["account_id"],
                                references: { namespace: "accounts", relation: "users", columns: ["id"] },
                                onDelete: "cascade",
                            },
                        ],
                    },
                ],
            },
            { name: "accounts", relations: [] },
        ],
    };
}

function contractWithColumn(column: Record<string, unknown>) {
    return oneRelation({ columns: [{ name: "id", type: "bigint", nullable: false, ...column }], constraints: [] });
}

function contractWithConstraint(constraint: Record<string, unknown>) {
    const kind = constraint.kind ?? "primary-key";
    const base =
        kind === "foreign-key"
            ? {
                  kind,
                  name: "orders_constraint",
                  columns: ["id"],
                  references: { namespace: "accounts", relation: "users", columns: ["id"] },
              }
            : kind === "check"
              ? { kind, name: "orders_constraint", expression: "id > 0" }
              : { kind, name: "orders_constraint", columns: ["id"] };
    return oneRelation({
        columns: [
            { name: "id", type: "bigint", nullable: false },
            { name: "account_id", type: "bigint", nullable: false },
        ],
        constraints: [
            {
                ...base,
                ...constraint,
            },
        ],
    });
}

function oneRelation(relation: Record<string, unknown>) {
    return { namespaces: [{ name: "shop", relations: [{ name: "orders", ...relation }] }] };
}
