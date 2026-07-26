import { afterEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import {
    IntegrationCompatibilityAdmissionError,
    IntegrationCompatibilityEvaluator,
} from "@bernouy/cms-integration-registry";
import { FsOfficialIntegrationRegistryBootstrapPublisher } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("official filesystem registry bootstrap publication", () => {
    test("is the only publisher that admits an initial reviewed legacy SQL package", async () => {
        const fixture = registryFixture();
        const legacy = await legacySqlPackage("legacy", "1.0.0");
        await expect(fixture.publisher.publish({ package: legacy })).rejects.toThrow("compatibility.schema");
        expect(await readdir(fixture.root)).toEqual([]);

        const bootstrap = bootstrapPublisher(fixture);
        const preparation = await bootstrap.prepare([legacy]);
        expect(preparation.packageCount).toBe(1);
        expect(await readdir(fixture.root)).toEqual([]);

        const [published] = await bootstrap.publishPrepared(preparation);
        expect(published).toMatchObject({
            kind: "legacy",
            version: "1.0.0",
            digest: legacy.digest,
            report: { outcome: "not-applicable", noBaselineReason: "new-kind" },
        });
        expect(fixture.snapshots.current().summaries.map(({ kind }) => kind)).toEqual(["legacy"]);
    });

    test("keeps a future patch unknown when its legacy baseline has no reviewed schema", async () => {
        const fixture = registryFixture();
        const bootstrap = bootstrapPublisher(fixture);
        const preparation = await bootstrap.prepare([await legacySqlPackage("legacy", "1.0.0")]);
        await bootstrap.publishPrepared(preparation);

        const publication = fixture.publisher.publish({
            package: await declaredSqlPackage("legacy", "1.0.1"),
        });
        const failure = await publication.catch((error) => error);

        expect(failure).toBeInstanceOf(IntegrationCompatibilityAdmissionError);
        expect(failure).toMatchObject({
            status: 422,
            report: {
                outcome: "unknown",
                admissible: false,
                evidence: [{ code: "legacy-schema-baseline-missing", classification: "unknown" }],
            },
        });
        expect(fixture.snapshots.current().listVersions("legacy")).toHaveLength(1);
    });

    test("validates the whole one-version-per-kind plan before any filesystem write", async () => {
        const fixture = registryFixture();
        const bootstrap = bootstrapPublisher(fixture);

        await expect(
            bootstrap.prepare([await legacySqlPackage("legacy", "1.0.0"), await declaredSqlPackage("legacy", "2.0.0")]),
        ).rejects.toThrow("one initial version per kind");
        expect(await readdir(fixture.root)).toEqual([]);
    });

    test("evaluates every admission report during preflight", async () => {
        const fixture = registryFixture();
        let reports = 0;
        const compatibility = new IntegrationCompatibilityEvaluator({
            identity: { name: "bootstrap-preflight-test", version: "1.0.0" },
            now: () => "2026-07-26T10:00:00.000Z",
            createReportId: () => {
                reports += 1;
                if (reports === 2) {
                    throw new Error("preflight evaluator failure");
                }
                return `report-${reports}`;
            },
        });
        const bootstrap = new FsOfficialIntegrationRegistryBootstrapPublisher({
            root: fixture.root,
            snapshots: fixture.snapshots,
            compatibility,
            mutations: fixture.mutations,
        });

        await expect(
            bootstrap.prepare([await legacySqlPackage("first", "1.0.0"), await legacySqlPackage("second", "1.0.0")]),
        ).rejects.toThrow("preflight evaluator failure");
        expect(await readdir(fixture.root)).toEqual([]);
    });
});

function bootstrapPublisher(fixture: ReturnType<typeof registryFixture>) {
    return new FsOfficialIntegrationRegistryBootstrapPublisher({
        root: fixture.root,
        snapshots: fixture.snapshots,
        compatibility: fixture.compatibility,
        mutations: fixture.mutations,
        now: () => "2026-07-26T10:00:00.000Z",
    });
}

function legacySqlPackage(kind: string, version: string) {
    return publicationPackage(kind, version, { connectors: [connector()] });
}

function declaredSqlPackage(kind: string, version: string) {
    return publicationPackage(kind, version, {
        connectors: [connector({ compatibility: { schema: schemaContract() } })],
    });
}

function connector(overrides: Record<string, unknown> = {}) {
    return {
        provider: "supabase",
        root: "connectors/supabase",
        schemas: [{ manifest: "sql/schema.manifest.json" }],
        ...overrides,
    };
}

function schemaContract() {
    return {
        namespaces: [
            {
                name: "app",
                relations: [
                    {
                        name: "items",
                        columns: [{ name: "id", type: "bigint", nullable: false }],
                        constraints: [{ kind: "primary-key", name: "items_pkey", columns: ["id"] }],
                    },
                ],
            },
        ],
    };
}
