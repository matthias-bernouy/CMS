import { afterEach, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    acquireFilesystemLease,
    FilesystemRepositoryPublicationUploadStore,
    recoverRepositoryStorage,
} from "@bernouy/cms-repository/repository/filesystem";

const roots: string[] = [];

afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("recovers a stale lease only when its owner process is gone", async () => {
    const root = await temporaryRoot();
    const path = join(root, ".lease");
    await staleLease(path, process.pid);
    await expect(acquireFilesystemLease(path)).rejects.toThrow("already held");

    await staleLease(path, 2_147_483_647);
    const lease = await acquireFilesystemLease(path);
    await lease.assertOwnership();
    await lease.release();
    expect(await exists(path)).toBeFalse();
});

test("a crashed upload commit lease is recoverable and expired staging is pruned", async () => {
    const root = await temporaryRoot();
    const uploads = new FilesystemRepositoryPublicationUploadStore(root);
    const receipt = await uploads.create(
        { kind: "provider-manifest", canonicalJson: "{}", assets: [] },
        new Date(Date.now() + 60_000),
    );
    await staleLease(join(root, ".publication-uploads", receipt.uploadId, ".commit-lock"), 2_147_483_647);
    const result = await uploads.commit(receipt.uploadId, async () => ({
        kind: "provider-manifest",
        added: true,
        digest: `sha256:${"0".repeat(64)}`,
        release: {},
    }));
    expect(result.added).toBeTrue();

    const expired = await uploads.create(
        { kind: "provider-manifest", canonicalJson: "{}", assets: [] },
        new Date(Date.now() - 1),
    );
    await uploads.recover();
    expect(await exists(join(root, ".publication-uploads", expired.uploadId))).toBeFalse();
});

test("expiry pruning cannot remove staging owned by an in-flight commit", async () => {
    const root = await temporaryRoot();
    const uploads = new FilesystemRepositoryPublicationUploadStore(root);
    const receipt = await uploads.create(
        { kind: "provider-manifest", canonicalJson: "{}", assets: [] },
        new Date(Date.now() + 50),
    );
    let publishStarted!: () => void;
    let finishPublish!: () => void;
    const started = new Promise<void>((resolve) => {
        publishStarted = resolve;
    });
    const finish = new Promise<void>((resolve) => {
        finishPublish = resolve;
    });
    const commit = uploads.commit(receipt.uploadId, async () => {
        publishStarted();
        await finish;
        return {
            kind: "provider-manifest",
            added: true,
            digest: `sha256:${"1".repeat(64)}` as const,
            release: {},
        };
    });
    await started;
    await Bun.sleep(60);

    await uploads.recover();
    expect(await exists(join(root, ".publication-uploads", receipt.uploadId))).toBeTrue();

    finishPublish();
    await expect(commit).resolves.toMatchObject({ added: true });
});

test("expiry pruning surfaces corrupt upload metadata instead of silently retaining it", async () => {
    const root = await temporaryRoot();
    const uploads = new FilesystemRepositoryPublicationUploadStore(root);
    const receipt = await uploads.create(
        { kind: "provider-manifest", canonicalJson: "{}", assets: [] },
        new Date(Date.now() - 1),
    );
    await writeFile(join(root, ".publication-uploads", receipt.uploadId, "upload.json"), "not-json");

    await expect(uploads.recover()).rejects.toBeInstanceOf(SyntaxError);
    expect(await exists(join(root, ".publication-uploads", receipt.uploadId))).toBeTrue();
});

test("startup recovery removes only unreferenced hash-addressed assets", async () => {
    const root = await temporaryRoot();
    const release = Buffer.from('{"kind":"collection"}');
    const referenced = createHash("sha256").update(release).digest("hex");
    const orphan = "f".repeat(64);
    const releaseDirectory = join(root, "releases", "ulvia.official", "example");
    const assets = join(root, "assets", "collections");
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(join(releaseDirectory, "1.0.0.json"), release);
    await mkdir(join(assets, referenced), { recursive: true });
    await mkdir(join(assets, orphan), { recursive: true });
    await mkdir(join(assets, "manual-files"), { recursive: true });

    await recoverRepositoryStorage(root);

    expect(await exists(join(assets, referenced))).toBeTrue();
    expect(await exists(join(assets, orphan))).toBeFalse();
    expect(await exists(join(assets, "manual-files"))).toBeTrue();
});

async function staleLease(path: string, pid: number): Promise<void> {
    await writeFile(
        path,
        JSON.stringify({
            schema: "ulvia.filesystem-lease.v1",
            owner: randomUUID(),
            pid,
            acquiredAt: new Date(0).toISOString(),
        }),
        { flag: "w", mode: 0o600 },
    );
    const stale = new Date(Date.now() - 11 * 60 * 1_000);
    await utimes(path, stale, stale);
}

async function exists(path: string): Promise<boolean> {
    return Boolean(await stat(path).catch(() => null));
}

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "repository-durability-"));
    roots.push(root);
    return root;
}
