import { describe, expect, test } from "bun:test";
import { MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES, parseIntegrationDefinition } from "@bernouy/cms-integrations";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

describe("connector migration definitions", () => {
    test("parses a complete migration identity and immutable resource layout", () => {
        const parsed = parseIntegrationDefinition(migrationDefinition());

        expect(parsed.connectors?.[0]).toMatchObject({
            connectorKey: "primary",
            lineageId: "commerce-supabase-v1",
            migrationRevision: 2,
            migration: {
                supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
                equivalence: {
                    dataProjections: [
                        {
                            kind: "database-clock-default",
                            namespace: "commerce",
                            relation: "orders",
                            columns: ["created_at", "updated_at"],
                        },
                    ],
                },
                pointOfNoReturn: "before-contract",
                cmsMediated: {
                    strategy: "binding-switch",
                    smoke: { endpointId: "health", expectedStatus: 200, expectedBody: { ok: true } },
                },
            },
        });
    });

    test("parses a bounded CMS-mediated functional smoke contract", () => {
        const definition = migrationDefinition();

        expect(parseIntegrationDefinition(definition).connectors?.[0]?.migration?.cmsMediated?.smoke).toEqual({
            endpointId: "health",
            expectedStatus: 200,
            expectedBody: { ok: true },
        });

        const invalidStatus = migrationDefinition();
        invalidStatus.connectors[0].migration.cmsMediated.smoke.expectedStatus = 700;
        expect(() => parseIntegrationDefinition(invalidStatus)).toThrow(/HTTP status between 100 and 599/);

        const invalidBody = migrationDefinition();
        invalidBody.connectors[0].migration.cmsMediated.smoke.expectedBody = Number.POSITIVE_INFINITY;
        expect(() => parseIntegrationDefinition(invalidBody)).toThrow(/finite JSON value/);

        const oversizedBody = migrationDefinition();
        oversizedBody.connectors[0].migration.cmsMediated.smoke.expectedBody = "x".repeat(
            MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES,
        );
        expect(() => parseIntegrationDefinition(oversizedBody)).toThrow(/canonical bytes/);

        const unknown = migrationDefinition();
        Object.assign(unknown.connectors[0].migration.cmsMediated.smoke, { acceptsAnyResponse: true });
        expect(() => parseIntegrationDefinition(unknown)).toThrow(/acceptsAnyResponse.*not supported/);
    });

    test("rejects partial identities, unsafe layouts, and non-contiguous revisions", () => {
        const partial = migrationDefinition();
        delete partial.connectors[0].lineageId;
        expect(() => parseIntegrationDefinition(partial)).toThrow(/must be declared together/);

        const layout = migrationDefinition();
        layout.connectors[0].schemas = [{ manifest: "schema.json" }];
        expect(() => parseIntegrationDefinition(layout)).toThrow(/inside install\//);

        const chain = migrationDefinition();
        chain.connectors[0].migration.migrations[0].fromRevision = 0;
        expect(() => parseIntegrationDefinition(chain)).toThrow(/increment|chain/);
    });

    test("requires expand migrations before contract cleanup", () => {
        const definition = migrationDefinition();
        definition.connectors[0].migration.migrations = [
            {
                ...definition.connectors[0].migration.migrations[0],
                id: "cleanup",
                checksum: DIGEST_B,
                fromRevision: 0,
                toRevision: 1,
                phase: "contract",
            },
            { ...definition.connectors[0].migration.migrations[0], fromRevision: 1, toRevision: 2 },
        ];
        definition.connectors[0].migration.install.coveredMigrations = [
            { id: "cleanup", checksum: DIGEST_B, revision: 1, introducedIn: "1.1.0" },
            { id: "add-orders", checksum: DIGEST_A, revision: 2, introducedIn: "1.1.0" },
        ];
        definition.connectors[0].migration.supportedSources[0].migrationRevision = 0;

        expect(() => parseIntegrationDefinition(definition)).toThrow(/expand migrations must precede contract/);
    });

    test("allows a later source to start a new expand phase after historical cleanup", () => {
        const definition = migrationDefinition();
        definition.connectors[0].migration.migrations = [
            {
                ...definition.connectors[0].migration.migrations[0],
                id: "historical-cleanup",
                checksum: DIGEST_B,
                fromRevision: 0,
                toRevision: 1,
                introducedIn: "1.0.0",
                phase: "contract",
            },
            { ...definition.connectors[0].migration.migrations[0], fromRevision: 1, toRevision: 2 },
        ];
        definition.connectors[0].migration.install.coveredMigrations = [
            { id: "historical-cleanup", checksum: DIGEST_B, revision: 1, introducedIn: "1.0.0" },
            { id: "add-orders", checksum: DIGEST_A, revision: 2, introducedIn: "1.1.0" },
        ];

        expect(parseIntegrationDefinition(definition).connectors?.[0]?.migrationRevision).toBe(2);
    });

    test("parses an immutable legacy baseline bound to exact package provenance", () => {
        const definition = migrationDefinition();
        definition.connectors[0].migration.supportedSources[0].legacyAdoption = legacyAdoption();

        const parsed = parseIntegrationDefinition(definition);

        expect(parsed.connectors?.[0]?.migration?.supportedSources[0]?.legacyAdoption).toEqual(legacyAdoption());
    });

    test("rejects malformed package provenance and mismatched legacy schema ownership", () => {
        const malformedDigest = migrationDefinition();
        malformedDigest.connectors[0].migration.supportedSources[0].legacyAdoption = {
            ...legacyAdoption(),
            packageDigest: "SHA256:not-canonical",
        };
        expect(() => parseIntegrationDefinition(malformedDigest)).toThrow(/lowercase SHA-256 package digest/);

        const malformedInstallDigest = migrationDefinition();
        malformedInstallDigest.connectors[0].migration.supportedSources[0].legacyAdoption = {
            ...legacyAdoption(),
            installDigest: "SHA256:not-canonical",
        };
        expect(() => parseIntegrationDefinition(malformedInstallDigest)).toThrow(/lowercase sha256 checksum/);

        const wrongVersion = migrationDefinition();
        wrongVersion.connectors[0].migration.supportedSources[0].legacyAdoption = {
            ...legacyAdoption(),
            definitionVersion: "2.0.0",
        };
        expect(() => parseIntegrationDefinition(wrongVersion)).toThrow(/must satisfy its source range/);

        const wrongOwner = migrationDefinition();
        wrongOwner.connectors[0].migration.supportedSources[0].legacyAdoption = {
            ...legacyAdoption(),
            observedSchema: {
                ...legacyAdoption().observedSchema,
                owner: { connectorKey: "other", lineageId: "commerce-supabase-v1" },
            },
        };
        expect(() => parseIntegrationDefinition(wrongOwner)).toThrow(/owner connectorKey must match/);
    });

    test("requires a canonical exact legacy ledger prefix", () => {
        const mismatch = migrationDefinition();
        mismatch.connectors[0].migration.supportedSources[0].legacyAdoption = {
            ...legacyAdoption(),
            coveredMigrations: [{ id: "historical", checksum: DIGEST_B, revision: 1, introducedIn: "1.0.0" }],
        };
        expect(() => parseIntegrationDefinition(mismatch)).toThrow(/must exactly match the install prefix/);

        const nonCanonical = migrationDefinition();
        nonCanonical.connectors[0].migration.supportedSources[0].legacyAdoption = {
            ...legacyAdoption(),
            coveredMigrations: [
                { id: "second", checksum: DIGEST_B, revision: 2, introducedIn: "1.0.0" },
                { id: "first", checksum: DIGEST_A, revision: 1, introducedIn: "1.0.0" },
            ],
        };
        expect(() => parseIntegrationDefinition(nonCanonical)).toThrow(/canonical revision and id order/);
    });

    test("requires every supported source revision to reach the install baseline", () => {
        const definition = migrationDefinition();
        definition.connectors[0].migration.supportedSources.push({ range: "^0.9.0", migrationRevision: 0 });

        expect(() => parseIntegrationDefinition(definition)).toThrow(/no continuous migration chain from revision 0/);
    });

    test("rejects migrations introduced after the definition release", () => {
        const definition = migrationDefinition();
        definition.connectors[0].migration.migrations[0].introducedIn = "1.2.0";
        definition.connectors[0].migration.install.coveredMigrations[0].introducedIn = "1.2.0";

        expect(() => parseIntegrationDefinition(definition)).toThrow(/must not be newer than target release 1.1.0/);
    });

    test("validates database-clock projections against the declared schema contract", () => {
        const invalidType = migrationDefinition();
        schemaColumn(invalidType, "created_at").type = "text";
        expect(() => parseIntegrationDefinition(invalidType)).toThrow(/must use timestamp or timestamptz/);

        const invalidDefault = migrationDefinition();
        schemaColumn(invalidDefault, "created_at").default = "clock_timestamp()";
        expect(() => parseIntegrationDefinition(invalidDefault)).toThrow(/canonical now\(\) or CURRENT_TIMESTAMP/);

        const nullable = migrationDefinition();
        schemaColumn(nullable, "created_at").nullable = true;
        expect(() => parseIntegrationDefinition(nullable)).toThrow(/must be NOT NULL/);

        const primaryKeyColumn = migrationDefinition();
        primaryKeyColumn.connectors[0].migration.equivalence.dataProjections[0].columns = ["id"];
        expect(() => parseIntegrationDefinition(primaryKeyColumn)).toThrow(/must not project primary-key column/);

        const noPrimaryKey = migrationDefinition();
        noPrimaryKey.connectors[0].compatibility.schema.namespaces[0].relations[0].constraints = [];
        expect(() => parseIntegrationDefinition(noPrimaryKey)).toThrow(/exactly one non-empty primary key/);
    });

    test("rejects noncanonical, duplicate, excessive, and unknown data projections", () => {
        const nonCanonicalColumns = migrationDefinition();
        nonCanonicalColumns.connectors[0].migration.equivalence.dataProjections[0].columns = [
            "updated_at",
            "created_at",
        ];
        expect(() => parseIntegrationDefinition(nonCanonicalColumns)).toThrow(/canonical lexical order/);

        const duplicateColumns = migrationDefinition();
        duplicateColumns.connectors[0].migration.equivalence.dataProjections[0].columns = ["created_at", "created_at"];
        expect(() => parseIntegrationDefinition(duplicateColumns)).toThrow(/unique entries/);

        const duplicateProjections = migrationDefinition();
        const projection = duplicateProjections.connectors[0].migration.equivalence.dataProjections[0];
        duplicateProjections.connectors[0].migration.equivalence.dataProjections = [projection, { ...projection }];
        expect(() => parseIntegrationDefinition(duplicateProjections)).toThrow(/unique entries/);

        const empty = migrationDefinition();
        empty.connectors[0].migration.equivalence.dataProjections = [];
        expect(() => parseIntegrationDefinition(empty)).toThrow(/between 1 and 128/);

        const excessiveColumns = migrationDefinition();
        excessiveColumns.connectors[0].migration.equivalence.dataProjections[0].columns = Array.from(
            { length: 129 },
            (_, index) => `column_${index}`,
        );
        expect(() => parseIntegrationDefinition(excessiveColumns)).toThrow(/between 1 and 128/);

        const unknown = migrationDefinition();
        Object.assign(unknown.connectors[0].migration.equivalence.dataProjections[0], { ignore: true });
        expect(() => parseIntegrationDefinition(unknown)).toThrow(/ignore.*not supported/);
    });
});

function schemaColumn(definition: ReturnType<typeof migrationDefinition>, name: string) {
    return definition.connectors[0].compatibility.schema.namespaces[0].relations[0].columns.find(
        (column) => column.name === name,
    )! as { type: string; nullable: boolean; default?: string };
}

function legacyAdoption() {
    return {
        definitionVersion: "1.0.0",
        packageDigest: "c".repeat(64),
        installDigest: DIGEST_A,
        observedSchema: {
            schema: "cms.integration.observed-schema.v1",
            owner: { connectorKey: "primary", lineageId: "commerce-supabase-v1" },
            namespaces: [{ name: "commerce", relations: [] }],
        },
        coveredMigrations: [],
    };
}

function migrationDefinition() {
    return {
        kind: "commerce",
        label: "Commerce",
        version: "1.1.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                connectorKey: "primary",
                lineageId: "commerce-supabase-v1",
                migrationRevision: 2,
                root: "connectors/supabase",
                schemas: [{ manifest: "install/schema.json" }],
                functions: [{ name: "cms-commerce-v2", directory: "functions/cms-commerce-v2" }],
                compatibility: {
                    schema: {
                        namespaces: [
                            {
                                name: "commerce",
                                relations: [
                                    {
                                        name: "orders",
                                        kind: "table",
                                        columns: [
                                            { name: "id", type: "bigint", nullable: false },
                                            {
                                                name: "created_at",
                                                type: "timestamptz",
                                                nullable: false,
                                                default: "now()",
                                            },
                                            {
                                                name: "updated_at",
                                                type: "timestamp",
                                                nullable: false,
                                                default: "CURRENT_TIMESTAMP",
                                            },
                                        ],
                                        constraints: [{ kind: "primary-key", name: "orders_pkey", columns: ["id"] }],
                                    },
                                ],
                            },
                        ],
                    },
                },
                migration: {
                    install: {
                        revision: 2,
                        digest: DIGEST_B,
                        coveredMigrations: [
                            { id: "add-orders", checksum: DIGEST_A, revision: 2, introducedIn: "1.1.0" },
                        ],
                    },
                    migrations: [
                        {
                            id: "add-orders",
                            checksum: DIGEST_A,
                            fromRevision: 1,
                            toRevision: 2,
                            introducedIn: "1.1.0",
                            transaction: "atomic",
                            phase: "expand",
                            path: "migrations/0002-add-orders.sql",
                        },
                    ],
                    repeatables: [{ id: "grants", checksum: DIGEST_B, path: "repeatables/grants.sql" }],
                    supportedSources: [{ range: "^1.0.0", migrationRevision: 1 }],
                    equivalence: {
                        dataProjections: [
                            {
                                kind: "database-clock-default",
                                namespace: "commerce",
                                relation: "orders",
                                columns: ["created_at", "updated_at"],
                            },
                        ],
                    },
                    cmsMediated: {
                        strategy: "binding-switch",
                        smoke: { endpointId: "health", expectedStatus: 200, expectedBody: { ok: true } },
                        drainSeconds: 30,
                    },
                    providerDirect: { strategy: "expand-in-code", callbackIds: ["stripe-webhook"], drainSeconds: 60 },
                    pointOfNoReturn: "before-contract",
                },
            },
        ],
    };
}
