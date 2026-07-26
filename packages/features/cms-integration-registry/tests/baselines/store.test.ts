import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    ReviewedSchemaBaselineConflictError,
    ReviewedSchemaBaselineIntegrityError,
    type ReviewedSchemaBaselineLogicalKey,
} from "@bernouy/cms-integration-registry";
import {
    FsReviewedSchemaBaselineStore,
    loadReviewedConnectorSchemaBaselines,
} from "@bernouy/cms-integration-registry/fs";
import { PACKAGE_DIGEST, reviewedBaseline } from "./fixtures";

const roots: string[] = [];
const logicalKey: ReviewedSchemaBaselineLogicalKey = {
    kind: "example",
    version: "1.0.0",
    packageDigest: PACKAGE_DIGEST,
    connectorKey: "primary",
    lineageId: "example-supabase-v1",
};

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("filesystem reviewed schema baseline store", () => {
    test("persists an immutable root and reloads it after restart", async () => {
        const root = await registryRoot();
        const first = new FsReviewedSchemaBaselineStore({ root });
        const baseline = await reviewedBaseline();

        const appended = await first.append({ baseline, expectedCurrentRevisionId: null });
        const restarted = new FsReviewedSchemaBaselineStore({ root });

        expect(appended.currentRevisionId).toBe("baseline-root");
        expect(appended.currentBaselineDigest).toMatch(/^[a-f0-9]{64}$/u);
        expect(await restarted.get(logicalKey)).toEqual(appended);
        expect(await restarted.listForPackage("example", "1.0.0", PACKAGE_DIGEST)).toEqual([appended]);
        expect(await restarted.listForPackage("other", "1.0.0", PACKAGE_DIGEST)).toEqual([]);
        await expect(restarted.listForPackage("../escape", "1.0.0", PACKAGE_DIGEST)).rejects.toThrow(/kind/i);
        await expect(restarted.listForPackage("example", "1.0.0", "invalid")).rejects.toThrow(/digest/i);
    });

    test("projects the current digest-bound observation into legacy compatibility input", async () => {
        const store = new FsReviewedSchemaBaselineStore({ root: await registryRoot() });
        const root = await reviewedBaseline();
        const first = await store.append({ baseline: root, expectedCurrentRevisionId: null });
        const revision = await reviewedBaseline("baseline-reviewed", { supersedes: root.reportId });
        const current = await store.append({ baseline: revision, expectedCurrentRevisionId: root.reportId });

        const projected = await loadReviewedConnectorSchemaBaselines(
            store,
            logicalKey.kind,
            logicalKey.version,
            logicalKey.packageDigest,
        );

        expect(projected).toEqual([
            {
                connector: revision.legacySelector,
                packageDigest: PACKAGE_DIGEST,
                schema: { namespaces: revision.observedSchema.namespaces },
                provenance: {
                    evidenceId: `reviewed-schema-baseline-${current.currentBaselineDigest}`,
                    source: "legacy-backfill:legacy-schema-baseline@1.0.0",
                    reviewedAt: revision.createdAt,
                },
            },
        ]);
        expect(projected[0]?.provenance.evidenceId).not.toContain(first.currentBaselineDigest);
        expect(Object.isFrozen(projected)).toBeTrue();
    });

    test("appends by current-revision CAS and keeps exact reimports idempotent", async () => {
        const store = new FsReviewedSchemaBaselineStore({ root: await registryRoot() });
        const root = await reviewedBaseline();
        await store.append({ baseline: root, expectedCurrentRevisionId: null });
        const revision = await reviewedBaseline("baseline-revision", { supersedes: root.reportId });

        const appended = await store.append({ baseline: revision, expectedCurrentRevisionId: root.reportId });
        const repeated = await store.append({ baseline: revision, expectedCurrentRevisionId: root.reportId });

        expect(appended.current).toEqual(revision);
        expect(appended.revisions.map(({ reportId }) => reportId)).toEqual([root.reportId, revision.reportId]);
        expect(repeated).toEqual(appended);
        await expect(
            store.append({
                baseline: await reviewedBaseline("stale", { supersedes: root.reportId }),
                expectedCurrentRevisionId: root.reportId,
            }),
        ).rejects.toBeInstanceOf(ReviewedSchemaBaselineConflictError);
        await expect(
            store.append({
                baseline: {
                    ...(await reviewedBaseline("changed-origin", { supersedes: revision.reportId })),
                    origin: "admission",
                },
                expectedCurrentRevisionId: revision.reportId,
            }),
        ).rejects.toThrow(/revision history is invalid/);
    });

    test("allows exactly one concurrent successor to win the filesystem CAS", async () => {
        const store = new FsReviewedSchemaBaselineStore({ root: await registryRoot() });
        const root = await reviewedBaseline();
        await store.append({ baseline: root, expectedCurrentRevisionId: null });
        const left = await reviewedBaseline("revision-left", { supersedes: root.reportId, reason: "left" });
        const right = await reviewedBaseline("revision-right", { supersedes: root.reportId, reason: "right" });

        const results = await Promise.allSettled([
            store.append({ baseline: left, expectedCurrentRevisionId: root.reportId }),
            store.append({ baseline: right, expectedCurrentRevisionId: root.reportId }),
        ]);
        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ReviewedSchemaBaselineConflictError);
        expect((await store.get(logicalKey))?.revisions).toHaveLength(2);
    });

    test("ignores an in-flight canonical writer temporary without accepting other entries", async () => {
        const root = await registryRoot();
        const store = new FsReviewedSchemaBaselineStore({ root });
        const baseline = await reviewedBaseline();
        const appended = await store.append({ baseline, expectedCurrentRevisionId: null });
        const revisions = join(await onlyHistoryRoot(root), "revisions");
        const temporary = join(revisions, `.${randomUUID()}.tmp`);
        await writeFile(temporary, canonicalJsonBytes({ incomplete: true }));

        expect(await store.get(logicalKey)).toEqual(appended);
        await writeFile(join(revisions, ".not-a-writer.tmp"), "untrusted");
        await expect(store.get(logicalKey)).rejects.toBeInstanceOf(ReviewedSchemaBaselineIntegrityError);
    });

    test("rejects report-id substitution, corrupt digests, and symlink revisions", async () => {
        const root = await registryRoot();
        const store = new FsReviewedSchemaBaselineStore({ root });
        const baseline = await reviewedBaseline();
        await store.append({ baseline, expectedCurrentRevisionId: null });
        await expect(
            store.append({
                baseline: await reviewedBaseline(baseline.reportId, { reason: "substituted" }),
                expectedCurrentRevisionId: null,
            }),
        ).rejects.toBeInstanceOf(ReviewedSchemaBaselineConflictError);

        const historyRoot = await onlyHistoryRoot(root);
        const revisionPath = join(historyRoot, "revisions", "0000000001.json");
        const document = JSON.parse(await readFile(revisionPath, "utf8"));
        await chmod(revisionPath, 0o640);
        await writeFile(revisionPath, canonicalJsonBytes({ ...document, baselineDigest: "f".repeat(64) }));
        await expect(store.get(logicalKey)).rejects.toThrow(/digest does not match/);

        await rm(revisionPath);
        await symlink(join(historyRoot, "identity.json"), revisionPath);
        await expect(store.get(logicalKey)).rejects.toBeInstanceOf(ReviewedSchemaBaselineIntegrityError);
    });
});

async function registryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-registry-baselines-"));
    roots.push(root);
    return root;
}

async function onlyHistoryRoot(root: string): Promise<string> {
    const baselines = join(root, ".registry", "schema-baselines");
    const entries = Array.from(new Bun.Glob("*").scanSync({ cwd: baselines, onlyFiles: false }));
    expect(entries).toHaveLength(1);
    const history = join(baselines, entries[0]!);
    await mkdir(history, { recursive: true });
    return history;
}
