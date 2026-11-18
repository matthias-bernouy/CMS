import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, readFile, writeFile, symlink, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { sourceFixture } from "./fixtures";
import { captureSourceSnapshot, verifySourceSnapshot } from "./source";
import { sourceProvenance } from "../../harness/measurements/provenance";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("source capture preserves the real dirty checkout, verifies all members, reuses immutable archives and refuses a changed candidate", async () => {
    const fixture = await sourceFixture();
    try {
        const { snapshot, workspace, sourceRoot, root } = fixture;
        const identity = await sourceProvenance(workspace);
        expect(snapshot.sourceDigest).toBe(identity.sourceDigest);
        expect(snapshot.revision).toBe(identity.revision);
        expect(await verifySourceSnapshot(snapshot.path)).toEqual(snapshot);
        expect(await captureSourceSnapshot(workspace, sourceRoot, identity)).toEqual(snapshot);
        expect(await readdir(sourceRoot)).toEqual([identity.sourceDigest]);
        const manifest = JSON.parse(await readFile(join(snapshot.path, "snapshot.json"), "utf8"));
        expect(
            manifest.files.some(
                (row: { path: string }) => row.path === "tests/performance/reporting/archive/source.ts",
            ),
        ).toBe(true);
        expect(
            manifest.files.every(
                (row: { path: string }) => !row.path.startsWith("artifacts/") && !row.path.startsWith(".git/"),
            ),
        ).toBe(true);
        expect(manifest.files).toHaveLength(snapshot.files);
        expect((await stat(join(snapshot.path, "working-tree.tar.gz"))).mode & 0o777).toBe(0o600);
        const stale = { ...identity, sourceDigest: "0".repeat(64) };
        const wrong = join(root, "changed");
        await expect(captureSourceSnapshot(workspace, wrong, stale)).rejects.toThrow();
        expect(await readdir(wrong)).toEqual([]);
    } finally {
        await fixture.close();
    }
}, 30_000);

test("source integrity rejects modified individual hashes, unsafe paths, over-limit members, symlink artifacts and corrupt snapshot reuse", async () => {
    const fixture = await sourceFixture();
    try {
        const original = fixture.snapshot.path;
        const originalManifest = JSON.parse(await readFile(join(original, "snapshot.json"), "utf8"));
        const corrupt = async (name: string, change: (value: typeof originalManifest) => void) => {
            const path = join(fixture.root, name);
            await cp(original, path, { recursive: true });
            const manifest = structuredClone(originalManifest);
            change(manifest);
            const bytes = Buffer.from(JSON.stringify(manifest));
            await writeFile(join(path, "snapshot.json"), bytes);
            const seal = JSON.parse(await readFile(join(path, "complete.json"), "utf8"));
            await writeFile(join(path, "complete.json"), JSON.stringify({ ...seal, snapshotSha256: sha(bytes) }));
            await expect(verifySourceSnapshot(path)).rejects.toThrow();
        };
        await corrupt("member-hash", (value) => {
            value.files[0].sha256 = "0".repeat(64);
        });
        await corrupt("unsafe", (value) => {
            value.files[0].path = "../outside";
        });
        await corrupt("oversized", (value) => {
            value.files[0].bytes = 32 * 1024 ** 2 + 1;
        });
        const linked = join(fixture.root, "linked");
        await cp(original, linked, { recursive: true });
        await rm(join(linked, "tracked.patch"));
        await symlink(join(original, "tracked.patch"), join(linked, "tracked.patch"));
        await expect(verifySourceSnapshot(linked)).rejects.toThrow();
        const before = await readFile(join(original, "working-tree.tar.gz"));
        await writeFile(join(original, "tracked.patch"), "tampered");
        await expect(captureSourceSnapshot(fixture.workspace, fixture.sourceRoot)).rejects.toThrow();
        expect(await readFile(join(original, "tracked.patch"), "utf8")).toBe("tampered");
        expect(await readFile(join(original, "working-tree.tar.gz"))).toEqual(before);
    } finally {
        await fixture.close();
    }
}, 30_000);
