import type { Scope } from "../../core/scope";
import type { QueryOutcome } from "../query/queryState";

type MutationSuccess = {
    readonly requestId: string;
    readonly status: number;
    readonly data: unknown;
};

export type MutationState = {
    readonly activity: "idle" | "submitting";
    readonly hasData: boolean;
    readonly data: unknown;
    readonly outcome: QueryOutcome;
    readonly lastSuccess: MutationSuccess | null;
    readonly input?: unknown;
};

export function initialMutationState(input?: unknown): MutationState {
    return {
        activity: "idle",
        hasData: false,
        data: null,
        outcome: { kind: "none" },
        lastSuccess: null,
        ...(input === undefined ? {} : { input }),
    };
}

export function submittingMutationState(current: MutationState, input?: unknown): MutationState {
    return { ...current, activity: "submitting", ...(input === undefined ? {} : { input }) };
}

export function completedMutationState(
    current: MutationState,
    result: { readonly ok: boolean; readonly body: unknown; readonly outcome?: QueryOutcome },
    input?: unknown,
): MutationState {
    const outcome: QueryOutcome =
        result.outcome ??
        (result.ok
            ? { kind: "success", status: 200 }
            : { kind: "failure", code: "invalid_response", retryable: false });
    return {
        activity: "idle",
        hasData: result.ok,
        data: result.ok ? result.body : current.data,
        outcome,
        lastSuccess:
            result.ok && outcome.kind === "success"
                ? { requestId: outcome.requestId ?? crypto.randomUUID(), status: outcome.status, data: result.body }
                : current.lastSuccess,
        ...(input === undefined ? {} : { input }),
    };
}

export function mutationScope(alias: string, state: MutationState): Scope {
    return { value: state, vars: { [alias]: state } };
}
