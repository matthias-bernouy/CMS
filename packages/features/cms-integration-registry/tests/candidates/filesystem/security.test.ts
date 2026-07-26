import { afterEach, describe, expect, test } from "bun:test";
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recoverFsIntegrationRegistryCandidates } from "@bernouy/cms-integration-registry/fs";
import { candidateStoreFixture, createCandidate } from "./fixtures";

const cleanups: (() => void)[] = [];
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
        cleanup();
    }
});

describe("filesystem integration registry candidate storage safety", () => {
    test("rejects a symlinked revision and quarantines only the link owner", async () => {
        const fixture = await candidateStoreFixture();
        cleanups.push(fixture.cleanup);
        await createCandidate(fixture);
        const outside = mkdtempSync(join(tmpdir(), "cms-candidate-outside-"));
        cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
        const target = join(outside, "record.json");
        writeFileSync(target, "outside");
        const revision = join(
            fixture.root,
            ".registry",
            "candidates",
            "records",
            fixture.candidateId,
            "0000000000000000.json",
        );
        unlinkSync(revision);
        symlinkSync(target, revision);

        await expect(fixture.store.get(fixture.candidateId)).rejects.toThrow();
        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
        });

        expect(result.diagnostics.some((entry) => entry.code === "quarantined_candidate")).toBeTrue();
        expect(readFileSync(target, "utf8")).toBe("outside");
    });

    test("quarantines symlinked object and candidate inventory entries without following them", async () => {
        const fixture = await candidateStoreFixture();
        cleanups.push(fixture.cleanup);
        await createCandidate(fixture);
        const outside = mkdtempSync(join(tmpdir(), "cms-candidate-links-"));
        cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
        const marker = join(outside, "marker.json");
        writeFileSync(marker, "outside");
        const objects = join(fixture.root, ".registry", "candidates", "objects", "packages");
        const records = join(fixture.root, ".registry", "candidates", "records");
        const fakeObject = join(objects, `${"a".repeat(64)}.json`);
        const fakeCandidate = join(records, "linked-candidate");
        mkdirSync(join(outside, "records"));
        symlinkSync(marker, fakeObject);
        symlinkSync(join(outside, "records"), fakeCandidate);

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
        });

        expect(existsSync(fakeObject)).toBeFalse();
        expect(existsSync(fakeCandidate)).toBeFalse();
        expect(readFileSync(marker, "utf8")).toBe("outside");
        expect(result.quarantinedEntries).toBe(2);
        expect(await fixture.store.get(fixture.candidateId)).not.toBeNull();
    });

    test("does not trust an existing object until its canonical digest is reverified", async () => {
        const fixture = await candidateStoreFixture();
        cleanups.push(fixture.cleanup);
        const uploaded = await createCandidate(fixture);
        const object = join(
            fixture.root,
            ".registry",
            "candidates",
            "objects",
            "packages",
            `${uploaded.packageDigest}.json`,
        );
        chmodSync(object, 0o640);
        writeFileSync(object, "{}");

        await expect(
            fixture.store.create({
                candidateId: "candidate-2",
                candidate: fixture.candidate,
                createdAt: "2026-07-26T10:00:00.000Z",
                expiresAt: "2026-07-27T10:00:00.000Z",
            }),
        ).rejects.toThrow();
        expect(existsSync(join(fixture.root, ".registry", "candidates", "records", "candidate-2"))).toBeFalse();

        const result = await recoverFsIntegrationRegistryCandidates({
            root: fixture.root,
            now: "2026-07-26T11:00:00.000Z",
        });
        expect(result.diagnostics.map((entry) => entry.code)).toEqual(["quarantined_object", "quarantined_candidate"]);
        expect(await fixture.store.get(fixture.candidateId)).toBeNull();
    });
});
