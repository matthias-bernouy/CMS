import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

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
                pointOfNoReturn: "before-contract",
            },
        });
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
});

function legacyAdoption() {
    return {
        definitionVersion: "1.0.0",
        packageDigest: "c".repeat(64),
        observedSchema: {
            schema: "cms.integration.observed-schema.v1",
            owner: { connectorKey: "primary", lineageId: "commerce-supabase-v1" },
            namespaces: [{ name: "commerce", relations: [] }],
        },
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
                    cmsMediated: { strategy: "binding-switch", drainSeconds: 30 },
                    providerDirect: { strategy: "expand-in-code", callbackIds: ["stripe-webhook"], drainSeconds: 60 },
                    pointOfNoReturn: "before-contract",
                },
            },
        ],
    };
}
