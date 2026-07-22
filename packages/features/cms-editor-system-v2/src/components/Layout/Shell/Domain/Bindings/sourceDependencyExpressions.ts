import { parseSourceStatusConditions } from "@bernouy/cms-content/editor";

export type DependencyScope = {
    aliases: Set<string>;
    sourceId?: string;
    sourceLocal: boolean;
};

export function bindingTextDependsOn(value: string, scope: DependencyScope): boolean {
    for (const alias of scope.aliases) {
        if (expressionReferencesScope(value, alias)) {
            return true;
        }
    }

    if (!scope.sourceLocal) {
        return false;
    }
    return containsBindingSyntax(value, scope);
}

export function withoutBindingExpressions(value: string): string {
    return value
        .replace(/\{\{\s*[\s\S]*?\s*\}\}/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function expressionReferencesScope(value: string, scope: string): boolean {
    const escaped = scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Za-z0-9_$])${escaped}(?:\\b|\\s*\\.)`).test(value);
}

function containsBindingSyntax(value: string, scope: DependencyScope): boolean {
    const statusConditions = parseSourceStatusConditions(value);
    if (statusConditions.length > 0) {
        return statusConditions.some((condition) => !condition.sourceId || condition.sourceId === scope.sourceId);
    }

    if (/\S+\s+as\s+[A-Za-z_$][\w$]*\s*$/.test(value)) {
        return true;
    }

    const matches = value.matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g);
    for (const match of matches) {
        const expression = match[1]?.trim() ?? "";
        const head = /^[A-Za-z_$][\w$]*/.exec(expression)?.[0] ?? "";
        if (head && expression[head.length] !== ".") {
            return true;
        }
    }

    return false;
}
