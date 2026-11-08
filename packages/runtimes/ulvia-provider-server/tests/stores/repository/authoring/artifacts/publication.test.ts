import { expect, test } from "bun:test";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { artifactFixture, contractSnapshot, providerSnapshot, contractId } from "./fixtures";

test("contract docs and Provider manifests publish with retained sources without installing dependencies", async () => {
    const f = await artifactFixture();
    try {
        const contract = await f.artifacts.prepareArtifact("contract", contractSnapshot());
        expect(await f.artifacts.artifactSources("contract", "community", contractId, "1.0.0")).toBeNull();
        expect(await f.application.service.reads.catalogue({ kind: "contract", limit: 10 })).toMatchObject({
            releases: [],
        });
        expect(await f.artifacts.publishArtifact("contract", contract.preparationId, contract.digest)).toMatchObject({
            kind: "contract" as const,
            added: true,
            contractId,
        });
        const saved = await f.artifacts.artifactSources("contract", "community", contractId, "1.0.0");
        expect(saved?.releaseDigest).toBe(contract.digest);
        expect(JSON.parse(saved!.sourceJson).files).toContainEqual({
            path: "docs/overview.md",
            content: "# Notes\n\nRead notes from the provider.\n",
        });
        const remote = new RemoteRepositoryClient(f.base);
        const pulled = await remote.pull({
            kind: "contract" as const,
            publisherId: "community",
            id: contractId,
            version: "1.0.0",
        });
        expect(pulled.expectedDigest).toBe(contract.digest);
        expect(await new Response(pulled.assets.find((a) => a.id === "docs/overview.md")!.bytes).text()).toContain(
            "# Notes",
        );
        expect(await f.contracts.get(contractId, "1.0.0")).toBeNull();
        const manifestSource = JSON.parse(providerSnapshot(contract.digest));
        const manifestDefinition = JSON.parse(manifestSource.files[0].content);
        manifestDefinition.providerId = contractId;
        manifestSource.files[0].content = JSON.stringify(manifestDefinition);
        const manifest = await f.artifacts.prepareArtifact("provider-manifest", JSON.stringify(manifestSource));
        expect(
            await f.artifacts.publishArtifact("provider-manifest", manifest.preparationId, manifest.digest),
        ).toMatchObject({ kind: "provider-manifest", added: true, providerId: contractId });
        expect(
            (await f.artifacts.artifactSources("provider-manifest", "community", contractId, "1.0.0"))?.releaseDigest,
        ).toBe(manifest.digest);
        expect(await f.contracts.get(contractId, "1.0.0")).toBeNull();
        expect(await f.artifacts.publishArtifact("contract", contract.preparationId, contract.digest)).toMatchObject({
            added: false,
        });
    } finally {
        await f.close();
    }
});

test("private artifact sources reject other accounts and namespace/resource mismatches without writes", async () => {
    const f = await artifactFixture();
    try {
        const prepared = await f.artifacts.prepareArtifact("contract", contractSnapshot());
        await f.artifacts.publishArtifact("contract", prepared.preparationId, prepared.digest);
        const input = {
            kind: "contract" as const,
            namespace: "community",
            namespaceRevision: 1,
            id: contractId,
            version: "1.0.0",
        };
        await expect(f.application.service.sources.getArtifact(input, undefined)).rejects.toThrow("authenticated");
        const other = await f.application.account("other-owner");
        for (const call of [
            () => f.application.service.sources.getArtifact(input, other.accountId),
            () =>
                f.application.service.sources.putArtifact(
                    { ...input, sourceJson: "malicious", releaseDigest: prepared.digest },
                    other.accountId,
                ),
        ]) {
            await expect(call()).rejects.toThrow();
        }
        await expect(
            f.application.service.sources.getArtifact({ ...input, id: "foreign/notes" }, f.account.accountId),
        ).rejects.toThrow("Invalid source coordinate");
        await expect(
            f.application.service.sources.putArtifact(
                { ...input, releaseDigest: `sha256:${"0".repeat(64)}`, sourceJson: "changed" },
                f.account.accountId,
            ),
        ).rejects.toThrow();
        expect((await f.artifacts.artifactSources("contract", "community", contractId, "1.0.0"))?.releaseDigest).toBe(
            prepared.digest,
        );
    } finally {
        await f.close();
    }
});
