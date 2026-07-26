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

/**
 * Turns the confirmation contract of a durable side-effect into the following
 * smoke phase. Production composition uses this to prove that the exact
 * Function deployment and CMS Source binding recorded in the journal remain
 * observable before advancing the saga.
 */
export class ConfirmedMigrationPhaseProbe implements IntegrationMigrationProbe {
    constructor(
        private readonly precedingPhase: "deploy-functions" | "switch-cms-binding",
        private readonly handler: IntegrationMigrationExternalPhaseHandler,
    ) {}

    async run(context: IntegrationMigrationStepContext) {
        const expectedSmoke = this.precedingPhase === "deploy-functions" ? "smoke-target" : "smoke-cms";
        if (context.phase !== expectedSmoke) {
            throw new IntegrationRuntimeError(
                `confirmation probe for "${this.precedingPhase}" cannot execute phase "${context.phase}"`,
            );
        }
        const entry = context.operation.journal.find((candidate) => candidate.phase === this.precedingPhase);
        if (entry?.status !== "succeeded" || entry.confirmationDigest !== entry.targetDigest) {
            throw new IntegrationRuntimeError(
                `migration phase "${this.precedingPhase}" has no confirmed receipt for the target package`,
            );
        }
        const confirmed = await this.handler.confirm(
            { ...context, phase: this.precedingPhase },
            {
                ...(entry.externalOperationId ? { externalOperationId: entry.externalOperationId } : {}),
                ...(entry.confirmationDigest ? { confirmationDigest: entry.confirmationDigest } : {}),
            },
        );
        if (!confirmed.confirmed) {
            throw new IntegrationRuntimeError(
                `migration phase "${this.precedingPhase}" is no longer confirmed by its target`,
                409,
            );
        }
        return {
            ...(confirmed.externalOperationId ? { externalOperationId: confirmed.externalOperationId } : {}),
        };
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
