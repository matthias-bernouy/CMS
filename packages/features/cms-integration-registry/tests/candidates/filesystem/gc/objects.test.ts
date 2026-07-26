import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, utimesSync, writeFileSync } from "node:fs";
import { identifyReleaseAdmissionPolicySnapshot } from "@bernouy/cms-integration-verification";
import { garbageCollectFsIntegrationRegistryCandidateObjects } from "@bernouy/cms-integration-registry/fs";
import { candidatePolicy, candidateStoreFixture, createCandidate } from "../fixtures";
import { objectEntries, objectPath, rewriteInitialRecordAsLegacyV1 } from "./helpers";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem candidate object garbage collection", () => {
    test("serializes concurrent same-ID creation without leaking duplicate payload objects", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const attempts = await Promise.allSettled([createCandidate(fixture), createCandidate(fixture)]);

        expect(attempts.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
        expect(attempts.filter((entry) => entry.status === "rejected")).toHaveLength(1);
        expect(objectEntries(fixture.root, "packages")).toHaveLength(1);
        expect(objectEntries(fixture.root, "verifications")).toHaveLength(1);
    });

    test("collects old unreferenced objects and retains references from a legacy v1 record", async () => {
        const fixture = await candidateStoreFixture("legacy-candidate");
        cleanup = fixture.cleanup;
        await createCandidate(fixture);
        rewriteInitialRecordAsLegacyV1(fixture.root, fixture.candidateId);
        const orphan = await identifyReleaseAdmissionPolicySnapshot({
            ...(await candidatePolicy()),
            identity: { name: "orphan-policy", version: "1.0.0" },
        });
        const orphanPath = objectPath(fixture.root, "policies", orphan.digest);
        writeFileSync(orphanPath, orphan.canonicalBytes, { mode: 0o440 });
        utimesSync(orphanPath, new Date("2026-07-26T08:00:00.000Z"), new Date("2026-07-26T08:00:00.000Z"));

        const result = await garbageCollectFsIntegrationRegistryCandidateObjects({
            root: fixture.root,
            now: "2026-07-26T12:00:00.000Z",
            gracePeriodMs: 60 * 60 * 1_000,
        });

        expect(result).toEqual({
            removedObjects: 1,
            retainedReferencedObjects: 2,
            retainedWithinGraceObjects: 0,
            prunedCandidateIds: [],
            removedAuditRecords: 0,
        });
        expect(existsSync(orphanPath)).toBeFalse();
        expect(objectEntries(fixture.root, "packages")).toHaveLength(1);
        expect(objectEntries(fixture.root, "verifications")).toHaveLength(1);
        await expect(fixture.store.get(fixture.candidateId)).rejects.toMatchObject({ code: "legacy_candidate" });
    });

    test("retains a young orphan until the configured grace period elapses", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await fixture.store.get("layout-only");
        const orphan = await identifyReleaseAdmissionPolicySnapshot({
            ...(await candidatePolicy()),
            identity: { name: "young-orphan", version: "1.0.0" },
        });
        const orphanPath = objectPath(fixture.root, "policies", orphan.digest);
        writeFileSync(orphanPath, orphan.canonicalBytes, { mode: 0o440 });
        utimesSync(orphanPath, new Date("2026-07-26T11:30:00.000Z"), new Date("2026-07-26T11:30:00.000Z"));

        const result = await garbageCollectFsIntegrationRegistryCandidateObjects({
            root: fixture.root,
            now: "2026-07-26T12:00:00.000Z",
            gracePeriodMs: 60 * 60 * 1_000,
        });

        expect(result).toEqual({
            removedObjects: 0,
            retainedReferencedObjects: 0,
            retainedWithinGraceObjects: 1,
            prunedCandidateIds: [],
            removedAuditRecords: 0,
        });
        expect(existsSync(orphanPath)).toBeTrue();
    });
});
