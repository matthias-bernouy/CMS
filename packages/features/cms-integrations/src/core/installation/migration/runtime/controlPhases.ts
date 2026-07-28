import { IntegrationRuntimeError } from "../../../errors";
import type {
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationPhase,
    IntegrationMigrationProbe,
    IntegrationMigrationStepContext,
} from "../../../../interfaces/IntegrationConnectorDeployer";

export class ProbeMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    constructor(
        private readonly phase: "smoke-target" | "smoke-cms",
        private readonly probe: IntegrationMigrationProbe,
    ) {}

    async execute(context: IntegrationMigrationStepContext) {
        this.assertPhase(context.phase);
        return await this.probe.run(context);
    }

    async confirm(context: IntegrationMigrationStepContext) {
        this.assertPhase(context.phase);
        const result = await this.probe.run(context);
        return { confirmed: true, ...result };
    }

    private assertPhase(actual: IntegrationMigrationPhase): void {
        if (actual !== this.phase) {
            throw new IntegrationRuntimeError(`probe for "${this.phase}" cannot execute phase "${actual}"`);
        }
    }
}

export class DrainMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    constructor(private readonly clock: { now(): Date }) {}

    async execute(context: IntegrationMigrationStepContext) {
        const notBefore = drainNotBefore(context);
        if (this.clock.now().getTime() < notBefore.getTime()) {
            throw new IntegrationRuntimeError(`migration drain period is active until ${notBefore.toISOString()}`, 409);
        }
        return { externalOperationId: `drain:${notBefore.toISOString()}` };
    }

    async confirm(context: IntegrationMigrationStepContext) {
        const notBefore = drainNotBefore(context);
        return {
            confirmed: this.clock.now().getTime() >= notBefore.getTime(),
            externalOperationId: `drain:${notBefore.toISOString()}`,
        };
    }
}

export class PointOfNoReturnMigrationHandler implements IntegrationMigrationExternalPhaseHandler {
    async execute(context: IntegrationMigrationStepContext) {
        assertPointOfNoReturn(context);
        return { externalOperationId: `point-of-no-return:${context.operation.id}` };
    }

    async confirm(context: IntegrationMigrationStepContext) {
        assertPointOfNoReturn(context);
        return { confirmed: true, externalOperationId: `point-of-no-return:${context.operation.id}` };
    }
}

function drainNotBefore(context: IntegrationMigrationStepContext): Date {
    if (context.phase !== "drain") {
        throw new IntegrationRuntimeError(`drain handler cannot execute phase "${context.phase}"`);
    }
    if (!context.operation.activatedAt) {
        throw new IntegrationRuntimeError("migration drain cannot start before target activation");
    }
    const seconds = context.connectors.reduce(
        (maximum, connector) =>
            Math.max(
                maximum,
                connector.plan.cmsMediated?.drainSeconds ?? 0,
                connector.plan.providerDirect?.drainSeconds ?? 0,
            ),
        0,
    );
    return new Date(context.operation.activatedAt.getTime() + seconds * 1_000);
}

function assertPointOfNoReturn(context: IntegrationMigrationStepContext): void {
    if (context.phase !== "point-of-no-return") {
        throw new IntegrationRuntimeError(`point-of-no-return handler cannot execute phase "${context.phase}"`);
    }
    if (!context.operation.activatedAt) {
        throw new IntegrationRuntimeError("point of no return cannot precede target activation");
    }
    const drain = context.operation.journal.find((entry) => entry.phase === "drain");
    if (drain?.status !== "succeeded") {
        throw new IntegrationRuntimeError("point of no return requires a confirmed drain period");
    }
}
