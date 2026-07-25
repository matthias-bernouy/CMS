export type DimensionBinding = { kind: "absent" | "blocked" } | { kind: "resolved"; value: number };

export function dimensionBinding(value: string | null): DimensionBinding {
    if (value === null) {
        return { kind: "absent" };
    }
    const normalized = value.trim();
    if (normalized.toLowerCase() === "null") {
        return { kind: "absent" };
    }
    if (!normalized || hasUnresolvedBinding(normalized)) {
        return { kind: "blocked" };
    }
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? { kind: "resolved", value: parsed } : { kind: "blocked" };
}

export function boundSourceUrl(image: HTMLImageElement): string {
    const attribute = image.hasAttribute("data-cms-src") ? "data-cms-src" : "data-src";
    return image.getAttribute(attribute)?.trim() ?? "";
}

export function isEmptyBinding(value: string | null): boolean {
    return value !== null && value.trim().length === 0;
}

export function isResolved(value: string): boolean {
    return value.length > 0 && !value.includes("{{");
}

export function hasUnresolvedBinding(value: string | undefined): boolean {
    return value?.includes("{{") ?? false;
}
