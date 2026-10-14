import type { Scope } from "../../core/scope";
import type { QueryOutcome } from "../query/queryState";

export type MutationState = {
    readonly activity: "idle" | "submitting";
    readonly hasData: boolean;
    readonly data: unknown;
    readonly outcome: QueryOutcome;
    readonly input?: unknown;
};

export function initialMutationState(input?: unknown): MutationState {
    return {
        activity: "idle",
        hasData: false,
        data: null,
        outcome: { kind: "none" },
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
        ...(input === undefined ? {} : { input }),
    };
}

export function mutationScope(alias: string, state: MutationState): Scope {
    return { value: state, vars: { [alias]: state } };
}
