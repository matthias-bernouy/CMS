import type { DeclarativeConnectorMigrationPlan } from "@bernouy/cms-integrations";

export function clockEquivalence(): NonNullable<DeclarativeConnectorMigrationPlan["equivalence"]> {
    return {
        dataProjections: [
            {
                kind: "database-clock-default",
                namespace: "migration_probe",
                relation: "items",
                columns: ["created_at"],
            },
        ],
    };
}

export function clockSchema() {
    return {
        namespaces: [
            {
                name: "migration_probe",
                relations: [
                    {
                        name: "items",
                        kind: "table",
                        columns: [
                            { name: "created_at", type: "timestamptz", nullable: false, default: "now()" },
                            { name: "description", type: "text", nullable: false },
                            { name: "id", type: "bigint", nullable: false },
                        ],
                        constraints: [{ kind: "primary-key", name: "items_pkey", columns: ["id"] }],
                    },
                ],
            },
        ],
    };
}

export function clockTableSql(description: string): string {
    return `CREATE SCHEMA IF NOT EXISTS migration_probe;
CREATE TABLE IF NOT EXISTS migration_probe.items (
    id bigint PRIMARY KEY, description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO migration_probe.items (id, description) VALUES (1, '${description}');
`;
}

export function clockProjectionInvalidTargets(): string[] {
    return [
        tableSql("id bigint PRIMARY KEY, description text NOT NULL, created_at timestamptz DEFAULT now()", true),
        tableSql("id bigint PRIMARY KEY, description text NOT NULL, created_at text NOT NULL DEFAULT 'clock'"),
        tableSql(
            "id bigint PRIMARY KEY, description text NOT NULL, " +
                "created_at timestamptz NOT NULL DEFAULT statement_timestamp()",
        ),
        tableSql("id bigint NOT NULL, description text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()"),
    ];
}

function tableSql(columns: string, insertNull = false): string {
    return `CREATE SCHEMA IF NOT EXISTS migration_probe;
CREATE TABLE IF NOT EXISTS migration_probe.items (${columns});
INSERT INTO migration_probe.items (id, description${insertNull ? ", created_at" : ""})
VALUES (1, 'fresh'${insertNull ? ", NULL" : ""});
`;
}
