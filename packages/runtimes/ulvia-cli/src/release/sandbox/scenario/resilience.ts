import type { IntegrationMigrationPhase } from "@bernouy/cms-integrations";
import { ReleaseSandboxClient, type ReleaseSandboxInstallation } from "../client";

const PRE_ACTIVATION_PHASES = new Set<IntegrationMigrationPhase>([
    "expand",
    "deploy-functions",
    "smoke-target",
    "provider-direct-transition",
    "switch-cms-binding",
    "smoke-cms",
]);

export async function verifyMigrationCrashRecovery(input: {
    client: ReleaseSandboxClient;
    kind: string;
    sourceVersion: string;
    targetVersion: string;
    phase: IntegrationMigrationPhase;
    restart: () => Promise<ReleaseSandboxClient>;
}): Promise<void> {
    await input.client.expectUpgradeAuditFault(input.kind, input.targetVersion, input.phase);
    const interrupted = await input.client.installation(input.kind);
    assertInterruptedState(interrupted, input.sourceVersion, input.targetVersion, input.phase);

    const resumedClient = await input.restart();
    if (input.phase === "reconcile-declarative") {
        await resumedClient.expectUpgradeFailure(input.kind, input.targetVersion);
        const guarded = await resumedClient.installation(input.kind);
        const operation = guarded.migrationOperation;
        if (!operation || operation.id !== interrupted.migrationOperation?.id || operation.status !== "paused") {
            throw new Error("Ambiguous reconciliation did not fail closed after restart");
        }
        await resumedClient.authorizeAmbiguousReconciliationRetry(input.kind, operation);
    }
    await resumedClient.upgrade(input.kind, input.targetVersion);
    const completed = await resumedClient.installation(input.kind);
    assertCompletedState(completed, interrupted, input.targetVersion);
}

function assertInterruptedState(
    installation: ReleaseSandboxInstallation,
    sourceVersion: string,
    targetVersion: string,
    phase: IntegrationMigrationPhase,
): void {
    const operation = installation.migrationOperation;
    if (installation.status !== "failed" || !operation || operation.status !== "paused") {
        throw new Error(`Migration fault after "${phase}" did not leave a durable paused operation`);
    }
    if (operation.currentVersion !== sourceVersion || operation.targetVersion !== targetVersion) {
        throw new Error(`Migration fault after "${phase}" changed the persisted upgrade identity`);
    }
    const entry = operation.journal.find((candidate) => candidate.phase === phase);
    if (entry?.status !== "failed" || !entry.error?.message?.includes("Ulvia audit injected a crash")) {
        throw new Error(`Migration fault after "${phase}" was not persisted in the journal`);
    }
    if (PRE_ACTIVATION_PHASES.has(phase)) {
        if (installation.definitionVersion !== sourceVersion || operation.activatedAt) {
            throw new Error(`Migration target became active before pre-activation phase "${phase}" was confirmed`);
        }
        return;
    }
    if (installation.definitionVersion !== targetVersion || !operation.activatedAt) {
        throw new Error(`Migration target was not durably active before post-activation phase "${phase}"`);
    }
    if (phase === "drain" && operation.pointOfNoReturnReachedAt) {
        throw new Error("Migration crossed its point of no return before the drain was confirmed");
    }
    if ((phase === "point-of-no-return" || phase === "contract") && !operation.pointOfNoReturnReachedAt) {
        throw new Error(`Migration phase "${phase}" ran before its durable point of no return`);
    }
}

function assertCompletedState(
    installation: ReleaseSandboxInstallation,
    interrupted: ReleaseSandboxInstallation,
    targetVersion: string,
): void {
    const operation = installation.migrationOperation;
    if (
        installation.status !== "success" ||
        installation.definitionVersion !== targetVersion ||
        operation?.status !== "completed" ||
        operation.id !== interrupted.migrationOperation?.id ||
        operation.journal.some((entry) => entry.status !== "succeeded")
    ) {
        throw new Error("Migration did not resume its journal to a single completed target activation");
    }
    if (installation.runCount !== interrupted.runCount + 1) {
        throw new Error("Migration recovery committed the integration run more than once");
    }
}
