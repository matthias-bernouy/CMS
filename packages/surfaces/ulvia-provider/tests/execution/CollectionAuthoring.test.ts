import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CollectionAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerCollectionAuthoringCapabilities } from "../../src/capabilities/installations/authoring";

test("invalid collection sources return bounded actionable diagnostics and never request publication authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "authoring-diagnostics-"));
    let signingRequests = 0;
    const authoring = new CollectionAuthoring(
        {
            root,
            contracts: new InMemoryReleaseCatalogue(),
            readAsset: async () => {
                throw new Error("Unexpected asset read");
            },
        },
        {
            repositoryUrl: "http://127.0.0.1",
            repositorySourceId: "local",
            listNamespaces: async () => ({ items: [], nextCursor: null }),
            trackNamespace: async () => {
                throw new Error("Unused namespace tracker");
            },
            identity: async () => ({ publicKey: "" }),
            claim: async () => undefined,
            credential: async () => {
                signingRequests += 1;
                throw new Error("Unexpected signing");
            },
        },
    );
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionAuthoringCapabilities(dispatcher, authoring);
    try {
        const result = (await dispatcher.invoke(
            "ulvia.cms.repository",
            "prepare-collection",
            { sourceJson: JSON.stringify({ files: [{ path: "../escape", content: "unsafe" }] }) },
            {
                siteId: "default",
                providerId: "ulvia.official",
                contractVersion: "1.0.0",
                requestId: crypto.randomUUID(),
            },
        )) as { valid: boolean; diagnostics: { message: string }[] };
        expect(result.valid).toBe(false);
        expect(result.diagnostics[0]!.message).toContain("source path");
        expect(result.diagnostics[0]!.message).not.toContain(root);
        expect(signingRequests).toBe(0);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
