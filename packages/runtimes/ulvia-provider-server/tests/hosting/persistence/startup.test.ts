import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NOOP_LOGGER } from "@bernouy/logging";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { EncryptedInstanceCredentials } from "../../../src/runtime/authentication/EncryptedInstanceCredentials";
import { readProviderRuntimeEnv } from "../../../src/runtimeEnv";
import { SystemBootstrap } from "../../../src/runtime/instances/system/execution/SystemBootstrap";
import { bundledBootstrapSources } from "../../../src/runtime/instances/system/bootstrap";
import { ProviderExecutionSupport } from "../../../src/runtime/instances/system/execution/support";
import { ProviderInstanceHost } from "../../../src/runtime/instances/composition/ProviderInstanceHost";
import { ProviderDocumentation } from "../../../src/runtime/instances/composition/ProviderDocumentation";
import { assertHostedReleaseRetention } from "../../../src/runtime/instances/system/retention";

const digest = `sha256:${"a".repeat(64)}`;
const plan = { manifest: { providerId: "ulvia/primary-provider", version: "1.4.0", digest }, contracts: [] };
const record: ProviderInstanceRecord = {
    repository: { url: "https://repo.ulvia.fr", configured: false },

    id: "instance:startup",
    storageKey: "startup",
    idempotencyKey: "startup",
    idempotencyFingerprint: digest,
    creationAuthority: { kind: "operator" },
    cmsUrl: "http://startup.localhost",
    gatewayUrl: "http://startup.localhost",
    label: "Startup",
    revision: 1,
    status: "ready",
    systemPlan: plan,
    createdAt: "2026-11-09T00:00:00Z",
    updatedAt: "2026-11-09T00:00:00Z",
};

test("retention consumes tenant metadata one at a time and closes the source on refusal", async () => {
    let supplied = 0;
    let consumed = 0;
    let closed = false;
    const instances = async function* () {
        try {
            for (let index = 0; index < 1000; index++) {
                expect(supplied).toBe(consumed);
                supplied++;
                yield { ...record, id: `instance:startup-${index}` };
            }
        } finally {
            closed = true;
        }
    };
    const support = new ProviderExecutionSupport({
        providerId: plan.manifest.providerId,
        buildVersion: "1.0.0",
        releases: [{ contractId: "ulvia/cms.content", version: "1.0.0", digest }],
    });
    await expect(
        assertHostedReleaseRetention(
            support,
            {
                instances: instances(),
                transitions: async function* () {},
                hasUnstagedUpgrade: async () => false,
            },
            {
                assertPlan: async () => undefined,
                required: async () => {
                    consumed++;
                    if (consumed === 3) {
                        throw new Error("Pin refused");
                    }
                    return [];
                },
            },
            { current: async () => plan },
        ),
    ).rejects.toThrow("Pin refused");
    expect(supplied).toBe(3);
    expect(closed).toBeTrue();
});

test("startup recovery scans metadata without hydrating idle tenants and closes after a pending failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-startup-lazy-"));
    let opened = 0;
    const credentials = {
        read: async () => {
            opened++;
            throw new Error("Pending tenant opened");
        },
    } as unknown as EncryptedInstanceCredentials;
    const env = readProviderRuntimeEnv({
        ULVIA_PROVIDER_PUBLIC_URL: "http://127.0.0.1:5103",
        ULVIA_PROVIDER_OPERATOR_TOKEN: "operator-test-token-that-is-long-enough",
        MONGO_URL: "mongodb://127.0.0.1:27017/startup",
        CMS_FILES_DIR: root,
        CMS_SESSION_SECRET: "startup-test-secret",
        CMS_KEK_ACTIVE_ID: "test",
        CMS_KEK_RING_JSON: JSON.stringify({ test: "00".repeat(32) }),
        ULVIA_EMBEDDING_MODEL_DIR: root,
    });
    const sources = bundledBootstrapSources();
    const host = new ProviderInstanceHost(
        env,
        credentials,
        new SystemBootstrap(sources),
        NOOP_LOGGER,
        new ProviderExecutionSupport(),
        {
            get: async (id) => ({ ...record, id }),
            update: async () => record,
        },
        sources,
    );
    let closed = false;
    const records = async function* () {
        try {
            for (let index = 0; index < 1000; index++) {
                yield { ...record, id: `instance:startup-${index}` };
            }
        } finally {
            closed = true;
        }
    };
    try {
        expect(await host.recoverOperations(records(), async () => false)).toBe(0);
        expect(opened).toBe(0);
        expect(closed).toBeTrue();
        closed = false;
        let probes = 0;
        await expect(host.recoverOperations(records(), async () => ++probes === 3)).rejects.toThrow(
            "Pending tenant opened",
        );
        expect(opened).toBe(1);
        expect(probes).toBe(3);
        expect(closed).toBeTrue();
    } finally {
        await host.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("documentation prepares only a hinted tenant, coalesces it and releases its lease on shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-documentation-lazy-"));
    const prepared = Promise.withResolvers<void>();
    const opened: string[] = [];
    let released = 0;
    const documentation = new ProviderDocumentation(
        { cacheDirectory: root, localFilesOnly: true },
        async (instance) => {
            opened.push(instance.id);
            return {
                resource: {
                    documentation: {
                        prepare: async () => {
                            prepared.resolve();
                            return { revision: "one", chunks: 0, semantic: false, embedded: 0, reused: 0 };
                        },
                    },
                },
                release: () => {
                    released++;
                },
            };
        },
        NOOP_LOGGER,
    );
    try {
        documentation.start();
        expect(opened).toEqual([]);
        documentation.request(record);
        documentation.request(record);
        await prepared.promise;
        await documentation.stop();
        expect(opened).toEqual([record.id]);
        expect(released).toBe(1);
        documentation.request({ ...record, id: "instance:later" });
        expect(opened).toHaveLength(1);
    } finally {
        await documentation.close();
        await rm(root, { recursive: true, force: true });
    }
});
