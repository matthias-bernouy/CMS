import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultSystem } from "@bernouy/cms-content";
import {
    CoreOperationExecutor,
    DefaultCoreCapabilityDispatcher,
    MemoryCoreOperationStore,
    registerOfficialCoreCapabilities,
} from "@bernouy/cms-core";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";

test("all eight Control domains dispatch outputs matching their official contracts", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    const now = new Date("2026-10-06T12:00:00.000Z");
    const system = defaultSystem();
    system.site.name = "Example";
    system.site.language = "en";
    const core = {
        repo: { getSystem: async () => system, getSystemRevision: async () => 0 },
        collections: { snapshot: async () => ({ revision: 0, collections: [] }) },
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
    const files = new CmsFilesService({
        store: new InMemoryCmsFilesStore(),
        blobs: new MemoryBlobStore(),
        signingKey: new Uint8Array(32).fill(7),
        publicBaseUrl: "https://cms.example",
        now: () => now,
    });
    registerOfficialCoreCapabilities(
        dispatcher,
        core as never,
        gateway as never,
        new CoreOperationExecutor(new MemoryCoreOperationStore()),
        undefined,
        undefined,
        files,
    );

    const calls = [
        ["ulvia.cms.collections", "list", {}],
        ["ulvia.cms.collections", "migration-status", {}],
        ["ulvia.cms.files", "namespace.create", { name: "Smoke files", defaultVisibility: "private" }],
        ["ulvia.cms.jobs", "list", {}],
        ["ulvia.cms.localization", "overview", {}],
        ["ulvia.cms.theme", "get", {}],
        ["ulvia.cms.providers", "list", {}],
        ["ulvia.cms.access", "overview", {}],
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
    }
});

async function load(contractId: string) {
    const root = resolve(
        import.meta.dir,
        `../../../ulvia-cli/src/bootstrap/resources/contracts/cms/${contractId}/definition.json`,
    );
    return (await admitContractReleaseJson(await readFile(root))).release;
}
