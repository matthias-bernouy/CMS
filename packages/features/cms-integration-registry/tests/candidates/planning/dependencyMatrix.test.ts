import { afterEach, describe, expect, test } from "bun:test";
import { createIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry";
import { FsIntegrationRegistryCandidateAdmissionPlanner } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../../publication/fixtures";
import { planningPolicy, validatingCandidate, verificationCandidate } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("candidate dependency admission matrix", () => {
    test("pins distinct minimum and stable transitive graphs to their exact package digests", async () => {
        const fixture = registryFixture();
        const sharedMinimum = await publicationPackage("shared", "1.0.0");
        const sharedStable = await publicationPackage("shared", "1.1.0");
        await fixture.publisher.publish({ package: sharedMinimum });
        await fixture.publisher.publish({ package: sharedStable });
        const dependencyDefinition = {
            dependencies: [{ name: "shared", kind: "shared", versionRange: "^1.0.0" }],
        };
        const dependencyMinimum = await publicationPackage("dependency", "1.0.0", dependencyDefinition);
        const dependencyStable = await publicationPackage("dependency", "1.1.0", dependencyDefinition);
        await fixture.publisher.publish({ package: dependencyMinimum });
        await fixture.publisher.publish({ package: dependencyStable });
        setStableVersions(fixture, { dependency: "1.1.0", shared: "1.1.0" });
        const target = await publicationPackage("consumer", "1.0.0", {
            dependencies: [{ name: "dependency", kind: "dependency", versionRange: "^1.0.0" }],
        });
        const candidate = await verificationCandidate(target);
        const store = await validatingCandidate(fixture.root, "candidate-dependency-matrix", candidate);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
        });

        const plan = await planner.plan({ candidateId: "candidate-dependency-matrix", candidate });

        expect(plan.admission.dependencies).toEqual([
            {
                selection: "minimum",
                kind: "dependency",
                version: "1.0.0",
                packageDigest: dependencyMinimum.digest,
            },
            {
                selection: "minimum",
                kind: "shared",
                version: "1.0.0",
                packageDigest: sharedMinimum.digest,
            },
            {
                selection: "stable",
                kind: "dependency",
                version: "1.1.0",
                packageDigest: dependencyStable.digest,
            },
            {
                selection: "stable",
                kind: "shared",
                version: "1.1.0",
                packageDigest: sharedStable.digest,
            },
        ]);
    });

    test("fails closed when the stable dependency is outside the declared range", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("dependency", "1.0.0") });
        await fixture.publisher.publish({ package: await publicationPackage("dependency", "2.0.0") });
        setStableVersions(fixture, { dependency: "2.0.0" });
        const target = await publicationPackage("consumer", "1.0.0", {
            dependencies: [{ name: "dependency", kind: "dependency", versionRange: "^1.0.0" }],
        });
        const candidate = await verificationCandidate(target);
        const store = await validatingCandidate(fixture.root, "candidate-stable-outside-range", candidate);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await planningPolicy(),
        });

        await expect(planner.plan({ candidateId: "candidate-stable-outside-range", candidate })).rejects.toMatchObject({
            code: "dependency_unavailable",
        });
        expect((await store.get("candidate-stable-outside-range"))?.status).toBe("validating");
    });
});

function setStableVersions(
    fixture: ReturnType<typeof registryFixture>,
    stableVersions: Readonly<Record<string, string>>,
): void {
    const snapshot = fixture.snapshots.current();
    const entries = snapshot.summaries.map((summary) => {
        const index = snapshot.getIndex(summary.kind);
        if (!index) {
            throw new Error(`Missing test catalog index ${summary.kind}`);
        }
        const versions = index.versions.map((entry) => {
            const location = snapshot.locateExactVersion(index.kind, entry.version);
            if (!location) {
                throw new Error(`Missing test catalog location ${index.kind}@${entry.version}`);
            }
            return location;
        });
        return {
            source: summary.kind,
            index: stableVersions[summary.kind] ? { ...index, stable: stableVersions[summary.kind] } : index,
            versions,
        };
    });
    fixture.snapshots.swap(createIntegrationRegistryCatalogSnapshot({ entries }));
}
