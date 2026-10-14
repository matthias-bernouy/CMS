import { isEmpty } from "../../source/presentation/sourceContent";

export type QueryState = {
    loading: boolean;
    loaded: boolean;
    empty: boolean;
    error: boolean;
    refreshing: boolean;
    refreshError: boolean;
    data: unknown;
    status?: number | null;
    message?: string;
};

export function initialQueryState(): QueryState {
    return flags({ loading: false });
}

export function loadingQueryState(): QueryState {
    return flags({ loading: true });
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
