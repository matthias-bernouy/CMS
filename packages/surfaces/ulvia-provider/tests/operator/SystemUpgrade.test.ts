import { expect, test } from "bun:test";
import { OfficialInstanceProvisioner } from "../../src/exports/index";
import {
    SYSTEM_PLAN,
    MemoryRegistry,
    MemoryTransitions,
    administratorCredentials,
    instance,
    target,
} from "./provisioningFixtures";

const next = {
    manifest: { ...SYSTEM_PLAN.manifest, version: "1.1.0", digest: `sha256:${"c".repeat(64)}` },
    contracts: [{ ...SYSTEM_PLAN.contracts[0]!, version: "1.1.0", digest: `sha256:${"d".repeat(64)}` }],
};

test("system upgrade changes exact pins without reinitializing accounts, setup or Repository settings", async () => {
    const settings = { url: "https://custom.example", configured: true };
    const registry = new MemoryRegistry({ ...instance("ready"), repository: settings });
    const transitions = new MemoryTransitions();
    const calls: string[] = [];
    const provisioner = new OfficialInstanceProvisioner(
        registry,
        transitions,
        async (_instance, transition) => {
            expect(transition.sourcePlan).toEqual(SYSTEM_PLAN);
            return target(calls, async () => {
                throw new Error("Existing setup must not be initialized");
            });
        },
        { ...administratorCredentials(), authorizeExtension: async () => true },
    );
    const result = await provisioner.upgradeSystem("instance:one", SYSTEM_PLAN, next, 1, "local:admin");
    expect(result.status).toBe("ready");
    expect(result.systemPlan).toEqual(next);
    expect(result.repository).toEqual(settings);
    expect(calls).toEqual(["manifest", "provider", "contracts"]);
    expect(transitions.record?.kind).toBe("upgrade");
    expect(transitions.record?.status).toBe("succeeded");
});

test("system upgrade fences partial work and resumes only unfinished steps with current administrator authority", async () => {
    const registry = new MemoryRegistry(instance("ready"));
    const transitions = new MemoryTransitions();
    const calls: string[] = [];
    let allowed = true;
    let fail = true;
    const provisioner = new OfficialInstanceProvisioner(
        registry,
        transitions,
        async () => ({
            ...target(calls, async () => undefined),
            selectContracts: async () => {
                calls.push("contracts");
                if (fail) {
                    throw new Error("Interrupted selection switch");
                }
            },
        }),
        { ...administratorCredentials(), authorizeExtension: async () => allowed },
    );
    await expect(provisioner.upgradeSystem("instance:one", SYSTEM_PLAN, next, 1, "local:admin")).rejects.toThrow(
        "Interrupted",
    );
    expect((await registry.get("instance:one"))?.status).toBe("upgrading");
    expect(transitions.record?.completedSteps).toEqual(["manifest", "provider"]);
    allowed = false;
    fail = false;
    await expect(provisioner.resumeSystemUpgrade("instance:one", "local:admin")).rejects.toThrow("administrator");
    expect(calls).toEqual(["manifest", "provider", "contracts"]);
    allowed = true;
    expect((await provisioner.resumeSystemUpgrade("instance:one", "local:admin")).status).toBe("ready");
    expect(calls).toEqual(["manifest", "provider", "contracts", "contracts"]);
    expect(transitions.record?.status).toBe("succeeded");
});

test("system upgrade refuses stale revisions, foreign administrators and dropped families before journaling", async () => {
    for (const mode of ["stale", "foreign", "drop"] as const) {
        const registry = new MemoryRegistry(instance("ready"));
        const before = structuredClone(await registry.get("instance:one"));
        const transitions = new MemoryTransitions();
        const calls: string[] = [];
        const provisioner = new OfficialInstanceProvisioner(
            registry,
            transitions,
            async () => target(calls, async () => undefined),
            {
                ...administratorCredentials(),
                authorizeExtension: async () => mode !== "foreign",
            },
        );
        await expect(
            provisioner.upgradeSystem(
                "instance:one",
                SYSTEM_PLAN,
                mode === "drop" ? { ...next, contracts: [] } : next,
                mode === "stale" ? 2 : 1,
                "local:admin",
            ),
        ).rejects.toThrow();
        expect(await registry.get("instance:one")).toEqual(before);
        expect(transitions.record).toBeNull();
        expect(calls).toEqual([]);
    }
});

test("a lost upgrade completion acknowledgement resumes without repeating services", async () => {
    const registry = new MemoryRegistry(instance("ready"));
    const transitions = new MemoryTransitions();
    const original = transitions.succeed.bind(transitions);
    let fail = true;
    transitions.succeed = async (...args) => {
        if (fail) {
            throw new Error("Acknowledgement lost");
        }
        return original(...args);
    };
    const calls: string[] = [];
    const provisioner = new OfficialInstanceProvisioner(
        registry,
        transitions,
        async () => target(calls, async () => undefined),
        {
            ...administratorCredentials(),
            authorizeExtension: async () => true,
        },
    );
    await expect(provisioner.upgradeSystem("instance:one", SYSTEM_PLAN, next, 1, "local:admin")).rejects.toThrow(
        "Acknowledgement",
    );
    expect((await registry.get("instance:one"))?.status).toBe("ready");
    fail = false;
    await provisioner.resumeSystemUpgrade("instance:one", "local:admin");
    expect(calls).toEqual(["manifest", "provider", "contracts"]);
    expect(transitions.record?.status).toBe("succeeded");
});
