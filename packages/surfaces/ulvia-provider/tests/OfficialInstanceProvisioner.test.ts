import { describe, expect, test } from "bun:test";
import { OfficialInstanceProvisioner } from "../src/exports/index";

import {
    SYSTEM_PLAN,
    MemoryRegistry,
    MemoryTransitions,
    createProvisioner,
    administratorCredentials,
    instance,
    target,
} from "./operator/provisioningFixtures";

describe("OfficialInstanceProvisioner", () => {
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
        expect((await registry.get("instance:one"))?.repository).toBeUndefined();
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

    test("journals provisioning steps and never replays a completed transition", async () => {
        const registry = new MemoryRegistry(instance());
        const transitions = new MemoryTransitions();
        const calls: string[] = [];
        const provisioner = createProvisioner(registry, transitions, calls);

        expect((await provisioner.provision("instance:one")).status).toBe("ready");
        expect(calls).toEqual(["manifest", "provider", "contracts", "initialization", "administrator"]);
        await provisioner.provision("instance:one");
        expect(calls).toHaveLength(5);
        expect(transitions.record?.status).toBe("succeeded");
    });

    test("resumes a failed system plan after its last durable step", async () => {
        const registry = new MemoryRegistry(instance());
        const transitions = new MemoryTransitions();
        let fails = true;
        const calls: string[] = [];
        const provisioner = createProvisioner(registry, transitions, calls, async () => {
            calls.push("initialization");
            if (fails) {
                fails = false;
                throw new Error("repository unavailable");
            }
        });

        await expect(provisioner.provision("instance:one")).rejects.toThrow("repository unavailable");
        await provisioner.provision("instance:one");
        expect(calls.filter((step) => step === "manifest")).toHaveLength(1);
        expect(calls.filter((step) => step === "initialization")).toHaveLength(2);
    });

    test("clears staged administrator credentials after the durable step and reconciles a cleanup crash", async () => {
        const registry = new MemoryRegistry(instance());
        const transitions = new MemoryTransitions();
        const calls: string[] = [];
        let cleanupAttempts = 0;
        let failCleanup = true;
        const provisioner = new OfficialInstanceProvisioner(
            registry,
            transitions,
            async () => target(calls, async () => void calls.push("initialization")),
            administratorCredentials(async () => {
                cleanupAttempts += 1;
                if (failCleanup) {
                    throw new Error("secret store unavailable");
                }
            }),
        );

        await expect(provisioner.provision("instance:one")).rejects.toThrow("secret store unavailable");
        expect(transitions.record?.completedSteps).toContain("administrator");
        expect(calls.filter((step) => step === "administrator")).toHaveLength(1);
        expect(cleanupAttempts).toBe(1);

        failCleanup = false;
        expect((await provisioner.provision("instance:one")).status).toBe("ready");
        expect(calls.filter((step) => step === "administrator")).toHaveLength(1);
        expect(cleanupAttempts).toBe(2);
        expect(transitions.record?.status).toBe("succeeded");
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

    test("does not fail or overwrite a transition after losing its lease", async () => {
        const registry = new MemoryRegistry(instance());
        const transitions = new MemoryTransitions();
        transitions.renewResult = false;
        const provisioner = new OfficialInstanceProvisioner(
            registry,
            transitions,
            async () => {
                await Bun.sleep(10);
                return target([], async () => undefined);
            },
            administratorCredentials(),
            () => new Date(),
            3,
        );

        await expect(provisioner.provision("instance:one")).rejects.toThrow("lease was lost");
        expect(transitions.record?.status).toBe("running");
        expect((await registry.get("instance:one"))?.status).toBe("provisioning");
    });

    test("does not overwrite instance state when failure persistence loses ownership", async () => {
        const registry = new MemoryRegistry(instance());
        const transitions = new MemoryTransitions();
        transitions.allowFinish = false;
        const provisioner = createProvisioner(registry, transitions, [], async () => {
            throw new Error("repository unavailable");
        });

        await expect(provisioner.provision("instance:one")).rejects.toThrow("lease was lost");
        expect(transitions.record?.status).toBe("running");
        expect((await registry.get("instance:one"))?.status).toBe("provisioning");
    });
});
