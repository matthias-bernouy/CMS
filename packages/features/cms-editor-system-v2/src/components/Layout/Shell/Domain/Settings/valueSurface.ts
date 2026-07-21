const VALUE_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function hasStandardValueSurface(target: HTMLElement): boolean {
    if (!("value" in target)) {
        return false;
    }

    try {
        const value = (target as { value: unknown }).value;
        (target as { value: unknown }).value = value;
        return typeof value === "string";
    } catch {
        return false;
    }
}

export function valueSurfaceName(target: HTMLElement): string {
    const propertyName = "name" in target ? (target as { name?: unknown }).name : undefined;
    return String(
        typeof propertyName === "string" ? propertyName : (target.getAttribute("name") ?? target.id ?? ""),
    ).trim();
}

export function isValidValueKey(value: string): boolean {
    return VALUE_KEY_PATTERN.test(value.trim());
}
