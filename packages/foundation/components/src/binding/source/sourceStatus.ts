import { CONDITION_ATTR, SOURCE_ID_ATTR, type SourceState } from "../attrs";
import { type Scope } from "../scope";

export type SourceStatusValue = {
    loading: boolean;
    loaded: boolean;
    empty: boolean;
    error: boolean;
    status?: unknown;
    message?: unknown;
};

export type SourceStatusOptions = {
    setSourceStatus?: (source: Element, status: SourceStatusValue) => void;
    sourceStatusesFor?: (source: Element, current: SourceStatusValue) => Record<string, SourceStatusValue>;
};

export function sourceStatusConditions(fragment: DocumentFragment): Set<SourceState> {
    const states = new Set<SourceState>();
    const roots = Array.from(fragment.children);
    const descendants = Array.from(fragment.querySelectorAll(`[${CONDITION_ATTR}]`));
    for (const element of [...roots, ...descendants]) {
        for (const state of sourceStatusConditionStates(element.getAttribute(CONDITION_ATTR))) states.add(state);
    }
    return states;
}

export function statusValue(state: SourceState, value: unknown): SourceStatusValue {
    return {
        loading: state === "loading",
        loaded:  state === "loaded",
        empty:   state === "empty",
        error:   state === "error",
        status:  isStatusObject(value) ? value.status : undefined,
        message: isStatusObject(value) ? value.message : undefined,
    };
}

export function publishSourceStatus(source: Element, status: SourceStatusValue, options: SourceStatusOptions): void {
    options.setSourceStatus?.(source, status);
}

export function scopeForSourceStatus(
    source: Element,
    alias: string | undefined,
    sourceStatus: SourceStatusValue,
    value: unknown,
    options: SourceStatusOptions,
): Scope {
    const sources = options.sourceStatusesFor?.(source, sourceStatus) ?? localSourceStatusScope(source, sourceStatus);
    const vars: Record<string, unknown> = { $source: sourceStatus, $sources: sources };
    if (alias) vars[alias] = value;
    return { value, vars };
}

function sourceStatusConditionStates(value: string | null): SourceState[] {
    const states: SourceState[] = [];
    for (const part of (value ?? "").split(/\s*\|\|\s*/)) {
        const match = /^\s*(?:\$source|\$sources\.[A-Za-z_$][\w$-]*)\.(loaded|loading|empty|error)\s*$/.exec(part);
        if (!match) return [];
        states.push(match[1] as SourceState);
    }
    return states;
}

function isStatusObject(value: unknown): value is { status: unknown; message: unknown } {
    return typeof value === "object" && value !== null && ("status" in value || "message" in value);
}

function localSourceStatusScope(source: Element, status: SourceStatusValue): Record<string, SourceStatusValue> {
    const id = source.getAttribute(SOURCE_ID_ATTR)?.trim();
    return id ? { [id]: status } : {};
}
