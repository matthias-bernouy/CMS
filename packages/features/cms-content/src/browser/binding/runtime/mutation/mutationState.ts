import { CONDITION_ATTR, SOURCE_ATTR, SOURCE_ID_ATTR, type SourceState } from "../../core/attrs";
import { type Scope } from "../../core/scope";

export type MutationState = {
    loading: boolean;
    loaded: boolean;
    empty: boolean;
    error: boolean;
    data?: unknown;
    refreshing?: boolean;
    refreshError?: boolean;
    status?: unknown;
    message?: unknown;
};

export type MutationStateOptions = {
    setMutationState?: (source: Element, status: MutationState) => void;
    mutationStatesFor?: (source: Element, current: MutationState) => Record<string, MutationState>;
};

export function sourceStatusConditions(fragment: DocumentFragment): Set<SourceState> {
    const states = new Set<SourceState>();
    const roots = Array.from(fragment.children);
    const descendants = Array.from(fragment.querySelectorAll(`[${CONDITION_ATTR}]`));
    for (const element of [...roots, ...descendants]) {
        for (const state of sourceStatusConditionStates(element.getAttribute(CONDITION_ATTR))) {
            states.add(state);
        }
    }
    return states;
}

export function mutationState(state: SourceState, value: unknown): MutationState {
    const status = isStatusObject(value) ? value.status : undefined;
    const message = isStatusObject(value) ? value.message : undefined;
    return {
        loading: state === "loading",
        loaded: state === "loaded",
        empty: state === "empty",
        error: state === "error",
        ...(state === "loaded" || state === "empty" ? { data: value } : {}),
        ...(status === undefined ? {} : { status }),
        ...(message === undefined ? {} : { message }),
    };
}

export function publishMutationState(source: Element, status: MutationState, options: MutationStateOptions): void {
    options.setMutationState?.(source, status);
}

export function scopeForMutationState(
    source: Element,
    alias: string | undefined,
    sourceStatus: MutationState,
    value: unknown,
    options: MutationStateOptions,
): Scope {
    const sources = options.mutationStatesFor?.(source, sourceStatus) ?? localMutationStateScope(source, sourceStatus);
    const vars: Record<string, unknown> = { $source: sourceStatus, $sources: sources };
    if (alias) {
        vars[alias] = value;
    }
    return { value, vars };
}

function sourceStatusConditionStates(value: string | null): SourceState[] {
    const states: SourceState[] = [];
    for (const match of (value ?? "").matchAll(
        /(?:\$source|\$sources\.[A-Za-z_$][\w$-]*)\.(loaded|loading|empty|error)/g,
    )) {
        states.push(match[1] as SourceState);
    }
    return states;
}

function isStatusObject(value: unknown): value is { status: unknown; message: unknown } {
    return typeof value === "object" && value !== null && ("status" in value || "message" in value);
}

function localMutationStateScope(source: Element, status: MutationState): Record<string, MutationState> {
    const id = source.getAttribute(SOURCE_ID_ATTR)?.trim();
    return id ? { [id]: status } : {};
}

export function mutationStateScope(
    root: Element,
    statesByMutation: Map<Element, MutationState>,
    source: Element,
    current: MutationState,
): Record<string, MutationState> {
    const states: Record<string, MutationState> = {};
    for (const element of mutationPath(root, source)) {
        const id = element.hasAttribute(SOURCE_ATTR) ? element.getAttribute(SOURCE_ID_ATTR)?.trim() : undefined;
        const state = element === source ? current : statesByMutation.get(element);
        if (id && state) {
            states[id] = state;
        }
    }
    return states;
}

function mutationPath(root: Element, source: Element): Element[] {
    const path: Element[] = [];
    for (
        let element: Element | null = source;
        element && element !== root.parentElement;
        element = element.parentElement
    ) {
        path.push(element);
        if (element === root) {
            break;
        }
    }
    return path.reverse();
}
