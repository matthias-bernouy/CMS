type ObjectValue = Record<string, unknown>;

export const presentationAttributes = [
    "grid-gap",
    "grid-max",
    "grid-min",
    "grid-packing",
    "page-size",
    "scroll-on-page-change",
];

export function offerListPresentation(host: HTMLElement, value: unknown, offset: number): Record<string, unknown> {
    const response = objectValue(value) || {};
    const pageSize = positiveInteger(host.getAttribute("page-size"), 12);
    return {
        gridGap: host.getAttribute("grid-gap") || "md",
        gridMax: host.getAttribute("grid-max") || "lg",
        gridMin: host.getAttribute("grid-min") || "md",
        gridPacking: host.getAttribute("grid-packing") || "fill",
        items: objectValues(response.items),
        page: Math.floor(offset / pageSize) + 1,
        pageSize,
        total: nonNegativeInteger(response.total),
        wholeUnitPrices: response.wholeUnitPrices === true,
    };
}

function positiveInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}

function objectValues(value: unknown): ObjectValue[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item): item is ObjectValue => item !== null) : [];
}

function nonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
