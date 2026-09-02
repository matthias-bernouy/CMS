import { describe, expect, test } from "bun:test";
import type {
    IntegrationInstallation,
    IntegrationInstallationRepository,
    IntegrationMigrationRuntime,
    IntegrationMigrationStepContext,
} from "@bernouy/cms-integrations";
import {
    injectLocalMigrationAuditFault,
    injectLocalMigrationReconciliationAuditFault,
} from "../../src/runtime/integrations/auditFault";

describe("local migration audit fault", () => {
    test("fails once after the selected remote phase succeeds", async () => {
        let executions = 0;
        const runtime: IntegrationMigrationRuntime = {
            async executeStep(context) {
                executions += 1;
                return { confirmationDigest: context.targetDigest };
            },
            async confirmStep(context) {
                return { confirmed: true, confirmationDigest: context.targetDigest };
            },
        };
        const faulted = injectLocalMigrationAuditFault(runtime, "expand");
        const context = {
            phase: "expand",
            targetDigest: "a".repeat(64),
        } as IntegrationMigrationStepContext;

        await expect(faulted.executeStep(context)).rejects.toThrow(/injected a crash after migration phase "expand"/);
        await expect(faulted.executeStep(context)).resolves.toEqual({ confirmationDigest: "a".repeat(64) });
        expect(executions).toBe(2);
        expect(injectLocalMigrationAuditFault(runtime, undefined)).toBe(runtime);
    });

    test("also fails after a successful confirmation of a previously paused phase", async () => {
        const runtime: IntegrationMigrationRuntime = {
            async executeStep() {
                throw new Error("phase is not ready yet");
            },
            async confirmStep(context) {
                return { confirmed: true, confirmationDigest: context.targetDigest };
            },
        };
        const faulted = injectLocalMigrationAuditFault(runtime, "drain");
        const context = {
            phase: "drain",
            targetDigest: "a".repeat(64),
        } as IntegrationMigrationStepContext;

        await expect(faulted.executeStep(context)).rejects.toThrow(/not ready/u);
        await expect(faulted.confirmStep(context, {})).rejects.toThrow(/after migration phase "drain" confirmation/u);
        await expect(faulted.confirmStep(context, {})).resolves.toMatchObject({ confirmed: true });
    });

    test("fails once after reconciliation effects but before its durable receipt", async () => {
        let saves = 0;
        const repository = {
            list: async () => [],
            get: async () => null,
            create: async () => ({}) as IntegrationInstallation,
            replace: async (installation) => installation,
            compareAndSwapMigration: async (_expected, next) => {
                saves += 1;
                return next;
            },
        } satisfies IntegrationInstallationRepository;
        const faulted = injectLocalMigrationReconciliationAuditFault(repository, "reconcile-declarative");
        const running = installationWithReconciliation("running");
        const succeeded = installationWithReconciliation("succeeded");

        await expect(faulted.compareAndSwapMigration!(running, succeeded)).rejects.toThrow(
            /injected a crash after migration phase "reconcile-declarative"/u,
        );
        await expect(faulted.compareAndSwapMigration!(running, succeeded)).resolves.toBe(succeeded);
        expect(saves).toBe(1);
    });
});

function installationWithReconciliation(status: "running" | "succeeded"): IntegrationInstallation {
    return {
        migrationOperation: { journal: [{ phase: "reconcile-declarative", status }] },
    } as IntegrationInstallation;
}
