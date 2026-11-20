import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { admitCollectionRelease } from "repository/collections/core/admission/admitCollectionRelease";
import { exampleCollection } from "../fixture";
import { CollectionAuthoring } from "repository/repository/authoring/CollectionAuthoring";
import type { CollectionPublisher } from "repository/repository/authoring/CollectionAuthoring";
import { writePreparation, sourceDigest } from "repository/repository/authoring/preparations/record";
import { exampleCaptureDocument } from "repository/collections/tooling/examples/capture";
const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-preparation-capture-"));
    roots.push(root);
    const id = randomUUID();
    const path = join(root, id);
    await mkdir(join(path, "atlas"), { recursive: true });
    await Bun.write(join(path, "atlas", "definition.json"), "{}");
    const artifact = await admitCollectionRelease(exampleCollection());
    const sourceJson = JSON.stringify({ files: [{ path: "definition.json", content: "{}" }] });
    const prepared = {
        schema: "ulvia.collection-preparation.v1" as const,
        id,
        digest: artifact.digest,
        sourceJson,
        sourceDigest: sourceDigest(sourceJson),
        directory: "atlas",
        canonicalJson: artifact.canonicalJson,
        expiresAt: Date.now() + 300_000,
        repositoryId: "proof",
        repositoryOrigin: "https://repo.test",
    };
    await writePreparation(path, prepared);
    let permitted = true;
    let checks = 0;
    const publisher = {
        credential: async () => {
            checks++;
            if (!permitted) {
                throw new Error("Namespace ownership revoked");
            }
            return {
                origin: "https://repo.test",
                repositoryId: "proof",
                namespace: "atlas.official",
                revision: 1,
                resolveToken: async () => "private",
            };
        },
    } as unknown as CollectionPublisher;
    const authoring = new CollectionAuthoring(
        { root, contracts: {} as never, readAsset: async () => new Blob() },
        publisher,
    );
    return {
        authoring,
        artifact,
        path,
        id,
        prepared,
        checks: () => checks,
        revoke: () => {
            permitted = false;
        },
    };
}
test("private preview reads exact sources and renders only the requested example without publishing", async () => {
    const { authoring, artifact, id, checks, path } = await fixture();
    const before = await Bun.file(join(path, "prepared.json")).text();
    const preview = await authoring.preview(id, artifact.digest);
    const capture = await exampleCaptureDocument(
        preview,
        [],
        { exampleId: "assembled", previewId: "desktop", locale: "fr", themeMode: "dark" },
        { kind: "prepared-example", id, revision: id, releaseDigest: artifact.digest, dependencies: [] },
    );
    expect(checks()).toBe(1);
    expect(preview.digest).toBe(artifact.digest);
    expect([capture.width, capture.height]).toEqual([640, 240]);
    expect([...capture.document.files.keys()].filter((name) => name.endsWith(".html"))).toEqual([
        "assembled--desktop.html",
    ]);
    expect(await capture.document.files.get(capture.document.path)!.text()).toContain("Bonjour");
    expect(await Bun.file(join(path, "prepared.json")).text()).toBe(before);
});
test("revoked ownership, changed sources, foreign preparations and expired records refuse", async () => {
    const value = await fixture();
    value.revoke();
    await expect(value.authoring.preview(value.id, value.artifact.digest)).rejects.toThrow("revoked");
    const changed = await fixture();
    await Bun.write(join(changed.path, "atlas", "definition.json"), "changed");
    await expect(changed.authoring.preview(changed.id, changed.artifact.digest)).rejects.toThrow("changed");
    await expect(changed.authoring.preview(randomUUID(), changed.artifact.digest)).rejects.toThrow();
    const expired = await fixture();
    await writePreparation(expired.path, { ...expired.prepared, expiresAt: Date.now() - 1 });
    await expect(expired.authoring.preview(expired.id, expired.artifact.digest)).rejects.toThrow("expired");
    expect(expired.checks()).toBe(0);
    const foreign = await fixture();
    await writePreparation(foreign.path, { ...foreign.prepared, repositoryOrigin: "https://other.test" });
    await expect(foreign.authoring.preview(foreign.id, foreign.artifact.digest)).rejects.toThrow("another Repository");
});
