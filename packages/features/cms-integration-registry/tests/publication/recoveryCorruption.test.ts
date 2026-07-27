import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { FsIntegrationRegistryRecoverer, readCompatibilityAdmissionReport } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem integration registry corruption recovery", () => {
    test("replays an interrupted legacy v1 journal through the current recovery contract", async () => {
        const fixture = registryFixture({
            createOperationId: () => "legacy-journal",
            afterBoundary: ({ phase }) => {
                if (phase === "staged") {
                    throw new Error("crash");
                }
            },
        });
        const input = await publicationPackage("legacy-demo", "1.0.0");
        await expect(fixture.publisher.publish({ package: input })).rejects.toThrow(/simulated/i);
        const journal = join(fixture.root, ".journals", "legacy-journal.json");
        const document = readJournal(journal);
        document.schema = "cms.integration.registry.publication-journal.v1";
        delete document.publication;
        chmodSync(journal, 0o640);
        writeFileSync(journal, canonicalJsonBytes(document));

        const result = await recover(fixture);

        expect(result.snapshot.locateExactVersion("legacy-demo", "1.0.0")?.package.digest).toBe(input.digest);
        expect(result.snapshot.getIndex("legacy-demo")).toMatchObject({ stable: "1.0.0", latest: "1.0.0" });
    });

    test("quarantines a journal whose explicit disposition contradicts its next index", async () => {
        const fixture = registryFixture({
            createOperationId: () => "contradictory-disposition",
            afterBoundary: ({ phase }) => {
                if (phase === "staged") {
                    throw new Error("crash");
                }
            },
        });
        await expect(fixture.publishUnverified(await publicationPackage("raw-demo", "1.0.0"))).rejects.toThrow(
            /simulated/i,
        );
        const journal = join(fixture.root, ".journals", "contradictory-disposition.json");
        const document = readJournal(journal);
        document.publication = { disposition: "installable" };
        chmodSync(journal, 0o640);
        writeFileSync(journal, canonicalJsonBytes(document));

        const result = await recover(fixture);

        expect(result.snapshot.getIndex("raw-demo")).toBeNull();
        expect(result.diagnostics).toEqual([
            expect.objectContaining({ code: "publication-quarantined", operationId: "contradictory-disposition" }),
        ]);
    });

    test("quarantines a canonical but invalid journal and its owned staging without publishing it", async () => {
        const fixture = registryFixture({
            createOperationId: () => "invalid-journal",
            afterBoundary: ({ phase }) => {
                if (phase === "staged") {
                    throw new Error("crash");
                }
            },
        });
        await expect(fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") })).rejects.toThrow(
            /simulated/i,
        );
        const journal = join(fixture.root, ".journals", "invalid-journal.json");
        chmodSync(journal, 0o640);
        writeFileSync(journal, canonicalJsonBytes({ schema: "cms.integration.registry.publication-journal.v1" }));

        const result = await recover(fixture);

        expect(result.diagnostics).toEqual([
            expect.objectContaining({ code: "publication-quarantined", operationId: "invalid-journal" }),
        ]);
        expect(result.snapshot.getIndex("demo")).toBeNull();
        expect(readdirSync(join(fixture.root, ".journals"))).toEqual([]);
        expect(readdirSync(join(fixture.root, ".staging"))).toEqual([]);
        expect(readdirSync(join(fixture.root, ".quarantine", "invalid-journal")).sort()).toEqual([
            "journal",
            "staging",
        ]);
    });

    test("repairs a corrupt immutable report from the exact journal copy", async () => {
        const fixture = registryFixture({
            createOperationId: () => "corrupt-report",
            afterBoundary: ({ phase }) => {
                if (phase === "report-written") {
                    throw new Error("crash");
                }
            },
        });
        const input = await publicationPackage("demo", "1.0.0");
        await expect(fixture.publisher.publish({ package: input })).rejects.toThrow(/simulated/i);
        const report = join(fixture.root, "demo", ".registry", "reports", "1.0.0", "admission.json");
        chmodSync(report, 0o640);
        writeFileSync(report, canonicalJsonBytes({ invalid: true }));

        const result = await recover(fixture);

        expect(result.snapshot.locateExactVersion("demo", "1.0.0")?.package.digest).toBe(input.digest);
        expect(
            await readCompatibilityAdmissionReport(report, {
                kind: "demo",
                version: "1.0.0",
                digest: input.digest,
            }),
        ).toMatchObject({ id: "report-1", admissible: true });
        expect(readdirSync(join(fixture.root, ".quarantine", "corrupt-report"))).toContain("corrupt-report");
    });

    test("preserves a divergent third-party index and excludes the incomplete publication", async () => {
        const fixture = registryFixture({
            createOperationId: () => "divergent-index",
            afterBoundary: ({ phase }) => {
                if (phase === "version-live") {
                    throw new Error("crash");
                }
            },
        });
        await expect(fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") })).rejects.toThrow(
            /simulated/i,
        );
        const index = join(fixture.root, "demo", "integration.json");
        const thirdPartyIndex = canonicalJsonBytes({
            schema: "cms.integration.index.v1",
            kind: "demo",
            label: "Third party state",
            stable: "9.0.0",
            latest: "9.0.0",
            versions: [{ version: "9.0.0", path: "versions/9.0.0", definition: "versions/9.0.0/definition.json" }],
        });
        writeFileSync(index, thirdPartyIndex);

        const result = await recover(fixture);

        expect(readFileSync(index)).toEqual(thirdPartyIndex);
        expect(result.snapshot.getIndex("demo")).toBeNull();
        expect(result.snapshot.health).toBe("degraded");
        expect(result.diagnostics).toEqual([
            expect.objectContaining({ code: "publication-quarantined", operationId: "divergent-index" }),
        ]);
    });

    test("quarantines an unreferenced version directory without disturbing the live snapshot", async () => {
        const fixture = registryFixture();
        const input = await publicationPackage("demo", "1.0.0");
        await fixture.publisher.publish({ package: input });
        mkdirSync(join(fixture.root, "demo", "versions", "9.9.9"));

        const result = await recover(fixture);

        expect(result.diagnostics).toEqual([
            expect.objectContaining({ code: "orphan-version-quarantined", kind: "demo", version: "9.9.9" }),
        ]);
        expect(result.snapshot.locateExactVersion("demo", "1.0.0")?.package.digest).toBe(input.digest);
        expect(readdirSync(join(fixture.root, "demo", "versions"))).toEqual(["1.0.0"]);
    });
});

async function recover(fixture: ReturnType<typeof registryFixture>) {
    return await new FsIntegrationRegistryRecoverer({
        root: fixture.root,
        snapshots: fixture.snapshots,
    }).recover();
}

function readJournal(path: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}
