import { readFile, writeFile } from "node:fs/promises";
import type {
    IntegrationMigrationPhase,
    IntegrationMigrationRuntime,
    IntegrationMigrationStepContext,
    IntegrationMigrationStepResult,
} from "@bernouy/cms-integrations";
import { BSON } from "mongodb";

type RemoteRecord = {
    idempotencyKey: string;
    phase: IntegrationMigrationPhase;
    executions: number;
    result: IntegrationMigrationStepResult;
};

type RemoteState = { records: RemoteRecord[] };

export class PersistentMigrationRuntime implements IntegrationMigrationRuntime {
    constructor(private readonly path: string) {}

    async executeStep(context: IntegrationMigrationStepContext): Promise<IntegrationMigrationStepResult> {
        const state = await readState(this.path);
        const existing = state.records.find(({ idempotencyKey }) => idempotencyKey === context.idempotencyKey);
        if (existing) {
            return structuredClone(existing.result);
        }
        const result: IntegrationMigrationStepResult = {
            confirmationDigest: context.targetDigest,
            externalOperationId: `external:${context.idempotencyKey}`,
            ...(context.phase === "switch-cms-binding"
                ? {
                      importResult: {
                          artifacts: [{ type: "source", id: "commerce-api", action: "updated" }],
                          connectors: [
                              {
                                  provider: "supabase",
                                  connectorKey: "primary",
                                  outputs: { functionsBaseUrl: "https://target.example/functions/v1" },
                              },
                          ],
                      },
                  }
                : {}),
        };
        state.records.push({
            idempotencyKey: context.idempotencyKey,
            phase: context.phase,
            executions: 1,
            result,
        });
        await writeState(this.path, state);
        return structuredClone(result);
    }

    async confirmStep(context: IntegrationMigrationStepContext) {
        const state = await readState(this.path);
        const record = state.records.find(({ idempotencyKey }) => idempotencyKey === context.idempotencyKey);
        return record ? { confirmed: true as const, ...structuredClone(record.result) } : { confirmed: false as const };
    }

    async executionCounts(): Promise<ReadonlyMap<IntegrationMigrationPhase, number>> {
        const state = await readState(this.path);
        const counts = new Map<IntegrationMigrationPhase, number>();
        for (const record of state.records) {
            counts.set(record.phase, (counts.get(record.phase) ?? 0) + record.executions);
        }
        return counts;
    }
}

async function readState(path: string): Promise<RemoteState> {
    try {
        const bytes = await readFile(path);
        const value = BSON.deserialize(bytes) as Partial<RemoteState>;
        return { records: Array.isArray(value.records) ? value.records : [] };
    } catch (error) {
        if (isNotFound(error)) {
            return { records: [] };
        }
        throw error;
    }
}

async function writeState(path: string, state: RemoteState): Promise<void> {
    await writeFile(path, BSON.serialize(state));
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
