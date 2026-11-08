import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { uploadManifestFingerprint, withUploadResume } from "repository/repository/filesystem/mutations/uploadResume";
import { manifest, uploadFixture } from "./uploadFixtures";

test("identical owned manifests resume across concurrent stores and restart, but owner/revision/content changes do not", async () => {
    const f = await uploadFixture();
    try {
        const stores = [f.open(), f.open()];
        const receipts = await Promise.all(
            Array.from({ length: 8 }, (_, index) => stores[index % 2]!.create(manifest(), f.expiry())),
        );
        expect(new Set(receipts.map(({ uploadId }) => uploadId)).size).toBe(1);
        await Promise.all(stores.map((store) => store.close()));
        const reopened = f.open();
        const receipt = await reopened.create(manifest(), f.expiry());
        expect(receipt.uploadId).toBe(receipts[0]!.uploadId);
        for (const patch of [
            { canonicalJson: '{"changed":true}' },
            { owner: { ...manifest().owner, accountId: "another-owner" } },
            { owner: { ...manifest().owner, namespaceRevision: 2 } },
            { owner: { ...manifest().owner, namespace: "another-namespace" } },
            { kind: "contract" as const },
            { assets: [{ id: "asset", byteLength: 0, digest: `sha256:${"0".repeat(64)}` as const }] },
        ]) {
            expect((await reopened.create(manifest(patch), f.expiry())).uploadId).not.toBe(receipt.uploadId);
        }
    } finally {
        await f.close();
    }
});

test("independent Bun processes share one durable resume identity", async () => {
    const f = await uploadFixture();
    try {
        const source = `
            import { FilesystemRepositoryPublicationUploadStore } from "@bernouy/repository/repository/filesystem";
            const store = new FilesystemRepositoryPublicationUploadStore(Bun.argv.at(-1));
            try {
                const receipt = await store.create(${JSON.stringify(manifest())}, new Date(Date.now() + 60000));
                console.log(receipt.uploadId);
            } finally { await store.close(); }
        `;
        const children = Array.from({ length: 4 }, () =>
            Bun.spawn([process.execPath, "--no-macros", "-e", source, f.root], {
                stdout: "pipe",
                stderr: "pipe",
            }),
        );
        const ids = await Promise.all(
            children.map(async (child) => {
                const [code, output, errors] = await Promise.all([
                    child.exited,
                    new Response(child.stdout).text(),
                    new Response(child.stderr).text(),
                ]);
                expect({ code, errors }).toEqual({ code: 0, errors: "" });
                return output.trim();
            }),
        );
        expect(new Set(ids).size).toBe(1);
        expect((await f.open().create(manifest(), f.expiry())).uploadId).toBe(ids[0]);
    } finally {
        await f.close();
    }
}, 15_000);

test("stale or corrupt derived resume pointers do not substitute another owner's manifest", async () => {
    const f = await uploadFixture();
    try {
        const store = f.open();
        const owned = await store.create(manifest(), f.expiry());
        const other = await store.create(manifest({ owner: { ...manifest().owner, accountId: "other" } }), f.expiry());
        const pointer = join(f.root, ".publication-upload-resume", uploadManifestFingerprint(manifest()), "upload-id");
        for (const value of [other.uploadId, "../escape", "x".repeat(1024)]) {
            await writeFile(pointer, value);
            const current = await store.create(manifest(), f.expiry());
            expect(current.uploadId).not.toBe(other.uploadId);
            expect(await store.describe(current.uploadId)).toEqual(manifest());
            expect((await readFile(pointer)).byteLength).toBe(36);
        }
        await store.abort(owned.uploadId);
        expect(await store.describe(other.uploadId)).toEqual(
            manifest({ owner: { ...manifest().owner, accountId: "other" } }),
        );
    } finally {
        await f.close();
    }
});

test("expired sessions are not resumed and committed receipts remain idempotent during incremental cleanup", async () => {
    const f = await uploadFixture();
    try {
        const store = f.open();
        const expired = await store.create(manifest(), new Date(Date.now() - 1));
        await expect(store.status(expired.uploadId)).rejects.toThrow();
        const current = await store.create(manifest(), f.expiry());
        expect(current.uploadId).not.toBe(expired.uploadId);
        let publications = 0;
        const publish = async () => {
            publications++;
            return { kind: "provider-manifest" as const, added: true, digest: `sha256:${"0".repeat(64)}`, release: {} };
        };
        const committed = await store.commit(current.uploadId, publish);
        const next = await store.create(manifest(), f.expiry());
        expect(next.uploadId).not.toBe(current.uploadId);
        for (let count = 0; count < 3; count++) {
            await store.recover();
        }
        expect(await store.commit(current.uploadId, publish)).toEqual(committed);
        expect(publications).toBe(1);
    } finally {
        await f.close();
    }
});

test("resume index rejects traversal and a failed candidate preparation leaves no reusable pointer", async () => {
    const f = await uploadFixture();
    try {
        const fingerprint = uploadManifestFingerprint(manifest());
        await expect(
            withUploadResume(f.root, "../escape", async () => {
                throw new Error("must not run");
            }),
        ).rejects.toThrow("fingerprint");
        await expect(
            withUploadResume(f.root, fingerprint, async () => {
                throw new Error("preparation failed");
            }),
        ).rejects.toThrow("preparation failed");
        const store = f.open();
        const receipt = await store.create(manifest(), f.expiry());
        expect((await store.create(manifest(), f.expiry())).uploadId).toBe(receipt.uploadId);
    } finally {
        await f.close();
    }
});
