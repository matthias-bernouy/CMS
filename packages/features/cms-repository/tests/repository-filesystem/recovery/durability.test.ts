import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemRepositoryPublicationUploadStore } from "cms-repository/repository/filesystem/mutations/uploadStore";
import { recoverRepositoryStorage } from "cms-repository/repository/filesystem/core/recovery";
import { withRepositoryWriteLock } from "cms-repository/repository/filesystem/core/lock";

const roots: string[] = [];
const stores: FilesystemRepositoryPublicationUploadStore[] = [];
function uploadsAt(root: string) {
    const store = new FilesystemRepositoryPublicationUploadStore(root);
    stores.push(store);
    return store;
}

afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.close()));
    const { rm } = await import("node:fs/promises");
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("repository write operations wait for one another instead of failing under concurrency", async () => {
    const root = await temporaryRoot();
    const order: string[] = [];
    let releaseFirst!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
        releaseFirst = resolve;
    });
    const first = withRepositoryWriteLock(root, async () => {
        order.push("first-started");
        markStarted();
        await released;
        order.push("first-finished");
    });
    await started;
    const second = withRepositoryWriteLock(root, async () => {
        order.push("second-started");
    });
    await Bun.sleep(25);
    expect(order).toEqual(["first-started"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-started", "first-finished", "second-started"]);
});

test("expiry pruning cannot remove staging owned by an in-flight commit", async () => {
    const root = await temporaryRoot();
    const uploads = uploadsAt(root);
    const receipt = await uploads.create(
        {
            kind: "provider-manifest",
            canonicalJson: "{}",
            assets: [],
            owner: { accountId: "fixture-owner", namespace: "publisher", namespaceRevision: 1 },
        },
        new Date(Date.now() + 60_000),
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
    const metadata = join(root, ".publication-uploads", receipt.uploadId, "upload.json");
    const document = await Bun.file(metadata).json();
    await writeFile(metadata, JSON.stringify({ ...document, expiresAt: new Date(Date.now() - 1).toISOString() }));

    await uploads.recover();
    expect(await exists(join(root, ".publication-uploads", receipt.uploadId))).toBeTrue();

    finishPublish();
    await expect(commit).resolves.toMatchObject({ added: true });
});

test("expiry pruning surfaces corrupt upload metadata instead of silently retaining it", async () => {
    const root = await temporaryRoot();
    const uploads = uploadsAt(root);
    const receipt = await uploads.create(
        {
            kind: "provider-manifest",
            canonicalJson: "{}",
            assets: [],
            owner: { accountId: "fixture-owner", namespace: "publisher", namespaceRevision: 1 },
        },
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
    const releaseDirectory = join(root, "releases", "ulvia", "example");
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

async function exists(path: string): Promise<boolean> {
    return Boolean(await stat(path).catch(() => null));
}

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "repository-durability-"));
    roots.push(root);
    return root;
}
