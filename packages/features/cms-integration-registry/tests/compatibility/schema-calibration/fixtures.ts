import { connector, evaluator, packageState } from "../fixtures";
import type { DeclarativeConnectorSchemaContract } from "@bernouy/cms-integrations";

type MatrixSchema = DeclarativeConnectorSchemaContract;

export type SchemaMutation = (schema: MatrixSchema) => void;

export function evaluateMutation(mutate: SchemaMutation) {
    return evaluateSchemaPair(() => undefined, mutate);
}

export function evaluateSchemaPair(mutateBaseline: SchemaMutation, mutateCandidate: SchemaMutation) {
    const baselineSchema = matrixSchema();
    mutateBaseline(baselineSchema);
    const candidateSchema = structuredClone(baselineSchema);
    mutateCandidate(candidateSchema);
    return evaluator().evaluate({
        baseline: sqlPackage("1.0.0", baselineSchema),
        candidate: sqlPackage("1.1.0", candidateSchema),
    });
}

export function matrixSchema(): MatrixSchema {
    return {
        namespaces: [
            {
                name: "app",
                relations: [
                    {
                        kind: "table" as const,
                        name: "accounts",
                        columns: [{ name: "id", type: "bigint", nullable: false }],
                        constraints: [{ kind: "primary-key" as const, name: "accounts_pkey", columns: ["id"] }],
                    },
                    {
                        kind: "table" as const,
                        name: "items",
                        columns: [
                            {
                                name: "id",
                                type: "bigint",
                                nullable: false,
                                identity: "by-default" as const,
                            },
                            { name: "account_id", type: "bigint", nullable: false },
                            { name: "slug", type: "character varying(40)", nullable: false, default: "'draft'" },
                            { name: "quantity", type: "integer", nullable: false, default: "0" },
                        ],
                        constraints: [
                            { kind: "primary-key" as const, name: "items_pkey", columns: ["id"] },
                            { kind: "unique" as const, name: "items_slug_key", columns: ["slug"] },
                            {
                                kind: "foreign-key" as const,
                                name: "items_account_fkey",
                                columns: ["account_id"],
                                references: { namespace: "app", relation: "accounts", columns: ["id"] },
                                onUpdate: "no-action" as const,
                                onDelete: "cascade" as const,
                            },
                            {
                                kind: "check" as const,
                                name: "items_quantity_check",
                                expression: "(quantity >= 0)",
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

export function items(schema: MatrixSchema) {
    return schema.namespaces[0]!.relations[1]!;
}

export function column(schema: MatrixSchema, name: string) {
    const value = items(schema).columns.find((entry) => entry.name === name);
    if (!value) {
        throw new Error(`Missing matrix column: ${name}`);
    }
    return value;
}

export function constraint(schema: MatrixSchema, name: string) {
    const value = items(schema).constraints.find((entry) => entry.name === name);
    if (!value) {
        throw new Error(`Missing matrix constraint: ${name}`);
    }
    return value;
}

function sqlPackage(version: string, schema: unknown) {
    return packageState(version, {
        connectors: [connector({ schemas: [{ path: "sql/schema.sql" }], compatibility: { schema } })],
    });
}
