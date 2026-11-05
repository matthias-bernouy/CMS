import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { artifactFixture, contractSnapshot, contractId } from "./fixtures";

const bytes = new Uint8Array(
    await Bun.file(
        new URL(
            "../../../../../../../features/cms-repository/fixtures/contracts/protocol-v1/mock-assets/receipt.svg",
            import.meta.url,
        ),
    ).arrayBuffer(),
);
const fixtureDigest = "sha256:61cc3d4fd2135663e047b9dfab68367dedf9df8e2516dded57257a06463ffaa9";
test("binary contract fixtures retain portable release pins and changed bytes refuse before upload", async () => {
    let client: RemoteRepositoryClient;
    const f = await artifactFixture(async (asset) => {
        if (asset.fileId) {
            expect(asset.generation).toBe("generation-1");
            return new Blob([bytes]);
        }
        const loaded = await client.pullContractAsset(
            { kind: "contract", publisherId: asset.publisherId!, id: asset.contractId!, version: asset.version! },
            asset.releaseDigest!,
            asset.assetId!,
        );
        return loaded instanceof Blob ? loaded : new Blob([new Uint8Array(loaded)]);
    });
    const original = globalThis.fetch;
    try {
        client = new RemoteRepositoryClient(f.base);
        const source = JSON.parse(contractSnapshot());
        const definition = JSON.parse(source.files[0].content);
        definition.fixtureAssets = [
            { id: "receipt.svg", mediaType: "image/svg+xml", byteLength: bytes.length, digest: fixtureDigest },
        ];
        source.files[0].content = JSON.stringify(definition);
        const capability = JSON.parse(source.files[1].content);
        capability.output = { type: "binary", maxBytes: 1024 };
        capability.bindings[0].response.contentTypes = ["image/svg+xml"];
        source.files[1].content = JSON.stringify(capability);
        source.files.push({
            path: "mocks/read/sample.json",
            content: JSON.stringify({
                capabilityId: "read",
                id: "sample",
                input: {},
                outcome: { kind: "success", output: { assetId: "receipt.svg" } },
            }),
        });
        source.assets = [{ path: "fixtures/receipt.svg", fileId: "file-1", generation: "generation-1" }];
        const first = await f.artifacts.prepareArtifact("contract", JSON.stringify(source));
        await f.artifacts.publishArtifact("contract", first.preparationId, first.digest);
        const retained = await f.artifacts.artifactSources("contract", "community", contractId, "1.0.0");
        const snapshot = JSON.parse(retained!.sourceJson);
        expect(snapshot.assets).toEqual([
            {
                path: "fixtures/receipt.svg",
                publisherId: "community",
                contractId,
                version: "1.0.0",
                releaseDigest: first.digest,
                assetId: "receipt.svg",
            },
        ]);
        const definitionFile = snapshot.files.find((file: { path: string }) => file.path === "definition.json");
        const next = JSON.parse(definitionFile.content);
        next.version = "1.0.1";
        definitionFile.content = JSON.stringify(next);
        let metadata = 0;
        let assets = 0;
        let uploads = 0;
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.includes("/v1/releases/contract/")) {
                metadata++;
            }
            if (url.includes("/v1/assets/contract/")) {
                assets++;
            }
            if (url.includes("/v1/uploads")) {
                uploads++;
            }
            return original(input, init);
        }, original);
        const second = await f.artifacts.prepareArtifact("contract", JSON.stringify(snapshot));
        expect({ metadata, assets, uploads }).toEqual({ metadata: 1, assets: 1, uploads: 0 });
        await writeFile(join(f.host.root, second.preparationId, "notes/fixtures/receipt.svg"), "changed");
        await expect(f.artifacts.publishArtifact("contract", second.preparationId, second.digest)).rejects.toThrow(
            "sources changed",
        );
        expect(uploads).toBe(0);
        expect(await f.artifacts.artifactSources("contract", "community", contractId, "1.0.1")).toBeNull();
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});
