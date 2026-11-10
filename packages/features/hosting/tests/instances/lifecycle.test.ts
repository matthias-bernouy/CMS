import { expect, test } from "bun:test";
import { ProviderInstanceLifecycle } from "@bernouy/hosting/instances";
import { InstanceRegistry } from "./fixture";

test("an idempotency key can only replay the exact instance request", async () => {
    const registry = new InstanceRegistry();
    let stagedAdministrators = 0;
    let provisions = 0;
    const lifecycle = new ProviderInstanceLifecycle(
        registry,
        {
            ensure: async () => ({
                instanceAccessToken: "instance-token",
                invocationSecret: "invocation-secret",
                sessionSecret: "session-secret",
                kekHex: "kek",
            }),
            read: async () => null,
            disable: async () => undefined,
            stageAdministrator: async () => {
                stagedAdministrators++;
            },
            readAdministrator: async () => null,
            clearAdministrator: async () => undefined,
        },
        {
            assertCreationAuthority: async () => undefined,
            provision: async (id: string) => {
                provisions++;
                const current = (await registry.get(id))!;
                return registry.update(id, current.revision, { status: "ready" });
            },
        },
        {
            current: async () => ({
                manifest: {
                    providerId: "ulvia/primary-provider",
                    version: "1.0.0",
                    digest: `sha256:${"a".repeat(64)}`,
                },
                contracts: [],
            }),
        },
        "idempotency-secret",
    );
    const input = {
        label: "One",
        cmsUrl: "http://127.0.0.1:5100",
        gatewayUrl: "http://edge.internal:3000",
        administrator: { email: "admin@example.test", password: "long-enough-password" },
    };

    const created = await lifecycle.create("create-one", input, { kind: "operator" });
    expect((await lifecycle.create("create-one", input, { kind: "operator" })).instance.id).toBe(created.instance.id);
    expect(stagedAdministrators).toBe(1);
    expect(provisions).toBe(1);
    await expect(
        lifecycle.create(
            "create-one",
            {
                ...input,
                administrator: { ...input.administrator, password: "different-password" },
            },
            { kind: "operator" },
        ),
    ).rejects.toThrow("different request");
});
