import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recoverFsIntegrationRegistryCandidates } from "@bernouy/cms-integration-registry/fs";
import { candidateStoreFixture, createCandidate, queueCandidate } from "../fixtures";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("filesystem candidate recovery quarantine", () => {
    test("quarantines corrupt canonical metadata instead of accepting a partial history", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await createCandidate(fixture);
        const revision = join(
            fixture.root,
            ".registry",
            "candidates",
            "records",
            fixture.candidateId,
            "0000000000000000.json",
        );
        chmodSync(revision, 0o640);
        writeFileSync(revision, '{"schema":"corrupt"}');

        await expect(fixture.store.get(fixture.candidateId)).rejects.toThrow();
        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
        });

        expect(result.quarantinedEntries).toBe(1);
        expect(result.diagnostics[0]?.code).toBe("quarantined_candidate");
        expect(await fixture.store.get(fixture.candidateId)).toBeNull();
    });

    test("quarantines abandoned temporary writes after a grace period", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        await createCandidate(fixture);
        const candidateRoot = join(fixture.root, ".registry", "candidates");
        const temporaryFiles = [
            join(candidateRoot, "objects", "packages", ".00000000-0000-4000-8000-000000000000.tmp"),
            join(candidateRoot, "records", fixture.candidateId, ".11111111-1111-4111-8111-111111111111.tmp"),
            join(candidateRoot, "objects", "results", ".33333333-3333-4333-8333-333333333333.tmp"),
        ];
        for (const path of temporaryFiles) {
            writeFileSync(path, "partial");
            utimesSync(path, new Date("2026-07-26T09:00:00.000Z"), new Date("2026-07-26T09:00:00.000Z"));
        }

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
            temporaryGraceMs: 60_000,
        });

        expect(temporaryFiles.every((path) => !existsSync(path))).toBeTrue();
        expect(result.diagnostics.filter((entry) => entry.code === "quarantined_temporary")).toHaveLength(3);
        expect(await fixture.store.get(fixture.candidateId)).not.toBeNull();
    });

    test("quarantines a corrupt admission object and its now-unreadable candidate", async () => {
        const fixture = await candidateStoreFixture();
        cleanup = fixture.cleanup;
        const queued = await queueCandidate(fixture);
        const policy = join(
            fixture.root,
            ".registry",
            "candidates",
            "objects",
            "policies",
            `${queued.policyDigest}.json`,
        );
        chmodSync(policy, 0o640);
        writeFileSync(policy, readFileSync(policy, "utf8").replace("candidate-admission", "corrupt-admission"));

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
        });

        expect(result.diagnostics.map((entry) => entry.code)).toEqual(["quarantined_object", "quarantined_candidate"]);
        expect(await fixture.store.get(fixture.candidateId)).toBeNull();
    });

    test("does not quarantine a new candidate while its first revision is in flight", async () => {
        const fixture = await candidateStoreFixture("candidate-writing");
        cleanup = fixture.cleanup;
        await fixture.store.get("layout-ready");
        const root = join(fixture.root, ".registry", "candidates", "records", fixture.candidateId);
        mkdirSync(root, { recursive: true });
        const temporary = join(root, ".22222222-2222-4222-8222-222222222222.tmp");
        writeFileSync(temporary, "partial");

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T10:00:30.000Z",
            temporaryGraceMs: 60_000,
        });

        expect(result.quarantinedEntries).toBe(0);
        expect(existsSync(root)).toBeTrue();
        expect(existsSync(temporary)).toBeTrue();
    });
});
