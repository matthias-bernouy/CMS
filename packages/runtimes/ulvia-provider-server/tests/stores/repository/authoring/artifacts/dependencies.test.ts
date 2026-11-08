import { expect, test } from "bun:test";
import { artifactFixture, contractSnapshot, providerSnapshot, contractId } from "./fixtures";

test("manifest preparation coalesces exact and ranged metadata without loading documentation or fixture assets", async () => {
    const f = await artifactFixture();
    const original = globalThis.fetch;
    try {
        const source = JSON.parse(contractSnapshot());
        const capability = JSON.parse(source.files[1].content);
        source.files.push({
            path: "capabilities/queries/other.json",
            content: JSON.stringify({
                ...capability,
                id: "other",
                bindings: [{ ...capability.bindings[0], path: "/other" }],
            }),
        });
        const prepared = await f.artifacts.prepareArtifact("contract", JSON.stringify(source));
        await f.artifacts.publishArtifact("contract", prepared.preparationId, prepared.digest);
        const snapshot = JSON.parse(providerSnapshot(prepared.digest));
        const manifest = JSON.parse(snapshot.files[0].content);
        manifest.requires = ["read", "other"].map((capabilityId) => ({
            contractId,
            capabilityId,
            versionRange: "^1.0.0",
            optional: false,
        }));
        snapshot.files[0].content = JSON.stringify(manifest);
        let catalogue = 0;
        let metadata = 0;
        let assets = 0;
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = String(input);
            if (path.endsWith("/v1/catalogue")) {
                catalogue++;
            }
            if (path.includes("/v1/releases/contract/")) {
                metadata++;
            }
            if (path.includes("/v1/assets/")) {
                assets++;
            }
            return original(input, init);
        }, original);
        await f.artifacts.prepareArtifact("provider-manifest", JSON.stringify(snapshot));
        expect({ catalogue, metadata, assets }).toEqual({ catalogue: 2, metadata: 1, assets: 0 });
        expect(await f.contracts.get(contractId, "1.0.0")).toBeNull();
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("unresolved contract pins refuse manifest preparation and dependency transport remains a technical error", async () => {
    const f = await artifactFixture();
    const original = globalThis.fetch;
    try {
        await expect(
            f.artifacts.prepareArtifact("provider-manifest", providerSnapshot(`sha256:${"0".repeat(64)}`)),
        ).rejects.toThrow("do not resolve");
        globalThis.fetch = Object.assign(
            async (input: RequestInfo | URL, init?: RequestInit) =>
                String(input).endsWith("/v1/catalogue") ? new Response(null, { status: 503 }) : original(input, init),
            original,
        );
        await expect(
            f.artifacts.prepareArtifact("provider-manifest", providerSnapshot(`sha256:${"0".repeat(64)}`)),
        ).rejects.toThrow("temporarily unavailable");
        expect(await f.application.service.reads.catalogue({ kind: "provider-manifest", limit: 10 })).toMatchObject({
            releases: [],
        });
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("contract preparation validates exact parent pins and rejects inherited capability redeclarations", async () => {
    const f = await artifactFixture();
    try {
        const parent = await f.artifacts.prepareArtifact("contract", contractSnapshot());
        await f.artifacts.publishArtifact("contract", parent.preparationId, parent.digest);
        const child = JSON.parse(contractSnapshot());
        const definition = JSON.parse(child.files[0].content);
        definition.contractId = "community/notes.special";
        definition.extends = { contractId, version: "1.0.0", digest: parent.digest };
        child.files[0].content = JSON.stringify(definition);
        await expect(f.artifacts.prepareArtifact("contract", JSON.stringify(child))).rejects.toThrow(
            "cannot redeclare inherited",
        );
        const capability = JSON.parse(child.files[1].content);
        capability.id = "child-read";
        capability.bindings[0].path = "/child-read";
        child.files[1].content = JSON.stringify(capability);
        const prepared = await f.artifacts.prepareArtifact("contract", JSON.stringify(child));
        expect(await f.artifacts.publishArtifact("contract", prepared.preparationId, prepared.digest)).toMatchObject({
            contractId: "community/notes.special",
        });
        expect(await f.contracts.get(contractId, "1.0.0")).toBeNull();
    } finally {
        await f.close();
    }
});
