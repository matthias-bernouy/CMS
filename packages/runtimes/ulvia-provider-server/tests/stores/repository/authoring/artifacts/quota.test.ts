import { expect, test } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { sourceSnapshot } from "../fixture";
import { artifactFixture, contractSnapshot, providerSnapshot } from "./fixtures";

async function directories(root: string) {
    return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
}

async function seed(root: string) {
    await mkdir(root, { recursive: true });
    await Promise.all(Array.from({ length: 63 }, () => mkdir(join(root, crypto.randomUUID()))));
}

test("collections, contracts and Provider manifests share one atomic preparation quota", async () => {
    const f = await artifactFixture();
    try {
        const published = await f.artifacts.prepareArtifact("contract", contractSnapshot());
        await f.artifacts.publishArtifact("contract", published.preparationId, published.digest);
        await f.artifacts.discard(published.preparationId);
        await seed(f.host.root);
        const results = await Promise.allSettled([
            f.authoring.prepare(sourceSnapshot()),
            f.artifacts.prepareArtifact("contract", contractSnapshot("1.0.1")),
            f.artifacts.prepareArtifact("provider-manifest", providerSnapshot(published.digest)),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const refused = results.filter((result) => result.status === "rejected");
        expect(refused).toHaveLength(2);
        expect(refused.every((result) => result.reason.message.includes("limit reached"))).toBeTrue();
        expect(await directories(f.host.root)).toHaveLength(64);
        expect(await f.application.service.reads.catalogue({ kind: "contract", limit: 10 })).toMatchObject({
            releases: [{ digest: published.digest }],
        });
        expect((await f.application.namespaces.get("community"))?.revision).toBe(1);
    } finally {
        await f.close();
    }
});

test("a failed compilation releases its slot and an explicit discard restores capacity", async () => {
    const f = await artifactFixture();
    try {
        await seed(f.host.root);
        const invalid = JSON.parse(contractSnapshot());
        invalid.files.find((file: { path: string }) => file.path.startsWith("capabilities/")).content = "{}";
        await expect(f.artifacts.prepareArtifact("contract", JSON.stringify(invalid))).rejects.toThrow();
        expect(await directories(f.host.root)).toHaveLength(63);
        const prepared = await f.artifacts.prepareArtifact("contract", contractSnapshot());
        expect(await directories(f.host.root)).toHaveLength(64);
        await f.artifacts.discard(prepared.preparationId);
        expect(await directories(f.host.root)).toHaveLength(63);
        await f.authoring.prepare(sourceSnapshot());
        expect(await directories(f.host.root)).toHaveLength(64);
    } finally {
        await f.close();
    }
});
