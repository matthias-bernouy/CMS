import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RepositoryAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { artifactFixture, contractSnapshot } from "./fixtures";

test("artifact preparation kind, digest, source, expiry, instance and Repository are checked before writes", async () => {
    const f = await artifactFixture();
    const original = globalThis.fetch;
    try {
        const prepared = await f.artifacts.prepareArtifact("contract", contractSnapshot());
        const path = join(f.host.root, prepared.preparationId, "prepared.json");
        const saved = await readFile(path, "utf8");
        let writes = 0;
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/v1/uploads") || String(input).endsWith("/artifact-source-snapshots/put")) {
                writes++;
            }
            return original(input, init);
        }, original);
        await expect(
            f.artifacts.publishArtifact("provider-manifest", prepared.preparationId, prepared.digest),
        ).rejects.toThrow("invalid");
        await expect(f.artifacts.publishArtifact("contract", "../escape", prepared.digest)).rejects.toThrow("invalid");
        await expect(
            f.artifacts.publishArtifact("contract", prepared.preparationId, `sha256:${"0".repeat(64)}`),
        ).rejects.toThrow("invalid");
        for (const change of [
            { sourceJson: "altered" },
            { expiresAt: 0 },
            { repositoryId: "another-repository" },
            { version: "9.0.0" },
            { id: "community/other" },
        ]) {
            await writeFile(path, JSON.stringify({ ...JSON.parse(saved), ...change }));
            await expect(
                f.artifacts.publishArtifact("contract", prepared.preparationId, prepared.digest),
            ).rejects.toThrow();
        }
        await writeFile(path, saved);
        const other = new RepositoryAuthoring({ ...f.host, root: join(f.root, "another-instance") }, f.publisher);
        await expect(other.publishArtifact("contract", prepared.preparationId, prepared.digest)).rejects.toThrow(
            "invalid",
        );
        await writeFile(join(f.host.root, prepared.preparationId, "notes/docs/overview.md"), "# Changed\n");
        await expect(f.artifacts.publishArtifact("contract", prepared.preparationId, prepared.digest)).rejects.toThrow(
            "sources changed",
        );
        expect(writes).toBe(0);
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("invalid source trees and unresolved manifests leave Repository business state unchanged", async () => {
    const f = await artifactFixture();
    try {
        for (const source of [
            JSON.stringify({ files: [{ path: "../escape", content: "unsafe" }] }),
            JSON.stringify({
                files: [{ path: "definition.json", content: "{}" }],
                assets: [{ path: "fixtures/b.bin", fileId: "file", generation: "g", contractId: "mixed/value" }],
            }),
        ]) {
            await expect(f.artifacts.prepareArtifact("contract", source)).rejects.toThrow();
        }
        await expect(f.artifacts.prepareArtifact("provider-manifest", contractSnapshot())).rejects.toThrow();
        expect(await f.application.service.invoke("catalogue-list", { kind: "contract", limit: 10 })).toMatchObject({
            releases: [],
        });
        expect((await f.application.namespaces.get("community"))?.revision).toBe(1);
    } finally {
        await f.close();
    }
});
