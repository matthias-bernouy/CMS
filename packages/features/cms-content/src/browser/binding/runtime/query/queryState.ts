export type QueryOutcome =
    | { readonly kind: "none" }
    | { readonly kind: "success"; readonly status: number; readonly requestId?: string }
    | {
          readonly kind: "error";
          readonly code: string;
          readonly output?: unknown;
          readonly retryable: boolean;
          readonly status: number;
          readonly requestId?: string;
      }
    | {
          readonly kind: "failure";
          readonly code: string;
          readonly retryable: boolean;
          readonly status?: number;
          readonly requestId?: string;
      };

export type QueryState = {
    readonly activity: "idle" | "waiting" | "fetching";
    readonly hasData: boolean;
    readonly data: unknown;
    readonly outcome: QueryOutcome;
    readonly input?: unknown;
};

export function initialQueryState(): QueryState {
    return state();
}

export function isQueryState(value: unknown): value is QueryState {
    if (!isRecord(value) || !["idle", "waiting", "fetching"].includes(String(value.activity))) {
        return false;
    }
    if (typeof value.hasData !== "boolean" || !("data" in value) || !isRecord(value.outcome)) {
        return false;
    }
    return isQueryOutcome(value.outcome);
}

export function waitingQueryState(): QueryState {
    return state({ activity: "waiting" });
}

export function fetchingQueryState(current: QueryState): QueryState {
    return { ...current, activity: "fetching" };
}

export function successfulQueryState(
    current: QueryState,
    data: unknown,
    result: { readonly status: number; readonly requestId?: string },
): QueryState {
    return state({
        data,
        hasData: true,
        outcome: {
            kind: "success",
            status: result.status,
            ...(result.requestId ? { requestId: result.requestId } : {}),
        },
        ...(current.input === undefined ? {} : { input: current.input }),
    });
}

export function failedQueryState(
    current: QueryState,
    outcome: Exclude<QueryOutcome, { kind: "none" | "success" }>,
): QueryState {
    return state({
        data: current.data,
        hasData: current.hasData,
        outcome,
        ...(current.input === undefined ? {} : { input: current.input }),
    });
}

function state(values: Partial<QueryState> = {}): QueryState {
    return {
        activity: "idle",
        hasData: false,
        data: null,
        outcome: { kind: "none" },
        ...values,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQueryOutcome(value: Record<string, unknown>): value is QueryOutcome {
    if (value.kind === "none") {
        return true;
    }
    if (value.kind === "success") {
        return typeof value.status === "number" && isOptionalString(value.requestId);
    }
    if (value.kind !== "error" && value.kind !== "failure") {
        return false;
    }
    if (typeof value.code !== "string" || typeof value.retryable !== "boolean" || !isOptionalString(value.requestId)) {
        return false;
    }
    return value.kind === "failure" ? isOptionalNumber(value.status) : typeof value.status === "number";
}

function isOptionalString(value: unknown): boolean {
    return value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): boolean {
    return value === undefined || typeof value === "number";
}
