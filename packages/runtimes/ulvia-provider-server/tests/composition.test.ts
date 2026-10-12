import { describe, expect, test } from "bun:test";
import { OFFICIAL_INSTANCE_PROFILE, type ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../src/runtimeEnv";
import type { InstanceComposition } from "../src/runtime/instances/ProviderInstanceHost";
import { createInstanceProvisioningTarget } from "../src/runtime/instances/instanceProvisioning";

test("the Provider composes only Provider-owned runtime services", async () => {
    const [entrypoint, stores] = await Promise.all([
        Bun.file(new URL("../src/index.ts", import.meta.url)).text(),
        Bun.file(new URL("../src/runtime/stores/providerStores.ts", import.meta.url)).text(),
    ]);

    expect(entrypoint).not.toContain("cms-kernel-server");
    expect(entrypoint).not.toContain("cms-instance-runtime");
    expect(stores).not.toContain("MongoAuthTokenStore");
    expect(stores).not.toContain("MongoRateLimiter");
    expect(stores).not.toContain("sitemap");
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

        await target.connectProvider(OFFICIAL_INSTANCE_PROFILE);

        expect(calls).toEqual([expect.objectContaining({ installationId: "installation:official", revision: 4 })]);
    });

    test("fails the durable step when the Provider observation was not stored", async () => {
        const target = connectionTarget({
            list: async () => ({ installations: [installation(null)], selected: [] }),
            preview: async () => ({ ticket: "ticket" }),
            approve: async () => ({ observed: false }),
        });

        await expect(target.connectProvider(OFFICIAL_INSTANCE_PROFILE)).rejects.toThrow(
            "Official Provider observation was not persisted",
        );
    });
});

function connectionTarget(management: Record<string, unknown>) {
    const instance = {
        id: "instance:official",
        storageKey: "instance-official",
    } as ProviderInstanceRecord;
    return createInstanceProvisioningTarget({
        instance,
        composition: { management } as unknown as InstanceComposition,
        env: { ULVIA_PROVIDER_PUBLIC_URL: "http://127.0.0.1:5103" } as ProviderRuntimeEnv,
        credentials: {
            read: async () => ({ token: "instance-token", sessionSecret: "session-secret", kekHex: "0".repeat(64) }),
        },
        providerSource: {} as never,
        collectionSource: {} as never,
    });
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
