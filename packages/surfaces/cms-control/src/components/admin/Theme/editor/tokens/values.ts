import type { ThemeDefinition, ThemeMode, ThemeSettings, ThemeSource, ThemeToken } from "@bernouy/cms-content";

import { directTokenReference, parseDirectTokenReference } from "./cssReference";

export type ThemeTokenEntry = {
    source: ThemeSource;
    category: ThemeSource["categories"][number];
    token: ThemeToken;
};

export type ResolvedThemeValue = {
    raw: string;
    value: string;
    reference?: ThemeTokenEntry;
    state: "literal" | "resolved" | "missing" | "cycle";
};

export function themeTokenEntries(settings: ThemeSettings): ThemeTokenEntry[] {
    return settings.sources.flatMap((source) =>
        source.categories.flatMap((category) => category.tokens.map((token) => ({ source, category, token }))),
    );
}

export function effectiveTokenValue(token: ThemeToken, theme: ThemeDefinition, mode: ThemeMode): string {
    const direct = theme.values[mode]?.[token.id] ?? token.defaults?.[mode];
    if (direct !== undefined || mode === "light") {
        return direct ?? "";
    }
    return theme.values.light?.[token.id] ?? token.defaults?.light ?? "";
}

export function resolveThemeTokenValue(
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
    tokenId: string,
): ResolvedThemeValue {
    const entries = themeTokenEntries(settings);
    const byId = new Map(entries.map((entry) => [entry.token.id, entry]));
    const byVariable = new Map(entries.map((entry) => [entry.token.variable, entry]));
    const initial = byId.get(tokenId);
    if (!initial) {
        return { raw: "", value: "", state: "missing" };
    }
    const raw = effectiveTokenValue(initial.token, theme, mode);
    return followValue(raw, theme, mode, byVariable, new Set([initial.token.id]));
}

export function canReferenceThemeToken(
    settings: ThemeSettings,
    theme: ThemeDefinition,
    mode: ThemeMode,
    tokenId: string,
    targetId: string,
): boolean {
    const entries = themeTokenEntries(settings);
    const byId = new Map(entries.map((entry) => [entry.token.id, entry]));
    const byVariable = new Map(entries.map((entry) => [entry.token.variable, entry]));
    const current = byId.get(tokenId);
    let target = byId.get(targetId);
    if (
        !current ||
        !target ||
        current.token.id === target.token.id ||
        !compatibleTokenTypes(current.token, target.token) ||
        !compatibleTokenOwners(current, target)
    ) {
        return false;
    }
    const visited = new Set<string>();
    while (target) {
        if (target.token.id === current.token.id || visited.has(target.token.id)) {
            return false;
        }
        visited.add(target.token.id);
        const reference = directTokenReference(effectiveTokenValue(target.token, theme, mode));
        target = reference ? byVariable.get(reference) : undefined;
    }
    return true;
}

function compatibleTokenTypes(current: ThemeToken, target: ThemeToken): boolean {
    return current.type === "value" || current.type === target.type;
}

function compatibleTokenOwners(current: ThemeTokenEntry, target: ThemeTokenEntry): boolean {
    const currentOwner = current.source.owner;
    const targetOwner = target.source.owner;
    return (
        currentOwner?.kind !== "integration" ||
        targetOwner?.kind !== "integration" ||
        currentOwner.integrationId === targetOwner.integrationId
    );
}

export function themeReferenceCycles(settings: ThemeSettings, theme: ThemeDefinition, mode: ThemeMode): string[] {
    return themeTokenEntries(settings)
        .filter((entry) => resolveThemeTokenValue(settings, theme, mode, entry.token.id).state === "cycle")
        .map((entry) => entry.token.label);
}

function followValue(
    raw: string,
    theme: ThemeDefinition,
    mode: ThemeMode,
    byVariable: Map<string, ThemeTokenEntry>,
    visited: Set<string>,
): ResolvedThemeValue {
    const reference = parseDirectTokenReference(raw);
    if (!reference) {
        return { raw, value: raw, state: "literal" };
    }
    const target = byVariable.get(reference.variable);
    if (!target) {
        return reference.fallback
            ? resolvedFallback(raw, reference.fallback, theme, mode, byVariable, visited)
            : { raw, value: raw, state: "missing" };
    }
    if (visited.has(target.token.id)) {
        return reference.fallback
            ? resolvedFallback(raw, reference.fallback, theme, mode, byVariable, visited)
            : { raw, value: raw, reference: target, state: "cycle" };
    }
    visited.add(target.token.id);
    const resolved = followValue(effectiveTokenValue(target.token, theme, mode), theme, mode, byVariable, visited);
    if ((resolved.state === "missing" || resolved.state === "cycle") && reference.fallback) {
        return resolvedFallback(raw, reference.fallback, theme, mode, byVariable, visited);
    }
    return { ...resolved, raw, reference: target, state: resolved.state === "literal" ? "resolved" : resolved.state };
}

function resolvedFallback(
    raw: string,
    fallback: string,
    theme: ThemeDefinition,
    mode: ThemeMode,
    byVariable: Map<string, ThemeTokenEntry>,
    visited: Set<string>,
): ResolvedThemeValue {
    const resolved = followValue(fallback, theme, mode, byVariable, new Set(visited));
    return { ...resolved, raw, state: resolved.state === "literal" ? "resolved" : resolved.state };
}
