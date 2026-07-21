export function matchPattern(pattern: string, value: string): string | undefined {
    const wildcardIndex = pattern.indexOf("*");
    if (wildcardIndex < 0) return pattern === value ? "" : undefined;
    const prefix = pattern.slice(0, wildcardIndex);
    const suffix = pattern.slice(wildcardIndex + 1);
    if (!value.startsWith(prefix) || !value.endsWith(suffix)) return undefined;
    return value.slice(prefix.length, value.length - suffix.length);
}
