import type {
    CapabilityDefinition,
    ConformanceCall,
    ConformanceCallEvidence,
    VerifiedFixtureAsset,
} from "@bernouy/cms-repository/contracts";
import { assertConformanceOutcome, captureConformanceOutput } from "./assertions";
import type {
    ConformanceInvocationOutcome,
    ConformanceInvocationResult,
    ConformanceScenarioEnvironment,
} from "./interfaces";
import { ConformanceExecutionError } from "./interfaces";
import { executePagination } from "./pagination";
import { resolveConformanceTemplate } from "./templates";

export type ConformanceCallSnapshot = Readonly<{
    outcome: ConformanceInvocationOutcome;
    operationId?: string;
}>;

export interface ExecuteConformanceCallInput {
    readonly call: ConformanceCall;
    readonly capability: CapabilityDefinition;
    readonly release: Parameters<ConformanceScenarioEnvironment["invoke"]>[0]["release"];
    readonly environment: ConformanceScenarioEnvironment;
    readonly captures: Map<string, unknown>;
    readonly fixtures: ReadonlyMap<string, VerifiedFixtureAsset>;
    readonly invocationKey?: string;
    readonly replay?: ConformanceCallSnapshot;
    readonly sleep: (milliseconds: number) => Promise<void>;
    readonly now: () => number;
}

export async function executeConformanceCall(
    input: ExecuteConformanceCallInput,
): Promise<{ evidence: ConformanceCallEvidence; snapshot?: ConformanceCallSnapshot }> {
    const started = input.now();
    let attempts = 0;
    try {
        const authoredInput = resolveConformanceTemplate(input.call.input, input.captures) as Readonly<
            Record<string, unknown>
        >;
        let snapshot: ConformanceCallSnapshot;
        if (input.call.pagination) {
            const paginated = await executePagination({ ...input, authoredInput });
            attempts = paginated.attempts;
            snapshot = { outcome: paginated.outcome };
        } else {
            const executed = await executeEventually({ ...input, authoredInput });
            attempts = executed.attempts;
            snapshot = executed.snapshot;
        }
        if (input.replay && !sameSnapshot(input.replay, snapshot)) {
            throw new ConformanceExecutionError("REPLAY_MISMATCH", "Replayed call returned a different result");
        }
        captureConformanceOutput(snapshot.outcome, input.call.captures, input.captures);
        return {
            evidence: {
                id: input.call.id,
                status: "passed",
                attempts,
                durationMs: elapsed(input.now(), started),
            },
            snapshot,
        };
    } catch (error) {
        return {
            evidence: {
                id: input.call.id,
                status: "failed",
                attempts: Math.max(1, attempts),
                durationMs: elapsed(input.now(), started),
                failureCode: error instanceof ConformanceExecutionError ? error.code : "ASSERTION_FAILED",
            },
        };
    }
}

async function executeEventually(
    input: ExecuteConformanceCallInput & { authoredInput: Readonly<Record<string, unknown>> },
): Promise<{ attempts: number; snapshot: ConformanceCallSnapshot }> {
    const policy = input.call.eventually;
    const maximum = policy?.maxAttempts ?? 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maximum; attempt += 1) {
        if (attempt > 1) {
            await input.sleep(policy!.intervalMs);
        }
        try {
            const snapshot = await invokeFinal(input, input.authoredInput);
            assertConformanceOutcome(snapshot.outcome, input.call.expect, input.capability, input.captures);
            return { attempts: attempt, snapshot };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

async function invokeFinal(
    input: ExecuteConformanceCallInput,
    callInput: Readonly<Record<string, unknown>>,
): Promise<ConformanceCallSnapshot> {
    const initial = await input.environment.invoke({
        release: input.release,
        capabilityId: input.call.capabilityId,
        actor: input.call.actor,
        input: callInput,
        ...(input.invocationKey ? { invocationKey: input.invocationKey } : {}),
        fixtures: input.fixtures,
    });
    if (input.capability.behavior.execution === "operation") {
        return finishOperation(input, initial);
    }
    if (initial.kind === "accepted") {
        throw new ConformanceExecutionError("INVALID_ACCEPTANCE", "Synchronous capability returned an operation");
    }
    return { outcome: initial };
}

async function finishOperation(
    input: ExecuteConformanceCallInput,
    initial: ConformanceInvocationResult,
): Promise<ConformanceCallSnapshot> {
    if (!input.call.completion) {
        if (initial.kind === "accepted") {
            throw new ConformanceExecutionError(
                "UNEXPECTED_ACCEPTANCE",
                "Operation was accepted while rejection was expected",
            );
        }
        return { outcome: initial };
    }
    if (initial.kind !== "accepted") {
        throw new ConformanceExecutionError("OPERATION_NOT_ACCEPTED", "Operation did not return an acceptance handle");
    }
    const outcome = await input.environment.complete(initial.operationId, input.call.completion);
    return { outcome, operationId: initial.operationId };
}

function sameSnapshot(left: ConformanceCallSnapshot, right: ConformanceCallSnapshot): boolean {
    return left.operationId === right.operationId && JSON.stringify(left.outcome) === JSON.stringify(right.outcome);
}

function elapsed(now: number, started: number): number {
    return Math.max(0, Math.min(86_400_000, Math.round(now - started)));
}
