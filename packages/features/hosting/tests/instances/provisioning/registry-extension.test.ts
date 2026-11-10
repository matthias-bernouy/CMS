import { describe, expect, test } from "bun:test";
import { OfficialInstanceProvisioner } from "@bernouy/hosting/instances";

import {
    SYSTEM_PLAN,
    MemoryRegistry,
    MemoryTransitions,
    administratorCredentials,
    createProvisioner,
    instance,
    target,
} from "./fixture";

describe("OfficialInstanceProvisioner Registry extensions", () => {
    test("Registry transition recovery rechecks current administrator authority before opening services", async () => {
        const registry = new MemoryRegistry(instance("ready"));
        const transitions = new MemoryTransitions();
        transitions.record = {
            id: "system:extension",
            instanceId: "instance:one",
            kind: "registry",
            targetPlan: SYSTEM_PLAN,
            administratorSub: "local:revoked",
            planVersion: 1,
            steps: ["manifest", "provider", "contracts"],
            completedSteps: [],
            status: "queued",
            revision: 1,
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
        };
        const calls: string[] = [];
        const provisioner = new OfficialInstanceProvisioner(
            registry,
            transitions,
            async () => {
                calls.push("open");
                return target(calls, async () => undefined);
            },
            { ...administratorCredentials(), authorizeExtension: async () => false },
        );
        await provisioner.recover();
        expect(calls).toEqual([]);
        expect(transitions.record?.status).toBe("failed");
        expect((await registry.get("instance:one"))?.status).toBe("ready");
    });

    test("Registry uses one durable transition, resumes completed steps, and commits the address only at completion", async () => {
        const registry = new MemoryRegistry(instance("ready"));
        const initialRepository = structuredClone((await registry.get("instance:one"))!.repository);
        const transitions = new MemoryTransitions();
        const calls: string[] = [];
        let fail = true;
        const plan = {
            ...SYSTEM_PLAN,
            contracts: [
                ...SYSTEM_PLAN.contracts,
                { contractId: "ulvia/repository", version: "1.0.0", digest: `sha256:${"c".repeat(64)}` },
            ],
        };
        const provisioner = new OfficialInstanceProvisioner(
            registry,
            transitions,
            async () => ({
                ...target(calls, async () => undefined),
                selectContracts: async () => {
                    calls.push("contracts");
                    if (fail) {
                        throw new Error("Interrupted");
                    }
                },
            }),
            { ...administratorCredentials(), authorizeExtension: async () => true },
        );
        await expect(provisioner.createRepository("instance:one", SYSTEM_PLAN, plan, 1, "local:admin")).rejects.toThrow(
            "Interrupted",
        );
        expect((await registry.get("instance:one"))?.repository).toEqual(initialRepository);
        expect(transitions.record?.completedSteps).toEqual(["provider"]);
        fail = false;
        const latest = (await registry.get("instance:one"))!;
        const ready = await provisioner.createRepository(latest.id, SYSTEM_PLAN, plan, latest.revision, "local:admin");
        expect(ready.repository).toEqual({ url: ready.cmsUrl, configured: true });
        expect(calls).toEqual(["provider", "contracts", "contracts"]);
        expect(transitions.record?.status).toBe("succeeded");
        expect(transitions.record?.steps).toEqual(["provider", "contracts"]);
        expect(await provisioner.createRepository(ready.id, SYSTEM_PLAN, plan, ready.revision, "local:admin")).toEqual(
            ready,
        );
        expect(calls).toHaveLength(3);
    });

    test("Registry recovery reconciles a lost completion acknowledgement without reopening business services", async () => {
        const registry = new MemoryRegistry(instance("ready"));
        const transitions = new MemoryTransitions();
        const calls: string[] = [];
        const plan = {
            ...SYSTEM_PLAN,
            contracts: [
                ...SYSTEM_PLAN.contracts,
                { contractId: "ulvia/repository", version: "1.0.0", digest: `sha256:${"c".repeat(64)}` },
            ],
        };
        const provisioner = new OfficialInstanceProvisioner(
            registry,
            transitions,
            async () => target(calls, async () => undefined),
            { ...administratorCredentials(), authorizeExtension: async () => true },
        );
        transitions.allowFinish = false;
        await expect(provisioner.createRepository("instance:one", SYSTEM_PLAN, plan, 1, "local:admin")).rejects.toThrow(
            "lease was lost",
        );
        const committed = structuredClone((await registry.get("instance:one"))!);
        expect(committed.status).toBe("ready");
        expect(committed.repository?.configured).toBe(true);
        expect(transitions.record?.status).toBe("running");
        transitions.allowFinish = true;
        await provisioner.recover();
        expect(transitions.record?.status).toBe("succeeded");
        expect(await registry.get(committed.id)).toEqual(committed);
        expect(calls).toEqual(["provider", "contracts"]);
    });

    test("a stale Registry command does not change instance metadata or open business services", async () => {
        const registry = new MemoryRegistry(instance("ready"));
        const before = structuredClone((await registry.get("instance:one"))!);
        const transitions = new MemoryTransitions();
        const calls: string[] = [];
        const plan = {
            ...SYSTEM_PLAN,
            contracts: [
                ...SYSTEM_PLAN.contracts,
                { contractId: "ulvia/repository", version: "1.0.0", digest: `sha256:${"c".repeat(64)}` },
            ],
        };
        const provisioner = new OfficialInstanceProvisioner(
            registry,
            transitions,
            async () => target(calls, async () => undefined),
            { ...administratorCredentials(), authorizeExtension: async () => true },
        );
        await expect(
            provisioner.createRepository(before.id, SYSTEM_PLAN, plan, 0, "local:admin"),
        ).rejects.toMatchObject({ status: 409 });
        expect(await registry.get(before.id)).toEqual(before);
        expect(transitions.record).toBeNull();
        expect(calls).toEqual([]);
    });
    test("rejects extensions which replace installed pins before creating a transition", async () => {
        const registry = new MemoryRegistry(instance("ready"));
        const transitions = new MemoryTransitions();
        const calls: string[] = [];
        const provisioner = createProvisioner(registry, transitions, calls);
        await expect(
            provisioner.createRepository(
                "instance:one",
                SYSTEM_PLAN,
                { ...SYSTEM_PLAN, contracts: [] },
                1,
                "local:admin",
            ),
        ).rejects.toThrow("preserve the exact");
        expect(transitions.record).toBeNull();
        expect(calls).toEqual([]);
    });
});
