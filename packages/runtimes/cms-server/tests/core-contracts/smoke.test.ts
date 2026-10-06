import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DefaultCoreCapabilityDispatcher, defaultSystem } from "@bernouy/cms-content";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { registerOfficialCoreCapabilities } from "../../src/runtime/core-contracts";

test("all six Control domains dispatch outputs matching their official contracts", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    const now = new Date("2026-10-06T12:00:00.000Z");
    const system = defaultSystem();
    system.site.name = "Example";
    system.site.language = "en";
    const core = {
        repo: { getSystem: async () => system, getSystemRevision: async () => 0 },
        collections: { snapshot: async () => ({ revision: 0, collections: [] }) },
        filesMetadata: {
            listChildren: async () => ({
                items: [
                    {
                        id: "file-1",
                        revision: 1,
                        type: "file",
                        name: "hero.png",
                        parentId: null,
                        size: 128,
                        mimeType: "image/png",
                        contentHash: "a".repeat(64),
                        representationVersion: "private-version",
                        blobKey: "private-blob-key",
                        createdAt: now,
                        updatedAt: now,
                    },
                ],
                total: 1,
                page: 1,
                limit: 50,
                hasMore: false,
            }),
        },
        fileMutations: {},
        users: {
            list: async () => ({
                users: [{ sub: "local:user-1", email: "admin@example.test", createdAt: now, lastSeenAt: now }],
                total: 1,
                page: 1,
                limit: 50,
                hasMore: false,
            }),
        },
        identityProviders: {
            list: async () => [
                {
                    id: "local",
                    revision: 1,
                    kind: "local",
                    displayName: "Email",
                    enabled: true,
                    createdAt: now,
                    updatedAt: now,
                },
            ],
        },
        collectionMigrations: {
            getActive: async () => null,
            listAudits: async () => [],
        },
    };
    const gateway = {
        siteId: "default",
        installations: {
            list: async () => [
                {
                    revision: 1,
                    installation: {
                        id: "official",
                        providerId: "ulvia.official",
                        accountId: "local",
                        endpoint: "http://127.0.0.1:5103",
                        status: "enabled",
                        approval: { manifestVersion: "0.6.0" },
                    },
                },
            ],
        },
        selections: { get: async () => ({ revision: 1, plan: { selections: [] } }) },
        administrators: {
            get: async (sub: string) => ({ sub, enabled: true, revision: 1, bootstrap: true }),
            list: async () => ["local:user-1"],
        },
    };
    registerOfficialCoreCapabilities(dispatcher, core as never, gateway as never);

    const calls = [
        ["ulvia.cms.collections", "list", {}],
        ["ulvia.cms.files", "list", {}],
        ["ulvia.cms.design", "overview", {}],
        ["ulvia.cms.providers", "list", {}],
        ["ulvia.cms.access", "overview", {}],
        ["ulvia.cms.operations", "status", {}],
    ] as const;
    for (const [contractId, capabilityId, input] of calls) {
        const release = await load(contractId);
        const capability = release.capabilities.find(({ id }) => id === capabilityId)!;
        const output = await dispatcher.invoke(contractId, capabilityId, input, {
            requestId: "00000000-0000-4000-8000-000000000001",
            siteId: "default",
            installationId: "official",
            origin: "control",
            actorKind: "administrator",
        });
        expect(() => validateSchemaValue(capability.output, output)).not.toThrow();
        if (contractId === "ulvia.cms.files") {
            expect(output).not.toHaveProperty("items.0.blobKey");
            expect(output).not.toHaveProperty("items.0.contentHash");
        }
    }
});

async function load(contractId: string) {
    const root = resolve(import.meta.dir, `../../../../official-repository/contracts/${contractId}/definition.json`);
    return (await admitContractReleaseJson(await readFile(root))).release;
}
