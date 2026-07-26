import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
    IntegrationCompatibilityRevisionConflictError,
    type IntegrationCompatibilityPackage,
} from "@bernouy/cms-integration-registry";
import { FsIntegrationCompatibilityReportStore } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../publication/fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem compatibility report history", () => {
    test("persists an immutable supersedes chain and reloads its current revision", async () => {
        const fixture = registryFixture();
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const store = reportStore(fixture);
        const candidate = compatibilityPackage(fixture, "demo", "1.0.0");
        const adverse = fixture.compatibility.evaluateRevision(
            {
                candidate: {
                    ...candidate,
                    schemaDeclarationEvidence: [
                        {
                            evidenceId: "schema-ci-2",
                            packageDigest: candidate.packageDigest,
                            connector: { provider: "supabase" },
                            producer: { name: "schema-verifier", version: "2.0.0" },
                            createdAt: "2026-07-26T11:00:00.000Z",
                            verdict: "contradiction",
                        },
                    ],
                },
                noBaselineReason: "new-kind",
            },
            published.report.id,
            { actor: "admin:user-1", reason: "Trusted schema reassessment", evidenceIds: ["schema-ci-2"] },
        );

        const appended = await store.appendRevision(adverse);
        const resolved = fixture.compatibility.evaluateRevision(
            { candidate, noBaselineReason: "new-kind" },
            adverse.id,
            { actor: "admin:user-1", reason: "Contradiction resolved by new evidence" },
        );
        await store.appendRevision(resolved);
        const reloaded = await reportStore(fixture).get("demo", "1.0.0");
        const firstPage = await store.list("demo", "1.0.0", { limit: 1 });
        const secondPage = await store.list("demo", "1.0.0", { after: firstPage!.nextCursor, limit: 1 });

        expect(appended.current).toMatchObject({ id: adverse.id, outcome: "invalid", admissible: false });
        expect(reloaded?.current).toMatchObject({ id: resolved.id, admissible: true });
        expect(reloaded?.admission.id).toBe(published.report.id);
        expect(reloaded?.reports.map((report) => report.id)).toEqual([published.report.id, adverse.id, resolved.id]);
        expect(firstPage).toMatchObject({
            current: { id: resolved.id },
            revisions: [{ id: adverse.id }],
            totalRevisions: 2,
            nextCursor: adverse.id,
        });
        expect(secondPage).toMatchObject({ revisions: [{ id: resolved.id }], totalRevisions: 2 });
        expect(secondPage?.nextCursor).toBeUndefined();
        expect(readdirSync(revisionsPath(fixture.root))).toHaveLength(2);
    });

    test("rejects stale, duplicate, and concurrent branches without mutating history", async () => {
        const fixture = registryFixture();
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const store = reportStore(fixture);
        const candidate = compatibilityPackage(fixture, "demo", "1.0.0");
        const first = fixture.compatibility.evaluateRevision(
            { candidate, noBaselineReason: "new-kind" },
            published.report.id,
            { actor: "admin:user-1", reason: "First reassessment" },
        );
        const competing = fixture.compatibility.evaluateRevision(
            { candidate, noBaselineReason: "new-kind" },
            published.report.id,
            { actor: "admin:user-2", reason: "Competing reassessment" },
        );

        const results = await Promise.allSettled([store.appendRevision(first), store.appendRevision(competing)]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(IntegrationCompatibilityRevisionConflictError);
        const history = await store.get("demo", "1.0.0");
        expect(history?.reports).toHaveLength(2);
        await expect(store.appendRevision(history!.current as typeof first)).rejects.toBeInstanceOf(
            IntegrationCompatibilityRevisionConflictError,
        );
        expect((await store.get("demo", "1.0.0"))?.reports).toHaveLength(2);
    });
});

function compatibilityPackage(
    fixture: ReturnType<typeof registryFixture>,
    kind: string,
    version: string,
): IntegrationCompatibilityPackage {
    const location = fixture.snapshots.current().locateExactVersion(kind, version)!;
    return { definition: location.definitionSnapshot, packageDigest: location.package.digest };
}

function revisionsPath(root: string): string {
    return join(root, "demo", ".registry", "reports", "1.0.0", "revisions");
}

function reportStore(fixture: ReturnType<typeof registryFixture>): FsIntegrationCompatibilityReportStore {
    return new FsIntegrationCompatibilityReportStore({ snapshots: fixture.snapshots, mutations: fixture.mutations });
}
