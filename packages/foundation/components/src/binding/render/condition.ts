import { lookup, type Scope } from "../scope";

export function evaluateCondition(expression: string, scope: Scope): boolean {
    const trimmed = expression.trim();
    if (!trimmed) return true;

    const orParts = trimmed.split(/\s*\|\|\s*/);
    if (orParts.length > 1) return orParts.some(part => evaluateCondition(part, scope));

    const andParts = trimmed.split(/\s*&&\s*/);
    if (andParts.length > 1) return andParts.every(part => evaluateCondition(part, scope));

    if (trimmed.startsWith("!")) return !truthyPath(trimmed.slice(1), scope);
    return truthyPath(trimmed, scope);
}

function truthyPath(path: string, scope: Scope): boolean {
    const res = lookup(scope, path.trim());
    return res.found && Boolean(res.value);
}
