import { isEmpty } from "../../reactive/renderer/bindingContent";

export type QueryState = {
    waiting: boolean;
    loading: boolean;
    loaded: boolean;
    empty: boolean;
    error: boolean;
    refreshing: boolean;
    refreshError: boolean;
    data: unknown;
    input?: unknown;
    status?: number | null;
    message?: string;
};

export function initialQueryState(): QueryState {
    return flags({ loading: false });
}

export function isQueryState(value: unknown): value is QueryState {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const state = value as Record<string, unknown>;
    return (
        typeof state.loading === "boolean" &&
        typeof state.waiting === "boolean" &&
        typeof state.loaded === "boolean" &&
        typeof state.empty === "boolean" &&
        typeof state.error === "boolean" &&
        typeof state.refreshing === "boolean" &&
        typeof state.refreshError === "boolean" &&
        "data" in state
    );
}

export function loadingQueryState(): QueryState {
    return flags({ loading: true });
}

export function waitingQueryState(): QueryState {
    return flags({ waiting: true });
}

export function loadedQueryState(data: unknown): QueryState {
    return flags({ loaded: true, empty: isEmpty(data), data });
}

export function failedQueryState(status: number | null, message: string): QueryState {
    return flags({ error: true, status, message });
}

export function refreshingQueryState(current: QueryState): QueryState {
    return { ...current, refreshing: true, refreshError: false, status: undefined, message: undefined };
}

export function refreshFailedQueryState(current: QueryState, status: number | null, message: string): QueryState {
    return { ...current, refreshing: false, refreshError: true, status, message };
}

function flags(values: Partial<QueryState>): QueryState {
    return {
        waiting: false,
        loading: false,
        loaded: false,
        empty: false,
        error: false,
        refreshing: false,
        refreshError: false,
        data: null,
        ...values,
    };
}
