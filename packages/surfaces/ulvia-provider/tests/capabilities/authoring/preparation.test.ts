import { invokeHttp, resolvedContract } from "../../execution/messages/fixtures";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryAuthoring } from "@bernouy/repository/repository/authoring";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { mountAuthoringForTest } from "./mount";

test("invalid collection sources return bounded actionable diagnostics and never request publication authority", async () => {
    const root = await mkdtemp(join(tmpdir(), "authoring-diagnostics-"));
    let credentialRequests = 0;
    const authoring = new RepositoryAuthoring(
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
            claim: async () => {
                throw new Error("Unexpected namespace claim");
            },
            credential: async () => {
                credentialRequests += 1;
                throw new Error("Unexpected credential request");
            },
        },
    );
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountAuthoringForTest(dispatcher, authoring);
    try {
        const response = await invokeHttp(
            await resolvedContract("ulvia/cms.authoring"),
            dispatcher,
            "prepare-collection",
            { sourceJson: JSON.stringify({ files: [{ path: "../escape", content: "unsafe" }] }) },
        );
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.valid).toBe(false);
        expect(result.diagnostics[0]!.message).toContain("source path");
        expect(result.diagnostics[0]!.message).not.toContain(root);
        expect(credentialRequests).toBe(0);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
