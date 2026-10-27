import { describe, expect, test } from "bun:test";
import type { OfficialInstanceProfile, ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../src/runtimeEnv";
import type { InstanceComposition } from "../src/runtime/instances/composition/ProviderInstanceHost";
import { createInstanceProvisioningTarget } from "../src/runtime/instances/instanceProvisioning";
import { installOfficialCollection } from "../src/runtime/instances/instanceInitialization";

const OFFICIAL_INSTANCE_PROFILE: OfficialInstanceProfile = Object.freeze({
    id: "ulvia.official",
    version: "1.0.0",
    upgradeFromVersions: Object.freeze([]),
    manifest: Object.freeze({ providerId: "ulvia.official", version: "0.3.0", digest: `sha256:${"a".repeat(64)}` }),
    contracts: Object.freeze([
        Object.freeze({ contractId: "ulvia.cms.content", version: "1.0.0", digest: `sha256:${"b".repeat(64)}` }),
    ]),
    collection: Object.freeze({
        publisherId: "ulvia.official",
        collectionId: "ulvia-official",
        version: "1.0.0",
        digest: `sha256:${"c".repeat(64)}`,
    }),
});

test("the Provider owns every persistent instance service while remaining independent from Kernel", async () => {
    const [entrypoint, stores] = await Promise.all([
        Bun.file(new URL("../src/index.ts", import.meta.url)).text(),
        Bun.file(new URL("../src/runtime/stores/providerStores.ts", import.meta.url)).text(),
    ]);

    expect(entrypoint).not.toContain("cms-kernel-server");
    expect(entrypoint).not.toContain("cms-instance-runtime");
    expect(entrypoint).toContain("instanceHost.recoverOperations");
    expect(stores).toContain("MongoAuthTokenStore");
    expect(stores).toContain("MongoRateLimiter");
    expect(stores).toContain("sitemapStore");
    expect(stores).toContain("CmsFilesService");
});

describe("official Provider connection provisioning", () => {
    test("reconnects an installation whose observation is incomplete", async () => {
        const calls: unknown[] = [];
        const target = connectionTarget({
            list: async () => ({ installations: [installation(null)], selected: [] }),
            preview: async (input: unknown) => {
                calls.push(input);
                return { ticket: "ticket" };
            },
            approve: async () => ({ observed: true }),
        });

        await target.connectProvider(OFFICIAL_INSTANCE_PROFILE, execution());

        expect(calls).toEqual([expect.objectContaining({ installationId: "installation:official", revision: 4 })]);
    });

    test("fails the durable step when the Provider observation was not stored", async () => {
        const target = connectionTarget({
            list: async () => ({ installations: [installation(null)], selected: [] }),
            preview: async () => ({ ticket: "ticket" }),
            approve: async () => ({ observed: false }),
        });

        await expect(target.connectProvider(OFFICIAL_INSTANCE_PROFILE, execution())).rejects.toThrow(
            "Official Provider observation was not persisted",
        );
    });

    test("does not restore a terminally revoked official installation", async () => {
        let previewed = false;
        const target = connectionTarget({
            list: async () => ({ installations: [{ ...installation(null), status: "revoked" }], selected: [] }),
            preview: async () => {
                previewed = true;
                return { ticket: "ticket" };
            },
        });

        await expect(target.connectProvider(OFFICIAL_INSTANCE_PROFILE, execution())).rejects.toThrow(
            "was revoked and cannot be restored",
        );
        expect(previewed).toBe(false);
    });
});

test("official administrator provisioning writes the shared authority model", async () => {
    let granted: { sub: string; enabled: boolean } | undefined;
    const target = createInstanceProvisioningTarget({
        instance: { id: "instance:official", storageKey: "instance-official" } as ProviderInstanceRecord,
        composition: {
            stores: {
                credentials: { getByEmail: async () => ({ sub: "administrator" }) },
            },
            administrators: {
                set: async (sub: string, enabled: boolean) => {
                    granted = { sub, enabled };
                    return { sub, enabled, revision: 1, bootstrap: false };
                },
            },
        } as unknown as InstanceComposition,
        env: {} as ProviderRuntimeEnv,
        credentials: { read: async () => null },
        providerSource: {} as never,
        collectionSource: {} as never,
    });

    await target.initializeAdministrator(
        { email: "admin@example.test", password: "unused-existing-password" },
        execution(),
    );

    expect(granted).toEqual({ sub: "local:administrator", enabled: true });
});

describe("official administration collection provisioning", () => {
    test("selects the contributed login Page even when the exact release is already installed", async () => {
        let selected: unknown;
        const composition = collectionComposition(null, (patch) => {
            selected = patch;
        });

        await installOfficialCollection(
            composition,
            collectionSource() as never,
            OFFICIAL_INSTANCE_PROFILE,
            execution(),
        );

        expect(selected).toEqual({ site: { login: officialLoginReference() } });
    });

    test("preserves an explicitly selected login Page", async () => {
        const custom = { kind: "site", pageId: "custom-login" } as const;
        let writes = 0;
        const composition = collectionComposition(custom, () => {
            writes += 1;
        });

        await installOfficialCollection(
            composition,
            collectionSource() as never,
            OFFICIAL_INSTANCE_PROFILE,
            execution(),
        );

        expect(writes).toBe(0);
    });
});

function connectionTarget(management: Record<string, unknown>) {
    const instance = {
        id: "instance:official",
        storageKey: "instance-official",
    } as ProviderInstanceRecord;
    return createInstanceProvisioningTarget({
        instance,
        composition: {
            management,
            managementForProfile: (profile: typeof OFFICIAL_INSTANCE_PROFILE) => {
                expect(profile).toBe(OFFICIAL_INSTANCE_PROFILE);
                return management;
            },
        } as unknown as InstanceComposition,
        env: { ULVIA_PROVIDER_PUBLIC_URL: "http://127.0.0.1:5103" } as ProviderRuntimeEnv,
        credentials: {
            read: async () => ({
                instanceAccessToken: "instance-token",
                invocationSecret: "invocation-secret",
                sessionSecret: "session-secret",
                kekHex: "0".repeat(64),
            }),
        },
        providerSource: {} as never,
        collectionSource: {} as never,
    });
}

function collectionComposition(login: unknown, update: (patch: unknown) => void): InstanceComposition {
    return {
        stores: {
            collections: {
                importRelease: async () => ({
                    digest: OFFICIAL_INSTANCE_PROFILE.collection.digest,
                    release: { pages: [{ id: "login" }] },
                }),
                snapshot: async () => ({
                    revision: 2,
                    collections: [
                        {
                            collectionId: OFFICIAL_INSTANCE_PROFILE.collection.collectionId,
                            digest: OFFICIAL_INSTANCE_PROFILE.collection.digest,
                        },
                    ],
                }),
            },
            repo: {
                getSystemRevision: async () => 4,
                getSystem: async () => ({ site: { login } }),
                updateSystem: async (patch: unknown) => {
                    update(patch);
                    return {};
                },
            },
        },
    } as unknown as InstanceComposition;
}

function collectionSource() {
    const entry = {
        ...OFFICIAL_INSTANCE_PROFILE.collection,
        repositoryId: "official",
        name: "Ulvia Official",
        description: "Official collection",
        blocCount: 1,
        hasTheme: true,
    };
    return {
        id: "official",
        list: async () => [entry],
        get: async () => ({ release: {}, assets: [] }),
    };
}

function officialLoginReference() {
    return {
        kind: "contribution",
        sourceId: OFFICIAL_INSTANCE_PROFILE.collection.publisherId,
        contributionId: OFFICIAL_INSTANCE_PROFILE.collection.collectionId,
        pageId: "login",
    };
}

function installation(observedAt: string | null) {
    return {
        id: "installation:official",
        providerId: OFFICIAL_INSTANCE_PROFILE.manifest.providerId,
        accountId: "instance:official",
        endpoint: "http://127.0.0.1:5103",
        status: "enabled",
        manifestVersion: OFFICIAL_INSTANCE_PROFILE.manifest.version,
        manifestDigest: OFFICIAL_INSTANCE_PROFILE.manifest.digest,
        revision: 4,
        observedAt,
        contracts: OFFICIAL_INSTANCE_PROFILE.contracts.map((contract) => ({ ...contract, status: "ready" })),
    };
}

function execution() {
    return { signal: new AbortController().signal, throwIfLeaseLost: () => undefined };
}
