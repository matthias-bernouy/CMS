import type { BrowserPerformanceCase } from "../contracts";

export function requestMismatches(
    requests: string[],
    expectedWidths: Record<"narrow" | "wide", number | null>,
): number {
    const matched = new Set<number>();
    let mismatches = 0;
    for (const slot of imageSlots()) {
        const indices = requests.flatMap((request, index) => (slotFromUrl(request) === slot ? [index] : []));
        for (const index of indices) {
            matched.add(index);
        }
        if (indices.length !== 1 || !matchesExpectedUrl(requests[indices[0]!] ?? "", slot, expectedWidths[slot])) {
            mismatches++;
        }
    }
    return mismatches + requests.filter((_request, index) => !matched.has(index)).length;
}

export function responseCaptureMismatches(
    requests: BrowserPerformanceCase["requests"],
    captures: BrowserPerformanceCase["responseCaptures"],
    images: BrowserPerformanceCase["images"],
): number {
    const consumed = new Set<number>();
    let mismatches = 0;
    for (const request of requests) {
        const index = captures.findIndex(
            (capture, captureIndex) =>
                !consumed.has(captureIndex) && normalizedFixtureUrl(capture.url) === normalizedFixtureUrl(request),
        );
        if (index < 0) {
            mismatches++;
            continue;
        }
        consumed.add(index);
        const bodyBytes = captures[index]!.bodyBytes;
        if (!Number.isSafeInteger(bodyBytes) || bodyBytes! <= 0) {
            mismatches++;
        }
    }
    mismatches += captures.length - consumed.size;
    for (const slot of imageSlots()) {
        const matching = captures.filter(
            (capture) => normalizedFixtureUrl(capture.url) === normalizedFixtureUrl(images[slot].currentSrc),
        );
        if (
            matching.length !== 1 ||
            matching[0]!.responseStatus !== images[slot].responseStatus ||
            normalizedContentType(matching[0]!.responseContentType) !==
                normalizedContentType(images[slot].responseContentType)
        ) {
            mismatches++;
        }
    }
    return mismatches;
}

export function doubleFetches(requests: string[]): number {
    return imageSlots().reduce((count, slot) => {
        const requestsForSlot = requests.filter((request) => slotFromUrl(request) === slot).length;
        return count + Math.max(0, requestsForSlot - 1);
    }, 0);
}

function normalizedFixtureUrl(value: string): string {
    const url = new URL(value, "http://fixture.invalid");
    return `${url.pathname}${url.search}`;
}

function normalizedContentType(value: string | null): string | null {
    return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

export function matchesExpectedUrl(urlValue: string, slot: string, width: number | null): boolean {
    if (!urlValue) {
        return false;
    }
    const url = new URL(urlValue, "http://fixture.invalid");
    return width === null
        ? url.pathname === `/image/${slot}` && !url.search
        : url.pathname === `/.cms/image/performance/image/${slot}/${width}.webp` && !url.search;
}

function slotFromUrl(value: string): string | null {
    const pathname = new URL(value, "http://fixture.invalid").pathname;
    return (
        /^\/image\/(narrow|wide)$/.exec(pathname)?.[1] ??
        /^\/\.cms\/image\/performance\/image\/(narrow|wide)\/\d+\.webp$/.exec(pathname)?.[1] ??
        null
    );
}

function imageSlots(): Array<"narrow" | "wide"> {
    return ["narrow", "wide"];
}
