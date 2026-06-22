import { lookup, type Scope } from "../scope";

export function evaluateCondition(expression: string, scope: Scope): boolean {
    const trimmed = expression.trim();
    if (!trimmed) return true;

    if (trimmed.startsWith("!")) return !truthyPath(trimmed.slice(1), scope);
    return truthyPath(trimmed, scope);
}

function truthyPath(path: string, scope: Scope): boolean {
    const res = lookup(scope, path.trim());
    return res.found && Boolean(res.value);
}
