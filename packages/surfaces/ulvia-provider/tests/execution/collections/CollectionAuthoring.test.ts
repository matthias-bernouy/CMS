import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CollectionAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerCollectionAuthoringCapabilities } from "../../../src/capabilities/installations/authoring";

test("invalid collection sources return bounded actionable diagnostics and never request publication authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "authoring-diagnostics-"));
    let credentialRequests = 0;
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
            connectionStatus: async () => ({
                configured: false,
                repositoryUrl: "http://127.0.0.1",
                repositoryId: null,
            }),
            configureConnection: async () => {
                throw new Error("Unexpected connection configuration");
            },
            disconnectConnection: async () => ({
                configured: false,
                repositoryUrl: "http://127.0.0.1",
                repositoryId: null,
            }),
            claim: async () => undefined,
            credential: async () => {
                credentialRequests += 1;
                throw new Error("Unexpected credential request");
            },
        },
    );
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerCollectionAuthoringCapabilities(dispatcher, authoring);
    try {
        const result = (await dispatcher.invoke(
            "ulvia.cms.authoring",
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
        expect(credentialRequests).toBe(0);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
