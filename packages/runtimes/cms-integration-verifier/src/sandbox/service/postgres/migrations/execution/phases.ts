export type MigrationVerificationPhase = "fresh" | "source" | "migration" | "equivalence" | "replay";

export class MigrationVerificationPhaseError extends Error {
    readonly phase: MigrationVerificationPhase;

    constructor(phase: MigrationVerificationPhase, cause: unknown) {
        super(`PostgreSQL migration ${phase} proof failed`, { cause });
        this.name = "MigrationVerificationPhaseError";
        this.phase = phase;
    }
}

export async function inMigrationVerificationPhase<T>(
    phase: MigrationVerificationPhase,
    action: () => Promise<T>,
): Promise<T> {
    try {
        return await action();
    } catch (error) {
        if (error instanceof MigrationVerificationPhaseError || error instanceof TypeError || isResetFailure(error)) {
            throw error;
        }
        throw new MigrationVerificationPhaseError(phase, error);
    }
}

export function migrationVerificationPhase(error: unknown): MigrationVerificationPhase {
    return error instanceof MigrationVerificationPhaseError ? error.phase : "fresh";
}

export function migrationVerificationCause(error: unknown): unknown {
    return error instanceof MigrationVerificationPhaseError ? error.cause : error;
}

function isResetFailure(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith("Disposable PostgreSQL reset");
}
