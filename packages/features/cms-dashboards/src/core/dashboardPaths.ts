const PATH_SEGMENT = /^[A-Za-z_$][\w$]*$/;
const EXPRESSION = /^\$([A-Za-z]+)(?:\.(.+))?$/;
const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export function dashboardPathSegments(value: string): string[] | null {
    const segments = value.split(".");
    if (!segments.length || segments.some(segment => (
        !PATH_SEGMENT.test(segment) || UNSAFE_PATH_SEGMENTS.has(segment)
    ))) return null;
    return segments;
}

export function isSafeDashboardPath(value: string): boolean {
    return dashboardPathSegments(value) !== null;
}

export function isSafeDashboardExpression(
    value: string,
    roots: readonly string[],
    pathRequired = false,
): boolean {
    const match = EXPRESSION.exec(value);
    if (!match || !roots.includes(match[1]!)) return false;
    const path = match[2];
    return path === undefined ? !pathRequired : isSafeDashboardPath(path);
}
