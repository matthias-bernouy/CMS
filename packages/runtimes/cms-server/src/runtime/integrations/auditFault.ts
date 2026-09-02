import type {
    IntegrationInstallation,
    IntegrationInstallationRepository,
    IntegrationMigrationPhase,
    IntegrationMigrationRuntime,
    IntegrationMigrationStepContext,
} from "@bernouy/cms-integrations";

export function injectLocalMigrationReconciliationAuditFault(
    repository: IntegrationInstallationRepository,
    phase: IntegrationMigrationPhase | undefined,
): IntegrationInstallationRepository {
    if (phase !== "reconcile-declarative") {
        return repository;
    }
    return new FailOnceBeforeReconciliationReceiptRepository(repository);
}

export function injectLocalMigrationAuditFault(
    runtime: IntegrationMigrationRuntime,
    phase: IntegrationMigrationPhase | undefined,
): IntegrationMigrationRuntime {
    if (!phase) {
        return runtime;
    }
    return new FailOnceAfterMigrationPhaseRuntime(runtime, phase);
}

class FailOnceAfterMigrationPhaseRuntime implements IntegrationMigrationRuntime {
    private injected = false;

    constructor(
        private readonly runtime: IntegrationMigrationRuntime,
        private readonly phase: IntegrationMigrationPhase,
    ) {}

    async executeStep(context: IntegrationMigrationStepContext) {
        const result = await this.runtime.executeStep(context);
        if (!this.injected && context.phase === this.phase) {
            this.injected = true;
            throw new Error(`Ulvia audit injected a crash after migration phase "${this.phase}"`);
        }
        return result;
    }

    async confirmStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        const result = await this.runtime.confirmStep(context, previous);
        if (!this.injected && result.confirmed && context.phase === this.phase) {
            this.injected = true;
            throw new Error(`Ulvia audit injected a crash after migration phase "${this.phase}" confirmation`);
        }
        return result;
    }

    async compensateStep(
        context: IntegrationMigrationStepContext,
        previous: { externalOperationId?: string; confirmationDigest?: string },
    ) {
        if (!this.runtime.compensateStep) {
            throw new Error("Migration runtime does not support compensation");
        }
        return await this.runtime.compensateStep(context, previous);
    }
}

class FailOnceBeforeReconciliationReceiptRepository implements IntegrationInstallationRepository {
    private injected = false;

    constructor(private readonly repository: IntegrationInstallationRepository) {}

    list() {
        return this.repository.list();
    }

    get(id: string) {
        return this.repository.get(id);
    }

    create(input: Parameters<IntegrationInstallationRepository["create"]>[0]) {
        return this.repository.create(input);
    }

    replace(installation: IntegrationInstallation) {
        return this.repository.replace(installation);
    }

    async compareAndSwapMigration(expected: IntegrationInstallation, next: IntegrationInstallation) {
        if (!this.repository.compareAndSwapMigration) {
            throw new Error("Migration audit requires compare-and-swap persistence");
        }
        if (
            !this.injected &&
            reconciliationStatus(expected) === "running" &&
            reconciliationStatus(next) === "succeeded"
        ) {
            this.injected = true;
            throw new Error('Ulvia audit injected a crash after migration phase "reconcile-declarative"');
        }
        return await this.repository.compareAndSwapMigration(expected, next);
    }
}

function reconciliationStatus(installation: IntegrationInstallation): string | undefined {
    return installation.migrationOperation?.journal.find((entry) => entry.phase === "reconcile-declarative")?.status;
}
