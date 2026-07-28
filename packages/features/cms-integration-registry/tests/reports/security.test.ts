import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    recoverFsReleaseReportHistories,
    RELEASE_REPORT_HISTORY_DIRECTORY,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures } from "../publication/fixtures";
import { publishedReleaseFixture, releaseStores, verificationReport } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem release report integrity and recovery", () => {
    test("quarantines a corrupt canonical revision and remains fail-closed after restart", async () => {
        const { fixture, target, stores } = await publishedReleaseFixture();
        await stores.verificationReports.append({ report: verificationReport(target.digest), expectedCurrent: null });
        const history = onlyHistory(fixture.root, "verification");
        const revision = join(history, "revisions", "0000000001.json");
        chmodSync(revision, 0o640);
        writeFileSync(revision, "{}", { mode: 0o640 });

        await expect(stores.verificationReports.get("demo", "1.1.0")).rejects.toThrow(/canonical|revision/);
        const recovered = await recoverFsReleaseReportHistories(fixture.root);

        expect(recovered.diagnostics).toHaveLength(1);
        expect(recovered.diagnostics[0]).toMatchObject({
            stream: "verification",
            code: "invalid-history-quarantined",
        });
        expect(existsSync(recovered.diagnostics[0]!.quarantinePath)).toBeTrue();
        expect(await releaseStores(fixture).verificationReports.get("demo", "1.1.0")).toBeNull();
    });

    test("rejects a symlinked report-store ancestor", async () => {
        const { fixture, target, stores } = await publishedReleaseFixture();
        await stores.verificationReports.append({ report: verificationReport(target.digest), expectedCurrent: null });
        const metadata = join(fixture.root, ".registry");
        const reports = join(metadata, RELEASE_REPORT_HISTORY_DIRECTORY);
        const moved = join(metadata, `${RELEASE_REPORT_HISTORY_DIRECTORY}-real`);
        renameSync(reports, moved);
        symlinkSync(moved, reports);

        await expect(stores.verificationReports.get("demo", "1.1.0")).rejects.toThrow(/symlink/);
        await expect(recoverFsReleaseReportHistories(fixture.root)).rejects.toThrow(/symlink/);
    });

    test("quarantines a history whose revisions directory is replaced by a symlink", async () => {
        const { fixture, target, stores } = await publishedReleaseFixture();
        await stores.verificationReports.append({ report: verificationReport(target.digest), expectedCurrent: null });
        const history = onlyHistory(fixture.root, "verification");
        const revisions = join(history, "revisions");
        const moved = join(history, "revisions-real");
        renameSync(revisions, moved);
        symlinkSync(moved, revisions);

        await expect(stores.verificationReports.get("demo", "1.1.0")).rejects.toThrow(/symlink/);
        const recovered = await recoverFsReleaseReportHistories(fixture.root);

        expect(recovered.diagnostics).toHaveLength(1);
        expect(recovered.diagnostics[0]?.stream).toBe("verification");
    });

    test("quarantines a history-root symlink before following its identity", async () => {
        const { fixture, target, stores } = await publishedReleaseFixture();
        await stores.verificationReports.append({ report: verificationReport(target.digest), expectedCurrent: null });
        const history = onlyHistory(fixture.root, "verification");
        const moved = join(fixture.root, "external-report-history");
        renameSync(history, moved);
        chmodSync(join(moved, "identity.json"), 0o640);
        writeFileSync(join(moved, "identity.json"), "{}", { mode: 0o640 });
        symlinkSync(moved, history);

        const recovered = await recoverFsReleaseReportHistories(fixture.root);

        expect(recovered.diagnostics).toHaveLength(1);
        expect(recovered.diagnostics[0]?.message).toContain("symlink");
        expect(existsSync(moved)).toBeTrue();
    });

    test("quarantines a moved logical history whose directory digest no longer matches", async () => {
        const { fixture, target, stores } = await publishedReleaseFixture();
        await stores.verificationReports.append({ report: verificationReport(target.digest), expectedCurrent: null });
        const stream = streamRoot(fixture.root, "verification");
        const originalName = readdirSync(stream)[0]!;
        const substitutedName = originalName === "f".repeat(64) ? "e".repeat(64) : "f".repeat(64);
        renameSync(join(stream, originalName), join(stream, substitutedName));

        const recovered = await recoverFsReleaseReportHistories(fixture.root);

        expect(recovered.diagnostics).toHaveLength(1);
        expect(recovered.diagnostics[0]?.message).toContain("canonical logical-key digest");
        expect(await releaseStores(fixture).verificationReports.get("demo", "1.1.0")).toBeNull();
    });

    test("removes bounded crash temporaries without changing the immutable history", async () => {
        const { fixture, target, stores } = await publishedReleaseFixture();
        await stores.verificationReports.append({ report: verificationReport(target.digest), expectedCurrent: null });
        const history = onlyHistory(fixture.root, "verification");
        const rootTemporary = join(history, ".00000000-0000-4000-8000-000000000000.tmp");
        const revisionTemporary = join(history, "revisions", ".00000000-0000-4000-8000-000000000001.tmp");
        writeFileSync(rootTemporary, "partial", { mode: 0o640 });
        writeFileSync(revisionTemporary, "partial", { mode: 0o640 });

        const recovered = await recoverFsReleaseReportHistories(fixture.root);

        expect(recovered.diagnostics).toEqual([]);
        expect(existsSync(rootTemporary)).toBeFalse();
        expect(existsSync(revisionTemporary)).toBeFalse();
        expect((await stores.verificationReports.get("demo", "1.1.0"))?.current.reportId).toBe("verification-1");
    });

    test("quarantines a history whose crash-temporary inventory exceeds its hard bound", async () => {
        const { fixture, target, stores } = await publishedReleaseFixture();
        await stores.verificationReports.append({ report: verificationReport(target.digest), expectedCurrent: null });
        const history = onlyHistory(fixture.root, "verification");
        const revisions = join(history, "revisions");
        for (let index = 0; index < 33; index += 1) {
            const suffix = index.toString(16).padStart(12, "0");
            writeFileSync(join(history, `.00000000-0000-4000-8000-${suffix}.tmp`), "partial", { mode: 0o640 });
        }
        for (let index = 33; index < 65; index += 1) {
            const suffix = index.toString(16).padStart(12, "0");
            writeFileSync(join(revisions, `.00000000-0000-4000-8000-${suffix}.tmp`), "partial", { mode: 0o640 });
        }

        const recovered = await recoverFsReleaseReportHistories(fixture.root);

        expect(recovered.diagnostics).toHaveLength(1);
        expect(recovered.diagnostics[0]?.message).toContain("exceeds 64 temporary files");
        expect(await releaseStores(fixture).verificationReports.get("demo", "1.1.0")).toBeNull();
    });
});

function streamRoot(root: string, stream: string): string {
    return join(root, ".registry", RELEASE_REPORT_HISTORY_DIRECTORY, stream);
}

function onlyHistory(root: string, stream: string): string {
    const parent = streamRoot(root, stream);
    const entries = readdirSync(parent);
    if (entries.length !== 1) {
        throw new Error(`Expected one ${stream} report history`);
    }
    return join(parent, entries[0]!);
}
