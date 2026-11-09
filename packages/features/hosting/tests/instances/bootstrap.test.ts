import { expect, test } from "bun:test";
import { ControlAuthority, ControlBootstrap, DomainRegistry } from "@bernouy/hosting";
import { InMemoryHostingStore } from "@bernouy/hosting/memory";
import { ProviderInstanceLifecycle } from "@bernouy/hosting/instances";
import { InstanceRegistry } from "./fixture";
import type { ProviderInstanceCredentials } from "@bernouy/hosting/instances";

function fixture() {
    const store = new InMemoryHostingStore();
    const instances = new InstanceRegistry();
    const secret = {
        instanceAccessToken: "protected-token",
        invocationSecret: "invoke",
        sessionSecret: "session",
        kekHex: "key",
    };
    const credentialed = new Set<string>();
    let stages = 0;
    let ready = true;
    let crash = false;
    const credentials: ProviderInstanceCredentials = {
        ensure: async (instance) => {
            credentialed.add(instance.id);
            return secret;
        },
        read: async (id) => (credentialed.has(id) ? secret : null),
        disable: async () => undefined,
        stageAdministrator: async () => {
            stages++;
        },
        readAdministrator: async () => null,
        clearAdministrator: async () => undefined,
    };
    const provisioner = {
        assertCreationAuthority: async () => undefined,
        provision: async (id: string) => {
            if (crash) {
                throw new Error("interrupted provisioning");
            }
            const record = (await instances.get(id))!;
            return !ready || record.status === "ready"
                ? record
                : instances.update(id, record.revision, { status: "ready" });
        },
    };
    const lifecycle = new ProviderInstanceLifecycle(
        instances,
        credentials,
        provisioner,
        {
            current: async () => ({
                manifest: { providerId: "ulvia/provider", version: "1.0.0", digest: `sha256:${"a".repeat(64)}` },
                contracts: [{ contractId: "ulvia/cms.hosting", version: "1.0.0", digest: `sha256:${"b".repeat(64)}` }],
            }),
        },
        "stable-idempotency-secret".repeat(2),
    );
    const authority = new ControlAuthority(store, async () => true);
    const registry = new DomainRegistry(
        store,
        { getInstance: (id) => instances.get(id) },
        authority,
        "proof".repeat(8),
        async () => false,
    );
    const bootstrap = new ControlBootstrap(
        store,
        store,
        instances,
        lifecycle,
        credentials,
        provisioner,
        registry,
        async () => instances.records.size === 0,
    );
    return {
        store,
        instances,
        bootstrap,
        authority,
        stages: () => stages,
        setReady(value: boolean) {
            ready = value;
        },
        setCrash(value: boolean) {
            crash = value;
        },
        credentialed,
    };
}
const origin = "http://control.localhost";
const administrator = { email: "operator@example.test", password: "protected-initial-password" };

test("concurrent bootstrap creates one persisted Control and its ordinary domain without resetting on restart", async () => {
    const f = fixture();
    const results = await Promise.all(Array.from({ length: 16 }, () => f.bootstrap.initialize(origin, administrator)));
    expect(new Set(results.map((result) => result.instance.id)).size).toBe(1);
    expect(f.instances.creates).toBe(1);
    const current = await f.store.readInstallation();
    expect(current?.phase).toBe("ready");
    const stages = f.stages();
    const reopened = await f.bootstrap.initialize(origin);
    expect(reopened.installation).toEqual(current);
    expect(reopened.domain).toEqual(results[0]!.domain);
    expect(f.stages()).toBe(stages);
    await f.authority.assertAdministrator({ instanceId: reopened.instance.id, subjectId: "operator" });
});

test("bootstrap distinguishes incomplete provisioning from an installation ready for use", async () => {
    const f = fixture();
    f.setReady(false);
    const pending = await f.bootstrap.initialize(origin, administrator);
    expect(pending.instance.status).toBe("provisioning");
    expect(pending.installation.phase).toBe("provisioning");
    await expect(
        f.authority.assertAdministrator({ instanceId: pending.instance.id, subjectId: "operator" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    f.setReady(true);
    const resumed = await f.bootstrap.initialize(origin);
    expect(resumed.installation.phase).toBe("ready");
    expect(resumed.instance.id).toBe(pending.instance.id);
    expect(f.stages()).toBe(1);
});

test("interrupted provisioning resumes its reserved Control without resetting administrator credentials", async () => {
    const f = fixture();
    f.setCrash(true);
    await expect(f.bootstrap.initialize(origin, administrator)).rejects.toThrow("interrupted");
    const before = await f.store.readInstallation();
    expect(before?.phase).toBe("provisioning");
    f.setCrash(false);
    const resumed = await f.bootstrap.initialize(origin);
    expect(resumed.instance.id).toBe(before!.controlInstanceId!);
    expect(resumed.installation.phase).toBe("ready");
    expect(f.instances.creates).toBe(1);
    expect(f.stages()).toBe(1);
});

test("initial access requires valid operator credentials and never permits a first visitor claim", async () => {
    const f = fixture();
    await expect(f.bootstrap.initialize(origin)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(f.bootstrap.initialize(origin, { ...administrator, password: "short" })).rejects.toThrow();
    expect(await f.store.readInstallation()).toBeNull();
    expect(f.instances.creates).toBe(0);
});

test("missing ready state or a changed startup origin refuses without recreating or moving Control", async () => {
    const f = fixture();
    const ready = await f.bootstrap.initialize(origin, administrator);
    await expect(f.bootstrap.initialize("http://other.localhost", administrator)).rejects.toMatchObject({
        code: "CONFLICT",
    });
    expect(await f.store.getDomain("other.localhost")).toBeNull();
    f.credentialed.clear();
    await expect(f.bootstrap.initialize(origin, administrator)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(f.credentialed.size).toBe(0);
    f.instances.records.clear();
    await expect(f.bootstrap.initialize(origin, administrator)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(await f.store.readInstallation()).toEqual(ready.installation);
    expect(f.instances.creates).toBe(1);
});

test("a missing installation marker in populated state refuses without bootstrapping", async () => {
    const f = fixture();
    await f.instances.create({
        repository: { url: "https://repo.ulvia.fr", configured: false },

        id: "instance:existing",
        idempotencyKey: "existing",
        idempotencyFingerprint: "fingerprint",
        creationAuthority: { kind: "operator" },
        storageKey: "existing",
        label: "Existing",
        cmsUrl: "http://existing.localhost",
        gatewayUrl: "http://existing.localhost",
        status: "ready",
    });
    await expect(f.bootstrap.initialize(origin, administrator)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.store.readInstallation()).toBeNull();
    expect(f.instances.creates).toBe(1);
    expect(f.credentialed.size).toBe(0);
});
