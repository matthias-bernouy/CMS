import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defaultSystem } from "@bernouy/cms-content";
import {
    ProviderOperationExecutor,
    DefaultProviderCapabilityDispatcher,
    MemoryProviderOperationStore,
    registerOfficialProviderCapabilities,
} from "@bernouy/ulvia-provider";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";

test("all administration capability areas dispatch outputs matching their official contracts", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
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
        collectionUpgrades: { storage: { getActive: async () => null } },
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
                    observation: {
                        observedAt: now.toISOString(),
                        report: {
                            implementations: [
                                {
                                    contractId: "ulvia.cms.content",
                                    version: "1.0.0",
                                    digest: `sha256:${"a".repeat(64)}`,
                                    status: "ready",
                                },
                            ],
                        },
                    },
                },
            ],
        },
        selections: {
            get: async () => ({
                revision: 1,
                plan: {
                    selections: [
                        {
                            contractId: "ulvia.cms.content",
                            version: "1.0.0",
                            digest: `sha256:${"a".repeat(64)}`,
                            installationId: "official",
                        },
                    ],
                },
            }),
        },
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
    registerOfficialProviderCapabilities(
        dispatcher,
        core as never,
        gateway as never,
        new ProviderOperationExecutor(new MemoryProviderOperationStore()),
        undefined,
        undefined,
        files,
    );

    const calls = [
        ["ulvia.cms.installations", "list-collection-installations", {}],
        ["ulvia.cms.installations", "list-operations", {}],
        ["ulvia.cms.installations", "get-site-upgrade-status", {}],
        ["ulvia.cms.files", "namespace.create", { name: "Smoke files", defaultVisibility: "private" }],
        ["ulvia.cms.content", "localization.get", {}],
        ["ulvia.cms.content", "theme.get", {}],
        ["ulvia.cms.installations", "list-provider-installations", {}],
        ["ulvia.cms.access", "list-users", {}],
    ] as const;
    for (const [contractId, capabilityId, input] of calls) {
        const release = await load(contractId);
        const capability = release.capabilities.find(({ id }) => id === capabilityId)!;
        const output = await dispatcher.invoke(contractId, capabilityId, input, {
            requestId: "00000000-0000-4000-8000-000000000001",
            contractVersion: release.version,
            siteId: "default",
            providerId: "ulvia.official",
        });
        expect(() => validateSchemaValue(capability.output, output)).not.toThrow();
    }
});

async function load(contractId: string) {
    const root = resolve(
        import.meta.dir,
        `../../../ulvia-cli/dist/bootstrap/contracts/cms/${contractId}/definition.json`,
    );
    return (await admitContractReleaseJson(await readFile(root))).release;
}
