import { describe, expect, test } from "bun:test";
import { OfficialInstanceProvisioner } from "@bernouy/hosting/instances";

import {
    MemoryRegistry,
    MemoryTransitions,
    createProvisioner,
    administratorCredentials,
    instance,
    target,
} from "./fixture";

describe("OfficialInstanceProvisioner", () => {
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
