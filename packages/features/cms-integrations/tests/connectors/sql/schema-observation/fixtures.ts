import { OBSERVED_SCHEMA_CONTRACT_V1 } from "@bernouy/cms-integrations";

export function observedSchemaFixture() {
    return {
        schema: OBSERVED_SCHEMA_CONTRACT_V1,
        owner: { connectorKey: "primary", lineageId: "orders-supabase-v1" },
        namespaces: [
            { name: "audit", relations: [] },
            {
                name: "shop",
                relations: [
                    {
                        name: "orders",
                        kind: "table",
                        columns: [
                            {
                                name: "serial_id",
                                type: "int8",
                                nullable: false,
                                default: "nextval('shop.orders_serial_id_seq'::regclass)",
                                identity: "none",
                                generated: "none",
                                sequenceDependency: "auto",
                            },
                            {
                                name: "id",
                                type: "INT8",
                                nullable: false,
                                identity: "by-default",
                                generated: "none",
                                sequenceDependency: "internal",
                            },
                            {
                                name: "account_id",
                                type: "BIGINT",
                                nullable: false,
                                identity: "none",
                                generated: "none",
                                sequenceDependency: "none",
                            },
                        ],
                        constraints: [
                            {
                                kind: "unique",
                                name: "orders_serial_id_key",
                                columns: ["serial_id"],
                                nullsNotDistinct: true,
                                deferrable: true,
                                initiallyDeferred: true,
                                validated: true,
                            },
                            {
                                kind: "primary-key",
                                name: "orders_pkey",
                                columns: ["id"],
                                deferrable: false,
                                initiallyDeferred: false,
                                validated: true,
                            },
                            {
                                kind: "foreign-key",
                                name: "orders_account_fkey",
                                columns: ["account_id"],
                                references: { namespace: "accounts", relation: "users", columns: ["id"] },
                                onUpdate: "no-action",
                                onDelete: "cascade",
                                matchType: "simple",
                                deferrable: false,
                                initiallyDeferred: false,
                                validated: true,
                            },
                            {
                                kind: "check",
                                name: "orders_id_positive",
                                expression: "(id > 0)",
                                deferrable: false,
                                initiallyDeferred: false,
                                validated: true,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
